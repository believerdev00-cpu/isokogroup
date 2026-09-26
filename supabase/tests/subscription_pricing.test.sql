-- Regression test for 20260926100000_subscription_pricing.sql, run against the
-- local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/subscription_pricing.test.sql
--
-- The billing rule: sign in -> 5-minute trial -> locked -> 50 RWF for the first
-- month -> 200 RWF for every month after. Time passing is simulated by moving
-- the subscription's dates back. Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000e7', 'sub-new@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e8', 'sub-finance@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e9', 'sub-admin@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000e8', 'finance'), ('00000000-0000-4000-8000-0000000000e9', 'admin');
-- the shipped defaults, whatever this database was set to
UPDATE public.platform_settings SET value = '5' WHERE key = 'subscription_trial_minutes';
UPDATE public.platform_settings SET value = '50' WHERE key = 'subscription_first_month_price';
UPDATE public.platform_settings SET value = '200' WHERE key = 'subscription_monthly_price';

\set me '''00000000-0000-4000-8000-0000000000e7'''
\set finance '''00000000-0000-4000-8000-0000000000e8'''
\set admin '''00000000-0000-4000-8000-0000000000e9'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Runs p_sql as p_user (NULL: anonymous visitor) and returns its jsonb result (NULL if refused)
CREATE FUNCTION pg_temp.as_(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.state(p_user text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.as_(p_user, 'SELECT public.subscription_state()');
$$;
CREATE FUNCTION pg_temp.paid(p_user uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT (public.finance_totals_for('subscriptions', (SELECT id FROM public.subscriptions WHERE user_id = p_user)) ->> 'paid')::numeric;
$$;

-- ---------- Visitors ----------
SELECT pg_temp.expect(pg_temp.state(NULL) @> '{"signed_in":false,"trial_minutes":5,"first_month_price":50,"monthly_price":200}',
  'a visitor sees the prices (5-minute trial, 50 RWF first month, then 200 RWF)');
SELECT pg_temp.expect(NOT pg_temp.state(NULL) ? 'has_access', 'and nothing about anyone''s account');
SELECT pg_temp.expect(pg_temp.as_(NULL, 'SELECT to_jsonb(public.start_trial())') IS NULL, 'a visitor can''t start a trial');

-- ---------- Sign in: 5-minute trial ----------
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"status":"none","has_access":false,"next_price":50}',
  'a new account has no subscription yet');
SELECT pg_temp.as_(:me, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect((SELECT status = 'trial' AND trial_ends_at BETWEEN now() + interval '4 minutes 59 seconds' AND now() + interval '5 minutes 1 second'
  FROM public.subscriptions WHERE user_id = :me), 'the first sign-in starts a 5-minute trial');
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"status":"trial","has_access":true}'
  AND (pg_temp.state(:me) ->> 'seconds_left')::int BETWEEN 295 AND 300, 'during the trial: access, about 300 seconds left');
SELECT pg_temp.as_(:me, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect((SELECT count(*) FROM public.subscriptions WHERE user_id = :me) = 1
  AND (SELECT trial_ends_at <= now() + interval '5 minutes' FROM public.subscriptions WHERE user_id = :me),
  'signing in again doesn''t give a second trial');

-- ---------- 5 minutes later: locked ----------
UPDATE public.subscriptions SET trial_ends_at = now() - interval '1 second' WHERE user_id = :me;
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"status":"expired","has_access":false,"next_price":50}'
  AND coalesce(pg_temp.state(:me) -> 'seconds_left', 'null'::jsonb) = 'null'::jsonb,
  'after 5 minutes: no access, the first month costs 50 RWF');
SELECT pg_temp.expect(pg_temp.as_(:me, 'SELECT to_jsonb(public.has_active_subscription())') = 'false',
  'the database locks the member content too (library files)');

-- ---------- First month: 50 RWF ----------
SELECT pg_temp.as_(:me, $$SELECT to_jsonb(public.submit_subscription_payment('MP-SUBP-001'))$$);
SELECT pg_temp.expect((public.finance_totals_for('subscriptions', (SELECT id FROM public.subscriptions WHERE user_id = :me)) ->> 'charged')::numeric = 50
  AND (SELECT amount FROM public.subscriptions WHERE user_id = :me) = 50,
  'the first month is charged 50 RWF, decided by the database');
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"has_access":false,"payment_pending":true}',
  'still locked while the payment is checked');
SELECT pg_temp.as_(:finance, $$SELECT to_jsonb(public.activate_subscription((SELECT id FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-0000000000e7')))$$);
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"status":"active","has_access":true,"next_price":200}'
  AND pg_temp.paid(:me) = 50, 'confirmed: a month of access; the next month will cost 200 RWF');

-- ---------- A month later: 200 RWF ----------
UPDATE public.subscriptions SET expires_at = now() - interval '1 second' WHERE user_id = :me;
SELECT pg_temp.expect(pg_temp.state(:me) @> '{"status":"expired","has_access":false,"next_price":200}',
  'the month is over: locked again, 200 RWF to continue');
SELECT pg_temp.as_(:me, $$SELECT to_jsonb(public.submit_subscription_payment('MP-SUBP-002'))$$);
SELECT pg_temp.expect((SELECT amount FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
    WHERE a.entity_id = (SELECT id FROM public.subscriptions WHERE user_id = :me) AND l.kind = 'charge' ORDER BY l.id DESC LIMIT 1) = 200,
  'the second month is charged 200 RWF');
SELECT pg_temp.as_(:finance, $$SELECT to_jsonb(public.activate_subscription((SELECT id FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-0000000000e7')))$$);
SELECT pg_temp.expect(pg_temp.paid(:me) = 250 AND pg_temp.state(:me) @> '{"has_access":true,"next_price":200}',
  'confirmed: 250 RWF paid in all (50 + 200), and every month after costs 200');

-- ---------- Nobody chooses their own price ----------
SELECT pg_temp.expect(pg_temp.as_(:me, $$UPDATE public.subscriptions SET amount = 1, status = 'active', expires_at = now() + interval '1 year'
  WHERE user_id = '00000000-0000-4000-8000-0000000000e7' RETURNING to_jsonb(amount)$$) IS NULL
  OR (SELECT amount FROM public.subscriptions WHERE user_id = :me) = 200,
  'a customer can''t change their subscription''s price or dates');

-- ---------- Admins and settings ----------
SELECT pg_temp.expect(pg_temp.state(:admin) @> '{"exempt":true,"has_access":true}', 'admins always have access');
UPDATE public.platform_settings SET value = '10' WHERE key = 'subscription_trial_minutes';
UPDATE public.platform_settings SET value = '75' WHERE key = 'subscription_first_month_price';
SELECT pg_temp.expect(pg_temp.state(NULL) @> '{"trial_minutes":10,"first_month_price":75}',
  'the trial length and prices are settings admins can change');

ROLLBACK;

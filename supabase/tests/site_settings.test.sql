-- Regression test for 20260930120000_site_settings.sql (company details,
-- payment accounts, social links and commission edited by admins):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/site_settings.test.sql
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000d501', 'ss-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d502', 'ss-user@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d503', 'ss-seller@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000d501', 'admin'), ('00000000-0000-4000-8000-00000000d503', 'seller');
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at)
VALUES ('00000000-0000-4000-8000-00000000d502', 'trial', 'trial', now(), now() + interval '1 day');
SELECT set_config('isoko.subscription_internal', '', true);

\set admin '''00000000-0000-4000-8000-00000000d501'''
\set user '''00000000-0000-4000-8000-00000000d502'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN false;
END $$;
CREATE FUNCTION pg_temp.setting(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT value FROM public.platform_settings WHERE key = p_key;
$$;

-- ---------- What visitors see ----------
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, 'SELECT public.site_settings()'), 'visitors can read the public settings');
SELECT pg_temp.expect(public.site_settings() ?& ARRAY['company_email', 'company_phones', 'company_momo_code', 'bank_account_number',
                                                     'social_links', 'marketplace_commission_percent', 'whatsapp_office', 'whatsapp_ict'],
  'the public settings include contacts, payment accounts, social links and the commission');
SELECT pg_temp.expect(NOT (public.site_settings() ?| ARRAY['site_url', 'rate_limit_multiplier', 'mobile_money']),
  'and nothing internal (site address, rate limits, switches)');
SELECT pg_temp.expect(jsonb_typeof(public.site_settings() -> 'company_phones') = 'array'
  AND jsonb_array_length(public.site_settings() -> 'social_links') = 10, 'phones and social links come as lists (seeded from the old footer)');

-- ---------- Who can change them ----------
SELECT pg_temp.expect(pg_temp.refused(:user, $$UPDATE public.platform_settings SET value = '0' WHERE key = 'marketplace_commission_percent' RETURNING 1$$)
  OR pg_temp.setting('marketplace_commission_percent') = '7', 'a customer can''t change a setting');
SELECT pg_temp.expect(pg_temp.setting('marketplace_commission_percent') = '7', '(still 7%)');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = '10' WHERE key = 'marketplace_commission_percent'$$)
  AND pg_temp.setting('marketplace_commission_percent') = '10', 'an admin sets the commission to 10%');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'platform_settings'
  AND actor_id::text = :admin AND new_data ->> 'value' = '10'), 'the change is in the audit log, with who made it');

-- ---------- Values that would break the site are refused ----------
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = '300' WHERE key = 'marketplace_commission_percent'$$),
  'a 300% commission is refused');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = 'fifty' WHERE key = 'subscription_monthly_price'$$),
  'a price that isn''t a number is refused');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = 'not-an-email' WHERE key = 'company_email'$$),
  'an invalid email is refused');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = '[{"network":"youtube","label":"X","url":"javascript:alert(1)"}]' WHERE key = 'social_links'$$),
  'a social link that isn''t https is refused');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = '+250 788-111-222' WHERE key = 'whatsapp_office'$$)
  AND pg_temp.setting('whatsapp_office') = '250788111222', 'a WhatsApp number is stored the way wa.me links need it');
-- (the check is its own statement: a function in the same SELECT could run before the update)
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.platform_settings SET value = '["0788 000 111"]' WHERE key = 'company_phones'$$),
  'an admin edits the phone list');
SELECT pg_temp.expect(public.site_settings() -> 'company_phones' = '["0788 000 111"]'::jsonb, 'and the site shows the new list');

-- ---------- Checkout charges the commission set here ----------
INSERT INTO public.products (id, seller_id, name, price, category, stock)
VALUES ('00000000-0000-4000-8000-00000000d5a1', '00000000-0000-4000-8000-00000000d503', 'SS widget', 1000, 'x', 5);
SELECT pg_temp.expect(NOT pg_temp.refused(:user, $$SELECT public.place_order('[{"product_id":"00000000-0000-4000-8000-00000000d5a1","quantity":2}]'::jsonb, 'Kigali', 'momo', 'SS-ORDER-1')$$),
  'a customer places an order');
SELECT pg_temp.expect((SELECT commission_rate = 10 AND commission_amount = 200 FROM public.commissions c JOIN public.orders o ON o.id = c.order_id
                       WHERE o.buyer_id = :user), 'the order''s commission is 10% (200 of 2,000)');

ROLLBACK;

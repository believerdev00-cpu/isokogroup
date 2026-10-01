-- Regression test for subscriptions paid by MoMo and confirmed by hand
-- (20260930100000_subscription_manual_momo.sql), run as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/subscription_access.test.sql
--
-- The rule: sign in -> 10-minute trial -> 50 RWF for 7 days -> 200 RWF per
-- calendar month; every period starts only when an admin or finance officer
-- confirms the customer's reported payment. Time passing is simulated by
-- moving the subscription's dates back. Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000c501', 'sa-cust@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c502', 'sa-cust2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c503', 'sa-finance@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c504', 'sa-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c505', 'sa-seller@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000c503', 'finance'), ('00000000-0000-4000-8000-00000000c504', 'admin'),
  ('00000000-0000-4000-8000-00000000c505', 'seller');
-- the shipped prices, whatever this database was set to
UPDATE public.platform_settings SET value = '10' WHERE key = 'subscription_trial_minutes';
UPDATE public.platform_settings SET value = '50' WHERE key = 'subscription_first_week_price';
UPDATE public.platform_settings SET value = '7' WHERE key = 'subscription_first_period_days';
UPDATE public.platform_settings SET value = '200' WHERE key = 'subscription_monthly_price';
UPDATE public.platform_settings SET value = '1' WHERE key = 'subscription_period_months';
-- links in messages need a site address; e-mails are queued, not sent
INSERT INTO public.platform_settings (key, value) VALUES ('site_url', 'https://isoko.test')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

\set cust '''00000000-0000-4000-8000-00000000c501'''
\set cust2 '''00000000-0000-4000-8000-00000000c502'''
\set finance '''00000000-0000-4000-8000-00000000c503'''
\set admin '''00000000-0000-4000-8000-00000000c504'''
\set seller '''00000000-0000-4000-8000-00000000c505'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Runs p_sql as p_user ('service': the service role; NULL: a visitor); true if refused
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN v_role = 'authenticated'
    THEN json_build_object('sub', p_user, 'role', v_role)::text ELSE json_build_object('role', v_role)::text END, true);
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
-- p_sql's jsonb result, as p_user (NULL if refused)
CREATE FUNCTION pg_temp.as_(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
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
CREATE FUNCTION pg_temp.sub(p_user uuid) RETURNS public.subscriptions LANGUAGE sql AS $$
  SELECT * FROM public.subscriptions WHERE user_id = p_user;
$$;
-- The clock moves: shift the subscription's dates (as the database owner would in a test)
CREATE FUNCTION pg_temp.set_dates(p_user uuid, p_trial_expires timestamptz, p_expires timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('isoko.subscription_internal', 'on', true);
  UPDATE public.subscriptions SET trial_expires_at = coalesce(p_trial_expires, trial_expires_at),
                                  expires_at = coalesce(p_expires, expires_at)
  WHERE user_id = p_user;
  PERFORM set_config('isoko.subscription_internal', '', true);
END $$;
CREATE FUNCTION pg_temp.inbox(p_user uuid, p_type text) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.notifications WHERE user_id = p_user AND event_type = p_type;
$$;
CREATE FUNCTION pg_temp.emails(p_user uuid, p_type text) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE d.recipient_user_id = p_user AND d.channel = 'email' AND e.event_type = p_type;
$$;
-- the plan the customer chooses: 7 days for the small amounts, else the month (or as given)
CREATE FUNCTION pg_temp.pay(p_user text, p_amount numeric, p_ref text, p_plan text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN (pg_temp.as_(p_user, format(
    $q$SELECT to_jsonb(public.submit_subscription_payment(%L, 'Jean Payer', %L, NULL, %s))$q$,
    coalesce(p_plan, CASE WHEN p_amount <= 50 THEN 'week' ELSE 'monthly' END), p_ref, p_amount)) ->> 'id')::uuid;
END $$;
CREATE FUNCTION pg_temp.payment(p_id uuid) RETURNS public.subscription_payments LANGUAGE sql AS $$
  SELECT * FROM public.subscription_payments WHERE id = p_id;
$$;

-- A product and a seller for the member-table checks
INSERT INTO public.products (id, seller_id, name, price, category, stock)
VALUES ('00000000-0000-4000-8000-00000000c5a1', :seller, 'SA widget', 1000, 'x', 50);

-- ================= TRIAL =================
SELECT pg_temp.expect((pg_temp.as_(NULL, 'SELECT 1') IS NULL OR true)
  AND NOT (SELECT (public.subscription_state() ->> 'signed_in')::boolean), 'a visitor is not signed in');
SELECT pg_temp.expect(pg_temp.as_(:cust, 'SELECT to_jsonb(public.start_trial())') IS NOT NULL, 'the first sign-in starts the trial');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'trial' AND (pg_temp.sub(:cust)).plan = 'trial'
  AND (pg_temp.sub(:cust)).trial_expires_at - (pg_temp.sub(:cust)).trial_started_at = interval '10 minutes'
  AND (pg_temp.sub(:cust)).trial_started_at BETWEEN now() - interval '1 second' AND now() + interval '1 second',
  'the trial lasts exactly 10 minutes from the server''s clock');
SELECT pg_temp.as_(:cust, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect((SELECT count(*) FROM public.subscriptions WHERE user_id = :cust) = 1
  AND (pg_temp.sub(:cust)).trial_expires_at - (pg_temp.sub(:cust)).trial_started_at = interval '10 minutes',
  'signing in again gives no second trial');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'TRIAL_STARTED') = 1 AND pg_temp.emails(:cust, 'TRIAL_STARTED') = 1,
  'trial started: in-app message and e-mail');
SELECT pg_temp.expect((pg_temp.state(:cust) ->> 'has_access')::boolean AND pg_temp.state(:cust) ->> 'status' = 'trial'
  AND (pg_temp.state(:cust) ->> 'seconds_left')::int BETWEEN 590 AND 600,
  'the site sees the trial and the seconds left (countdown)');
SELECT pg_temp.expect(NOT pg_temp.refused(:cust, $$INSERT INTO public.cart_items (user_id, product_id) VALUES (auth.uid(), '00000000-0000-4000-8000-00000000c5a1')$$),
  'during the trial: full access (cart)');
SELECT pg_temp.expect(NOT pg_temp.refused(:cust, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'A', 'B')$$),
  'during the trial: full access (logistics)');

-- about 2 minutes left
SELECT pg_temp.set_dates(:cust, now() + interval '110 seconds', NULL);
SELECT pg_temp.state(:cust);
SELECT pg_temp.state(:cust);
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'TRIAL_ENDING_SOON') = 1 AND pg_temp.emails(:cust, 'TRIAL_ENDING_SOON') = 1,
  'trial ending in 2 minutes: one in-app message and one e-mail, however often the site asks');

-- the trial ends
SELECT pg_temp.set_dates(:cust, now() - interval '1 second', NULL);
SELECT pg_temp.expect(NOT public.has_active_access(:cust::uuid), 'an ended trial gives no access, even before any sweep');
SELECT pg_temp.expect(NOT pg_temp.refused('service', 'SELECT public.subscription_sweep()'), 'the server runs the sweep');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'expired', 'the sweep marks the trial expired');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'TRIAL_EXPIRED') = 1 AND pg_temp.emails(:cust, 'TRIAL_EXPIRED') = 1,
  'trial expired: in-app message and e-mail');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.state(:cust);
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'TRIAL_EXPIRED') = 1 AND pg_temp.emails(:cust, 'TRIAL_EXPIRED') = 1,
  'no duplicate expiry message');
SELECT pg_temp.expect(NOT (pg_temp.state(:cust) ->> 'has_access')::boolean AND pg_temp.state(:cust) ->> 'ended' = 'trial'
  AND pg_temp.state(:cust) ->> 'next_plan' = 'week' AND (pg_temp.state(:cust) ->> 'next_price')::numeric = 50,
  'after the trial: 50 RWF for 7 days is offered');

-- expired: the APIs refuse, whatever the page shows
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.cart_items (user_id, product_id) VALUES (auth.uid(), '00000000-0000-4000-8000-00000000c5a1')$$)
  AND current_setting('isoko.last_error') LIKE 'Your access has ended%', 'expired: the cart API refuses');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'A', 'B')$$),
  'expired: the logistics API refuses');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$SELECT public.place_order('[{"product_id":"00000000-0000-4000-8000-00000000c5a1","quantity":1}]'::jsonb, 'Kigali', 'momo', 'MP-ORDER-SA1')$$),
  'expired: placing an order refuses');
-- (applying as a seller needs no running access any more: the seller plan includes it; seller_subscription.test.sql)
SELECT pg_temp.expect((SELECT NOT public.has_active_subscription() FROM (SELECT set_config('request.jwt.claims',
  json_build_object('sub', :cust, 'role', 'authenticated')::text, true)) x),
  'expired: no library or film files (the storage rule''s check)');
SELECT set_config('request.jwt.claims', '', true);

-- ================= 50 RWF FOR 7 DAYS =================
SELECT pg_temp.expect(pg_temp.pay(:cust, 200, 'MP-WEEK-0001', 'week') IS NULL
  AND current_setting('isoko.last_error') LIKE 'This payment is 50 RWF%', 'the customer can''t choose the price (200 instead of 50)');
SELECT pg_temp.expect(pg_temp.pay(:cust, 20, 'MP-WEEK-0001') IS NULL, 'nor pay less');
SELECT pg_temp.expect(pg_temp.as_(:cust, $$SELECT to_jsonb(public.submit_subscription_payment('week', '', 'MP-WEEK-0001'))$$) IS NULL,
  'the payer''s name is required');
SELECT pg_temp.expect(pg_temp.as_(:cust, $$SELECT to_jsonb(public.submit_subscription_payment('week', 'Jean Payer'))$$) IS NULL
  AND current_setting('isoko.last_error') LIKE 'Enter the transaction ID, or add a screenshot%', 'a transaction ID or a screenshot is required');
SELECT pg_temp.expect(pg_temp.as_(:cust, $$SELECT to_jsonb(public.submit_subscription_payment('week', 'Jean Payer', NULL, '00000000-0000-4000-8000-00000000c502/fake.png'))$$) IS NULL,
  'someone else''s (or a missing) screenshot is refused');
SELECT set_config('sa.p1', pg_temp.pay(:cust, 50, 'MP-WEEK-0001')::text, true);
SELECT pg_temp.expect((pg_temp.payment(current_setting('sa.p1')::uuid)).status = 'pending'
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).amount = 50
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).plan = 'week'
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).payer_name = 'Jean Payer', 'the report is stored pending: 50 RWF, 7 days, the payer''s name');
SELECT pg_temp.expect(NOT public.has_active_access(:cust::uuid) AND (pg_temp.state(:cust) ->> 'payment_pending')::boolean,
  'a pending payment gives no access');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_PAYMENT_PENDING') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_PAYMENT_PENDING') = 1,
  'payment pending: in-app message and e-mail');
SELECT pg_temp.expect(pg_temp.inbox(:finance, 'PAYMENT_REPORTED') = 1, 'finance staff hear about the report');
SELECT pg_temp.expect(pg_temp.pay(:cust, 50, 'MP-WEEK-0002') IS NULL, 'one report waits at a time');

-- the customer tries to get around the admin
SELECT pg_temp.expect(pg_temp.refused(:cust, format($$UPDATE public.subscription_payments SET status = 'confirmed' WHERE id = %L$$, current_setting('sa.p1'))),
  'the customer can''t confirm their own payment in the table');
SELECT pg_temp.expect(pg_temp.refused(:cust, format($$UPDATE public.subscription_payments SET amount = 200 WHERE id = %L$$, current_setting('sa.p1'))),
  'nor change its amount');
SELECT pg_temp.expect(pg_temp.refused(:cust, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p1'))),
  'nor confirm it through the API');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$UPDATE public.subscriptions SET status = 'active', expires_at = now() + interval '1 year' WHERE user_id = auth.uid()$$),
  'nor activate or extend the subscription');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.subscriptions (user_id, status, plan, expires_at) VALUES (auth.uid(), 'active', 'monthly', now() + interval '1 year')$$),
  'nor create an active subscription');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.subscription_payments (subscription_id, user_id, plan, amount, reference, reference_key, status)
  SELECT id, user_id, 'week', 50, 'FAKE-1', 'FAKE1', 'confirmed' FROM public.subscriptions WHERE user_id = auth.uid()$$),
  'nor write a confirmed payment');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$SELECT public.activate_subscription((SELECT id FROM public.subscriptions WHERE user_id = auth.uid()))$$),
  'nor call the old activation');
SELECT pg_temp.expect(pg_temp.refused(:cust, 'SELECT public.subscription_sweep()'), 'nor run the sweep');
SELECT pg_temp.expect(pg_temp.refused(:cust, format($$SELECT public.has_active_access(%L::uuid)$$, :admin)),
  'nor ask about someone else''s access');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')$$),
  'nor make themselves admin');
SELECT pg_temp.expect(pg_temp.refused(:cust, 'SELECT public.subscription_payments_list()'), 'nor list other people''s payments');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.subscriptions SET expires_at = now() + interval '1 year' WHERE user_id = '00000000-0000-4000-8000-00000000c501'$$),
  'admins can''t edit subscription dates directly either');
SELECT pg_temp.expect(pg_temp.refused(:finance, format($$SELECT public.finance_verify_submission(%L)$$,
    (pg_temp.payment(current_setting('sa.p1')::uuid)).submission_id))
  AND current_setting('isoko.last_error') LIKE '%subscription payments list%',
  'the generic finance screen can''t settle a subscription report behind its back');

-- the same transaction ID elsewhere
SELECT pg_temp.as_(:cust2, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect(pg_temp.pay(:cust2, 50, 'mp week 0001') IS NULL
  AND current_setting('isoko.last_error') LIKE '%already used%', 'another customer can''t reuse the reference (any spacing or case)');

-- the admin list
SELECT pg_temp.expect(pg_temp.as_(:finance, $$SELECT jsonb_agg(to_jsonb(l)) FROM public.subscription_payments_list('pending') l$$) @>
  jsonb_build_array(jsonb_build_object('customer_email', 'sa-cust@test.local', 'plan', 'week', 'amount', 50,
    'payer_name', 'Jean Payer', 'reference', 'MP-WEEK-0001', 'status', 'pending')),
  'finance sees the pending report: customer, e-mail, plan, amount, number, reference');

-- confirmed
SELECT pg_temp.expect(NOT pg_temp.refused(:finance, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p1'))),
  'finance confirms the 50 RWF payment');
SELECT pg_temp.expect((pg_temp.payment(current_setting('sa.p1')::uuid)).status = 'confirmed'
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).confirmed_by = :finance
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).confirmed_at IS NOT NULL
  AND (pg_temp.payment(current_setting('sa.p1')::uuid)).payment_id IS NOT NULL, 'who confirmed it and when are recorded');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'active' AND (pg_temp.sub(:cust)).plan = 'week'
  AND (pg_temp.sub(:cust)).expires_at - (pg_temp.sub(:cust)).starts_at = interval '7 days'
  AND (pg_temp.sub(:cust)).starts_at BETWEEN now() - interval '1 second' AND now() + interval '1 second',
  'the 7 days start at confirmation and last exactly 7 days');
SELECT pg_temp.expect(public.has_active_access(:cust::uuid)
  AND NOT pg_temp.refused(:cust, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'C', 'D')$$),
  'full access again');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_WEEK_ACTIVATED') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_WEEK_ACTIVATED') = 1
  AND (SELECT body LIKE '50 RWF payment confirmed. Your 7-day full-access subscription is now active%'
       FROM public.notifications WHERE user_id = :cust AND event_type = 'SUBSCRIPTION_WEEK_ACTIVATED'),
  'confirmation: in-app message and e-mail ("50 RWF payment confirmed ...")');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'PAYMENT_SUCCESSFUL') = 0, 'no second, generic "payment successful" message');
SELECT pg_temp.expect((public.finance_totals_for('subscriptions', (pg_temp.sub(:cust)).id) ->> 'paid')::numeric = 50,
  'the 50 RWF is on the finance ledger');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'subscription_payments'
  AND entity_id::text = current_setting('sa.p1') AND actor_id::text = :finance), 'the audit log names the confirming officer');
SELECT pg_temp.expect(pg_temp.refused(:finance, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p1'))),
  'a payment is confirmed once (no second period from a double click)');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$SELECT public.activate_subscription((SELECT id FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-00000000c501'))$$),
  'no free time: activation needs a waiting payment');
SELECT pg_temp.expect(pg_temp.pay(:cust2, 50, 'MP-WEEK-0001') IS NULL, 'a confirmed reference can''t be used again');

-- reminders
SELECT pg_temp.set_dates(:cust, NULL, now() + interval '23 hours');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_WEEK_ENDING') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_WEEK_ENDING') = 1,
  '24 hours before: one reminder, in-app and e-mail');
SELECT pg_temp.set_dates(:cust, NULL, now() + interval '50 minutes');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_WEEK_ENDING') = 2 AND pg_temp.emails(:cust, 'SUBSCRIPTION_WEEK_ENDING') = 2,
  '1 hour before: a second reminder');
-- an e-mail that fails changes nothing about the subscription (the sender claims it, then reports)
SELECT pg_temp.refused('service', $$SELECT count(*) FROM public.notification_claim(500)$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT d.id FROM public.notification_deliveries d
  JOIN public.notification_events e ON e.id = d.event_id WHERE d.recipient_user_id = '00000000-0000-4000-8000-00000000c501'
  AND e.event_type = 'SUBSCRIPTION_WEEK_ENDING' AND d.channel = 'email' LIMIT 1), false, 'smtp', NULL, 'Mailbox unavailable', false)$$);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_deliveries WHERE recipient_user_id = :cust AND status = 'failed')
  AND (pg_temp.sub(:cust)).status = 'active' AND public.has_active_access(:cust::uuid),
  'a failed e-mail is recorded as failed and leaves the subscription alone');

-- 7 days are over
SELECT pg_temp.set_dates(:cust, NULL, now() - interval '1 second');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'expired' AND NOT public.has_active_access(:cust::uuid),
  '7-day access expires');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_WEEK_EXPIRED') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_WEEK_EXPIRED') = 1
  AND (SELECT body LIKE 'Your 7-day access has expired. Pay 200 RWF%' FROM public.notifications
       WHERE user_id = :cust AND event_type = 'SUBSCRIPTION_WEEK_EXPIRED'),
  '7-day expiry: in-app message and e-mail offering 200 RWF a month');
SELECT pg_temp.expect(pg_temp.state(:cust) ->> 'ended' = 'week' AND pg_temp.state(:cust) ->> 'next_plan' = 'monthly'
  AND (pg_temp.state(:cust) ->> 'next_price')::numeric = 200, 'next: 200 RWF for a month');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'A', 'B')$$),
  'expired again: the APIs refuse');

-- ================= 200 RWF A MONTH =================
SELECT pg_temp.expect(pg_temp.state(:cust) -> 'plans' @> '[{"plan": "week", "price": 50}, {"plan": "monthly", "price": 200}]'
  AND jsonb_array_length(pg_temp.state(:cust) -> 'plans') = 2, 'a normal user chooses 50 RWF for 7 days or 200 RWF for a month');
SELECT pg_temp.expect(pg_temp.pay(:cust, 1500, 'MP-MONTH-0001', 'seller') IS NULL, 'a normal user can''t pay the seller plan');
SELECT pg_temp.expect(pg_temp.pay(:cust, 50, 'MP-MONTH-0001', 'monthly') IS NULL
  AND current_setting('isoko.last_error') LIKE 'This payment is 200 RWF%', 'the month costs 200 RWF, whatever the browser sends');
SELECT set_config('sa.p2', pg_temp.pay(:cust, 200, 'MP-MONTH-0001')::text, true);
SELECT pg_temp.expect((pg_temp.payment(current_setting('sa.p2')::uuid)).status = 'pending'
  AND (pg_temp.payment(current_setting('sa.p2')::uuid)).plan = 'monthly' AND NOT public.has_active_access(:cust::uuid),
  'the 200 RWF report waits, without access');
SELECT pg_temp.expect(pg_temp.refused(:admin, format($$SELECT public.subscription_reject_payment(%L, '')$$, current_setting('sa.p2'))),
  'a rejection needs a reason');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, format($$SELECT public.subscription_reject_payment(%L, 'No such transaction on the company MoMo account')$$, current_setting('sa.p2'))),
  'the admin rejects it');
SELECT pg_temp.expect((pg_temp.payment(current_setting('sa.p2')::uuid)).status = 'rejected'
  AND (pg_temp.payment(current_setting('sa.p2')::uuid)).rejected_by = :admin
  AND (pg_temp.payment(current_setting('sa.p2')::uuid)).rejection_reason = 'No such transaction on the company MoMo account'
  AND NOT public.has_active_access(:cust::uuid) AND (pg_temp.sub(:cust)).status = 'expired',
  'rejected: reason and reviewer recorded, no access');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_PAYMENT_REJECTED') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_PAYMENT_REJECTED') = 1
  AND pg_temp.inbox(:cust, 'PAYMENT_REPORT_REJECTED') = 0, 'rejection: one in-app message and e-mail');
SELECT pg_temp.expect(pg_temp.state(:cust) -> 'last_rejection' ->> 'reason' = 'No such transaction on the company MoMo account',
  'the customer sees why');
SELECT pg_temp.expect(pg_temp.refused(:admin, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p2'))),
  'a rejected payment can''t be confirmed afterwards');

SELECT set_config('sa.p3', pg_temp.pay(:cust, 200, 'MP-MONTH-0002')::text, true);
SELECT pg_temp.expect(current_setting('sa.p3') <> '' AND (public.finance_totals_for('subscriptions', (pg_temp.sub(:cust)).id) ->> 'charged')::numeric = 250,
  'the customer sends corrected details; the month is charged once');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p3'))),
  'the admin confirms the 200 RWF payment');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'active' AND (pg_temp.sub(:cust)).plan = 'monthly'
  AND (pg_temp.sub(:cust)).expires_at = (pg_temp.sub(:cust)).starts_at + interval '1 month'
  AND (pg_temp.payment(current_setting('sa.p3')::uuid)).confirmed_by = :admin, 'a calendar month of access starts');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_MONTH_ACTIVATED') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_MONTH_ACTIVATED') = 1,
  'monthly activation: in-app message and e-mail');
SELECT pg_temp.expect(public.subscription_period_end('monthly', '2027-01-31 10:00+02') = '2027-02-28 10:00+02'
  AND public.subscription_period_end('monthly', '2027-03-15 10:00+02') = '2027-04-15 10:00+02',
  'calendar months: 31 Jan -> 28 Feb, 15 Mar -> 15 Apr');
SELECT pg_temp.expect(pg_temp.refused(:cust, $$UPDATE public.subscriptions SET expires_at = expires_at + interval '1 month' WHERE user_id = auth.uid()$$),
  'the customer can''t extend the month');

-- paying the next month early: it starts when this one ends
SELECT set_config('sa.end1', (pg_temp.sub(:cust)).expires_at::text, true);
SELECT set_config('sa.p4', pg_temp.pay(:cust, 200, 'MP-MONTH-0003')::text, true);
SELECT pg_temp.refused(:finance, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p4')));
SELECT pg_temp.expect((pg_temp.payment(current_setting('sa.p4')::uuid)).period_starts_at = current_setting('sa.end1')::timestamptz
  AND (pg_temp.sub(:cust)).expires_at = current_setting('sa.end1')::timestamptz + interval '1 month',
  'an early renewal starts when the running month ends (no days lost)');

-- the month ends; nothing renews by itself
SELECT pg_temp.set_dates(:cust, NULL, now() + interval '20 hours');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.expect(pg_temp.inbox(:cust, 'SUBSCRIPTION_MONTH_ENDING') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_MONTH_ENDING') = 1,
  'monthly reminder before expiry');
SELECT pg_temp.set_dates(:cust, NULL, now() - interval '1 second');
SELECT pg_temp.refused('service', 'SELECT public.subscription_sweep()');
SELECT pg_temp.expect((pg_temp.sub(:cust)).status = 'expired' AND NOT public.has_active_access(:cust::uuid)
  AND pg_temp.inbox(:cust, 'SUBSCRIPTION_MONTH_EXPIRED') = 1 AND pg_temp.emails(:cust, 'SUBSCRIPTION_MONTH_EXPIRED') = 1,
  'monthly expiry: no access, in-app message and e-mail, no automatic renewal');
SELECT pg_temp.expect(pg_temp.state(:cust) ->> 'next_plan' = 'monthly' AND (pg_temp.state(:cust) ->> 'next_price')::numeric = 200,
  'the monthly option is offered again');

-- ================= STAFF AND SELLERS =================
-- finance's own subscription: someone else confirms it
SELECT pg_temp.as_(:finance, 'SELECT to_jsonb(public.start_trial())');
SELECT set_config('sa.p5', pg_temp.pay(:finance, 50, 'MP-STAFF-0001')::text, true);
SELECT pg_temp.expect(pg_temp.refused(:finance, format($$SELECT public.subscription_confirm_payment(%L)$$, current_setting('sa.p5')))
  AND current_setting('isoko.last_error') LIKE 'Someone else must confirm%', 'staff can''t confirm their own payment');

-- the seller whose access ended can't list products; applying needs access
SELECT pg_temp.as_(:seller, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'SA new', 500, 'x', 1)$$),
  'an approved seller in their trial lists a product');
SELECT pg_temp.set_dates(:seller, now() - interval '1 second', NULL);
SELECT pg_temp.expect(pg_temp.refused(:seller, $$INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'SA new 2', 500, 'x', 1)$$),
  'a seller whose access ended can''t list products');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$UPDATE public.products SET price = 1 WHERE id = '00000000-0000-4000-8000-00000000c5a1'$$),
  'nor edit them');
SELECT pg_temp.expect(NOT pg_temp.refused(:cust2, $$INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number,
    country, tin, business_address, payment_provider, payment_account, payment_account_name, agreement_version)
  VALUES (auth.uid(), 'C2', 'Shop 2', '0788000001', '1198',
    'Rwanda', '123456789', 'Kigali', 'MTN MoMo', '0788000001', 'C2 Seller', public.seller_agreement_version()) $$),
  'a customer in their trial applies as a seller');
SELECT pg_temp.expect(NOT pg_temp.refused(:cust2, $$UPDATE public.seller_applications SET status = 'approved' WHERE user_id = auth.uid()$$)
  AND (SELECT status FROM public.seller_applications WHERE user_id = :cust2) = 'pending'
  AND NOT public.has_role(:cust2::uuid, 'seller'), 'but can''t approve themselves: no seller role');

-- admins keep access without a subscription
SELECT pg_temp.expect(public.has_active_access(:admin::uuid), 'admins always have access');

ROLLBACK;

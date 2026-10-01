-- Regression test for 20260925110100_roles_and_audit_log.sql, run against the
-- local Supabase database as the real 'anon' / 'authenticated' roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/roles_audit.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'ra-user@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'ra-admin@test.local', 'authenticated', 'authenticated');
-- The member services need a running trial or paid period
-- (20260930100000_subscription_manual_momo.sql): the test users are in their trial
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at)
SELECT id, 'trial', 'trial', now(), now() + interval '1 day' FROM auth.users u
WHERE email LIKE '%@test.local' AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id);
SELECT set_config('isoko.subscription_internal', '', true);
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000a2', 'admin');

-- Runs the statement as the given user (NULL = anonymous, 'service' = service
-- role) and reports whether it was refused. Checks after a call are separate
-- statements: a subquery in the same SELECT is evaluated before the call.
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', p_what; END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

-- Rows the given user can see with the query (as that user, under RLS)
CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

\set user '''00000000-0000-4000-8000-0000000000a1'''
\set admin '''00000000-0000-4000-8000-0000000000a2'''

-- ---------- Roles ----------
SELECT pg_temp.expect(pg_temp.refused(:user, $$
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') $$), 'user cannot make themselves admin');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$
  INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000a1', 'driver') $$),
  'even admins change roles only through the role functions');
SELECT pg_temp.expect(pg_temp.refused(:user, $$
  SELECT public.admin_set_driver(auth.uid(), true) $$), 'non-admin cannot make someone a driver');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$
  SELECT public.admin_set_driver('00000000-0000-4000-8000-0000000000a1', true) $$), 'admin makes a user a driver');
SELECT pg_temp.expect(public.has_role(:user, 'driver'), 'the user is now a driver');
SELECT pg_temp.expect(pg_temp.visible(:user, $$SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()$$) = 1,
  'users still see their own roles');
SELECT pg_temp.expect(pg_temp.visible(:admin, $$SELECT 1 FROM public.user_roles WHERE role = 'driver'
  AND user_id = '00000000-0000-4000-8000-0000000000a1'$$) = 1, 'admins see everyone''s roles');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$
  SELECT public.has_role('00000000-0000-4000-8000-0000000000a2', 'admin') $$), 'anonymous callers cannot probe roles');

-- ---------- Seller role follows the application ----------
SELECT pg_temp.refused(:user, $$
  INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number,
    country, tin, business_address, payment_provider, payment_account, payment_account_name, agreement_version)
  VALUES (auth.uid(), 'U', 'Shop', '1', '1',
    'Rwanda', '123456789', 'Kigali', 'MTN MoMo', '0788000000', 'U Seller', public.seller_agreement_version()) $$);
SELECT pg_temp.expect(pg_temp.refused(:user, $$
  INSERT INTO public.products (seller_id, name, price, category) VALUES (auth.uid(), 'RA-1', 100, 'x') $$),
  'no seller role, no product listing');
-- (a seller is approved with a confirmed 1,500 RWF seller subscription payment: 20260930130000)
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscription_payments (subscription_id, user_id, plan, amount, reference, reference_key, status, confirmed_at, period_starts_at, period_ends_at)
SELECT id, user_id, 'seller', 1500, 'RA-SELLER-1', 'RASELLER1', 'confirmed', now(), now(), now() + interval '1 month'
FROM public.subscriptions WHERE user_id = :user;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$
  SELECT public.approve_seller_application((SELECT id FROM public.seller_applications
    WHERE user_id = '00000000-0000-4000-8000-0000000000a1')) $$), 'admin approves the seller application');
SELECT pg_temp.expect(public.has_role(:user, 'seller'), 'approval grants the seller role');
SELECT pg_temp.expect((SELECT role FROM public.profiles WHERE user_id = :user) = 'seller', 'profiles.role mirrors it');
SELECT pg_temp.expect(NOT pg_temp.refused(:user, $$
  INSERT INTO public.products (seller_id, name, price, category) VALUES (auth.uid(), 'RA-1', 100, 'x') $$),
  'seller lists a product');
SELECT pg_temp.refused(:user, $$UPDATE public.profiles SET role = 'buyer' WHERE user_id = auth.uid()$$);
SELECT pg_temp.expect((SELECT role FROM public.profiles WHERE user_id = :user) = 'seller',
  'users cannot change their own profile role');
SELECT pg_temp.refused(:admin, $$
  UPDATE public.seller_applications SET status = 'rejected', rejection_reason = 'Fake ID'
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1' $$);
SELECT pg_temp.expect(NOT public.has_role(:user, 'seller'), 'rejecting the application removes the seller role');
SELECT pg_temp.expect((SELECT role FROM public.profiles WHERE user_id = :user) = 'buyer', 'and the profile shows buyer');
SELECT pg_temp.expect(pg_temp.refused(:user, $$
  INSERT INTO public.products (seller_id, name, price, category) VALUES (auth.uid(), 'RA-2', 100, 'x') $$),
  'a removed seller cannot list products');

-- ---------- Audit log ----------
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'user_roles' AND action = 'insert'
  AND actor_id = :admin AND new_data ->> 'role' = 'driver'), 'role grant logged with the admin as actor');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'user_roles' AND action = 'delete'
  AND old_data ->> 'role' = 'seller' AND old_data ->> 'user_id' = :user), 'seller role removal logged');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'seller_applications' AND action = 'update'
  AND old_data = '{"status": "approved", "rejection_reason": null}'::jsonb
  AND new_data = '{"status": "rejected", "rejection_reason": "Fake ID"}'::jsonb),
  'an update logs only the changed fields, old and new');

SELECT pg_temp.refused(NULL, $$SELECT public.travel_request_trip('{"arrival_date":"2030-01-01","departure_date":"2030-01-03",
  "travelers":1,"needs":["hotel"],"name":"Guest","phone":"1","email":"g@x.co"}'::jsonb)$$);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'travel_trips' AND action = 'insert'
  AND actor_role = 'anon' AND actor_id IS NULL AND new_data ->> 'customer_name' = 'Guest'),
  'a customer-link action is logged as anonymous');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'travel_trips'
  AND (new_data ? 'access_token' OR old_data ? 'access_token')), 'customer link tokens never reach the log');

SELECT set_config('isoko.audit_reason', 'Customer paid in cash at the office', true);
UPDATE public.products SET price = 90 WHERE name = 'RA-1';
SELECT set_config('isoko.audit_reason', '', true);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'products'
  AND reason = 'Customer paid in cash at the office' AND old_data = '{"price": 100}'::jsonb),
  'a reason given by a server function is recorded');

SELECT pg_temp.expect(pg_temp.visible(:user, 'SELECT 1 FROM public.audit_log') = 0, 'non-admins cannot read the audit log');
SELECT pg_temp.expect(pg_temp.visible(:admin, 'SELECT 1 FROM public.audit_log') > 0, 'admins read the audit log');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$
  INSERT INTO public.audit_log (actor_role, action, entity_table) VALUES ('x', 'forged', 'x') $$),
  'admins cannot write to the audit log');
SELECT pg_temp.expect(pg_temp.refused(:user, $$
  SELECT public.audit_event('file.downloaded', 'x', '1') $$), 'users cannot write audit events');
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$
  SELECT public.audit_event('file.downloaded', 'service-files', 'travel/x/client/passport.pdf', '{"service":"travel"}') $$),
  'the service role records an event');
SELECT pg_temp.expect(pg_temp.refused('service', $$ DELETE FROM public.audit_log $$), 'the service role cannot delete the log');
SELECT pg_temp.expect(pg_temp.refused('service', $$ UPDATE public.audit_log SET reason = 'x' $$), 'the service role cannot edit the log');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$ DELETE FROM public.audit_log $$), 'admins cannot delete the log');
DO $$ BEGIN
  DELETE FROM public.audit_log;
  RAISE EXCEPTION 'FAILED: the database owner could delete the log';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  even the database owner cannot delete log rows';
END $$;
DO $$ BEGIN
  TRUNCATE public.audit_log;
  RAISE EXCEPTION 'FAILED: the database owner could truncate the log';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  or truncate the log';
END $$;

ROLLBACK;

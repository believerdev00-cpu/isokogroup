-- One customer can't read another customer's data, table by table, as the
-- website's roles would (row-level security, not the pages' own checks):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/customer_isolation.test.sql
--
-- Customer A gets a record of every kind; customer B and an anonymous visitor
-- must see none of them, and A must see their own (so no check passes because
-- nothing was there). Travel, consultancy and data-analysis records are never
-- read directly by customers: only through their private link (covered by
-- client-services.e2e.mjs) and by that service's staff. Training records are
-- covered by training-api/test/rules.test.ts. Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000a0a1', 'iso-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a0b2', 'iso-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a0c3', 'iso-seller@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a0d4', 'iso-travel@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000a0c3', 'seller'), ('00000000-0000-4000-8000-00000000a0d4', 'travel_staff');

\set a '''00000000-0000-4000-8000-00000000a0a1'''
\set b '''00000000-0000-4000-8000-00000000a0b2'''
\set seller '''00000000-0000-4000-8000-00000000a0c3'''
\set travel '''00000000-0000-4000-8000-00000000a0d4'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', p_what; END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Rows of p_sql visible to p_user (NULL: an anonymous visitor)
CREATE FUNCTION pg_temp.seen(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0; -- no privilege at all: nothing seen
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

-- ---------- A's records ----------
INSERT INTO public.products (id, seller_id, name, price, category)
VALUES ('00000000-0000-4000-8000-00000000a1a1', :seller, 'Isolation test basket', 5000, 'test');
INSERT INTO public.orders (id, buyer_id, seller_id, total_amount)
VALUES ('00000000-0000-4000-8000-00000000a1a2', :a, :seller, 5000);
INSERT INTO public.order_items (order_id, product_id, unit_price)
VALUES ('00000000-0000-4000-8000-00000000a1a2', '00000000-0000-4000-8000-00000000a1a1', 5000);
INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (:a, 'Nyabugogo', 'Kimironko');
INSERT INTO public.software_bookings (user_id, full_name, email, phone, service_type, project_description)
VALUES (:a, 'Customer A', 'iso-a@test.local', '0788000001', 'website', 'A shop website');
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, trial_started_at, trial_expires_at) VALUES (:a, now(), now() + interval '10 minutes');
SELECT set_config('isoko.subscription_internal', '', true);
INSERT INTO public.support_requests (business_id, message) VALUES (:a, 'Help with my dashboard');
INSERT INTO public.business_datasets (business_id) VALUES (:a);
INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number)
VALUES (:a, 'Customer A', 'A Shop', '0788000001', '1199000000000000');
INSERT INTO public.course_registrations (user_id, full_name, email, course_title)
VALUES (:a, 'Customer A', 'iso-a@test.local', 'Web basics');
INSERT INTO public.notifications (user_id, title, body, type) VALUES (:a, 'Private', 'For A only', 'info');

-- A's trip, consultancy request and data project, made as A (signed in) through the site's functions
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a0a1","role":"authenticated"}', true);
CREATE TEMP TABLE link AS SELECT 'trip' AS kind, public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":1,"needs":["hotel"],"name":"Customer A","phone":"0788000001","email":"iso-a@test.local"}'::jsonb) ->> 'token' AS token;
INSERT INTO link SELECT 'consult', public.consult_submit_request('{"service":"operations","description":"We need help improving our operations.",
  "name":"Customer A","phone":"0788000001","email":"iso-a@test.local"}'::jsonb) ->> 'token';
INSERT INTO link SELECT 'data', public.data_submit_request('{"service":"survey","description":"Survey data from 500 respondents to analyse.",
  "data_later":true,"name":"Customer A","phone":"0788000001","email":"iso-a@test.local"}'::jsonb) ->> 'token';
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.travel_documents (trip_id, kind, label)
SELECT id, 'passport', 'Passport' FROM public.travel_trips WHERE access_token = (SELECT token FROM link WHERE kind = 'trip');
INSERT INTO public.data_files (request_id, name, path)
SELECT id, 'survey.csv', 'data/secret/survey.csv' FROM public.data_requests WHERE access_token = (SELECT token FROM link WHERE kind = 'data');
-- A's trip accepted: A's payment account and ledger
UPDATE public.travel_trips SET status = 'quoted', quote_total = 1000, quote_sent_at = now()
WHERE access_token = (SELECT token FROM link WHERE kind = 'trip');
SELECT public.travel_accept_quote((SELECT token FROM link WHERE kind = 'trip'));
-- A passport scan in private storage, in A's trip folder
INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'service-files', 'travel/' || id || '/passport.pdf', :a FROM public.travel_trips WHERE access_token = (SELECT token FROM link WHERE kind = 'trip');
GRANT SELECT ON link TO authenticated, anon;

-- ---------- Nobody else sees them ----------
CREATE TEMP TABLE checks (what text, sql text, a_sees boolean);
INSERT INTO checks VALUES
  ('orders', $$SELECT 1 FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('order items', $$SELECT 1 FROM public.order_items WHERE order_id = '00000000-0000-4000-8000-00000000a1a2'$$, true),
  ('deliveries', $$SELECT 1 FROM public.logistics_requests WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('software bookings', $$SELECT 1 FROM public.software_bookings WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('subscriptions', $$SELECT 1 FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('support requests', $$SELECT 1 FROM public.support_requests WHERE business_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('business datasets', $$SELECT 1 FROM public.business_datasets WHERE business_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('seller applications (ID number)', $$SELECT 1 FROM public.seller_applications WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('course registrations', $$SELECT 1 FROM public.course_registrations WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('notifications', $$SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('profile', $$SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('payment accounts', $$SELECT 1 FROM public.finance_accounts WHERE customer_user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('payment ledger', $$SELECT 1 FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
                      WHERE a.customer_user_id = '00000000-0000-4000-8000-00000000a0a1'$$, true),
  ('trips', $$SELECT 1 FROM public.travel_trips WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$, false),
  ('travel documents (passport)', $$SELECT 1 FROM public.travel_documents d JOIN public.travel_trips t ON t.id = d.trip_id
                      WHERE t.access_token IN (SELECT token FROM link)$$, false),
  ('consultancy requests', $$SELECT 1 FROM public.consult_requests WHERE access_token IN (SELECT token FROM link)$$, false),
  ('data projects', $$SELECT 1 FROM public.data_requests WHERE access_token IN (SELECT token FROM link)$$, false),
  ('data files (datasets)', $$SELECT 1 FROM public.data_files WHERE path = 'data/secret/survey.csv'$$, false),
  ('private files (passport scan)', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'service-files' AND owner = '00000000-0000-4000-8000-00000000a0a1'$$, false);

SELECT pg_temp.expect(pg_temp.seen(NULL, sql) = 0, 'an anonymous visitor sees no ' || what) FROM checks ORDER BY what;
SELECT pg_temp.expect(pg_temp.seen(:b, sql) = 0, 'another customer sees no ' || what) FROM checks ORDER BY what;
SELECT pg_temp.expect(pg_temp.seen(:a, sql) > 0, 'the customer sees their own ' || what) FROM checks WHERE a_sees ORDER BY what;
SELECT pg_temp.expect(pg_temp.seen(:a, sql) = 0, 'the customer reaches their ' || what || ' only through their private link') FROM checks WHERE NOT a_sees ORDER BY what;
SELECT pg_temp.expect(pg_temp.seen(:travel, $$SELECT 1 FROM public.travel_trips WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$) = 1
  AND pg_temp.seen(:travel, $$SELECT 1 FROM public.consult_requests WHERE access_token IN (SELECT token FROM link)$$) = 0,
  'travel staff see the trip (the records exist) but not other services'' requests');
SELECT pg_temp.expect(pg_temp.seen(:seller, $$SELECT 1 FROM public.orders WHERE id = '00000000-0000-4000-8000-00000000a1a2'$$) = 1
  AND pg_temp.seen(:seller, $$SELECT 1 FROM public.software_bookings WHERE user_id = '00000000-0000-4000-8000-00000000a0a1'$$) = 0,
  'the seller sees the order they sell, nothing else of the customer''s');

ROLLBACK;

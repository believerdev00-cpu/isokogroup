-- Regression test for 20260925140000_files_and_links.sql (customer links, file
-- access, rate limits), run against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/files_links.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'fl-travel-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d2', 'fl-travel-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d3', 'fl-analyst@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'fl-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d5', 'fl-customer@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d6', 'fl-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d7', 'fl-driver@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'travel_staff'),
  ('00000000-0000-4000-8000-0000000000d2', 'travel_staff'),
  ('00000000-0000-4000-8000-0000000000d3', 'data_analyst'),
  ('00000000-0000-4000-8000-0000000000d4', 'admin'),
  ('00000000-0000-4000-8000-0000000000d7', 'driver');
UPDATE public.platform_settings SET value = '1' WHERE key = 'rate_limit_multiplier';
UPDATE public.platform_settings SET value = 'https://isoko.test' WHERE key = 'site_url';
DELETE FROM public.rate_limit_counters;

-- p_ip: the caller's address as the gateway would report it
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text, p_ip text DEFAULT '198.51.100.1') RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  PERFORM set_config('request.headers', json_build_object('x-forwarded-for', p_ip)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

-- As a signed-in person: file_access_check's answer
CREATE FUNCTION pg_temp.may_open(p_user text, p_bucket text, p_path text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := public.file_access_check(p_bucket, p_path);
  RESET ROLE;
  RETURN ok;
END $$;

\set ta '''00000000-0000-4000-8000-0000000000d1'''
\set tb '''00000000-0000-4000-8000-0000000000d2'''
\set analyst '''00000000-0000-4000-8000-0000000000d3'''
\set admin '''00000000-0000-4000-8000-0000000000d4'''
\set customer '''00000000-0000-4000-8000-0000000000d5'''
\set other '''00000000-0000-4000-8000-0000000000d6'''
\set driver '''00000000-0000-4000-8000-0000000000d7'''

CREATE TEMP TABLE link (id uuid, token text, files_key text);
GRANT ALL ON link TO anon, authenticated, service_role;
SELECT pg_temp.refused(NULL, $$INSERT INTO link (token) SELECT public.travel_request_trip('{"arrival_date":"2030-05-01",
  "departure_date":"2030-05-04","travelers":1,"needs":["hotel"],"name":"Lina Link","phone":"+250788300400","email":"lina@example.com"}'::jsonb) ->> 'token'$$);
UPDATE link SET id = t.id, files_key = t.files_key FROM public.travel_trips t WHERE t.access_token = link.token;

-- ---------- The link and its folder ----------
SELECT pg_temp.expect((SELECT files_key = token FROM link), 'a new request''s folder is named after its first link');
SELECT pg_temp.expect(public.travel_trip_view((SELECT token FROM link)) IS NOT NULL
  AND public.travel_trip_view((SELECT token FROM link)) ->> 'link_expires_at' IS NULL, 'an open request''s link works and has no expiry');
UPDATE public.travel_trips SET status = 'completed' WHERE id = (SELECT id FROM link);
SELECT pg_temp.expect((SELECT access_expires_at BETWEEN now() + interval '179 days' AND now() + interval '181 days'
  FROM public.travel_trips WHERE id = (SELECT id FROM link)), 'closing the request sets the link to expire in 180 days');
SELECT pg_temp.expect(public.service_file_customer_folder('travel', (SELECT token FROM link), false) = (SELECT files_key FROM link)
  AND public.service_file_customer_folder('travel', (SELECT token FROM link), true) IS NULL,
  'a closed request''s files can be downloaded, not added to');
UPDATE public.travel_trips SET access_expires_at = now() - interval '1 minute' WHERE id = (SELECT id FROM link);
SELECT pg_temp.expect(public.travel_trip_view((SELECT token FROM link)) IS NULL, 'an expired link shows nothing');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_request_changes((SELECT token FROM link), 'Please change')$$),
  'an expired link can''t act');
SELECT pg_temp.expect(public.service_file_customer_folder('travel', (SELECT token FROM link), false) IS NULL, 'or reach files');
UPDATE public.travel_trips SET status = 'confirmed' WHERE id = (SELECT id FROM link);
SELECT pg_temp.expect(public.travel_trip_view((SELECT token FROM link)) IS NOT NULL, 'reopening the request brings the link back');

-- ---------- Resetting a link ----------
SELECT pg_temp.expect(pg_temp.refused(:analyst, $$SELECT public.reset_customer_link('travel', (SELECT id FROM link))$$),
  'data staff can''t reset a travel link');
SELECT pg_temp.expect(pg_temp.refused(:other, $$SELECT public.reset_customer_link('travel', (SELECT id FROM link))$$),
  'nor can a customer');
SELECT pg_temp.expect(NOT pg_temp.refused(:ta, $$SELECT public.reset_customer_link('travel', (SELECT id FROM link))$$),
  'travel staff reset the link');
SELECT pg_temp.expect(public.travel_trip_view((SELECT token FROM link)) IS NULL
  AND public.service_file_customer_folder('travel', (SELECT token FROM link), false) IS NULL, 'the old link stops working at once');
SELECT pg_temp.expect(public.travel_trip_view((SELECT access_token FROM public.travel_trips WHERE id = (SELECT id FROM link))) IS NOT NULL
  AND (SELECT files_key FROM public.travel_trips WHERE id = (SELECT id FROM link)) = (SELECT files_key FROM link)
  AND public.service_file_customer_folder('travel', (SELECT access_token FROM public.travel_trips WHERE id = (SELECT id FROM link)), true)
      = (SELECT files_key FROM link),
  'the new link works and reaches the same files');
SELECT pg_temp.expect((SELECT d.body FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'CUSTOMER_LINK_RESET' AND e.entity_id = (SELECT id FROM link) AND d.channel = 'email')
  LIKE '%https://isoko.test/travel/trip/' || (SELECT access_token FROM public.travel_trips WHERE id = (SELECT id FROM link)),
  'the customer is sent the new link');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'travel_trips' AND entity_id = (SELECT id FROM link)::text
  AND reason = 'Customer link reset' AND actor_id = :ta AND NOT (new_data ? 'access_token')),
  'the reset is in the audit log (without the link itself)');

-- ---------- Rate limits ----------
DO $$ BEGIN
  FOR i IN 1..10 LOOP
    IF pg_temp.refused(NULL, format($f$SELECT public.consult_submit_request('{"service":"business","description":"Help %s",
      "name":"Rate %s","phone":"1","email":"r%s@example.com"}'::jsonb)$f$, i, i, i), '203.0.113.7') THEN
      RAISE EXCEPTION 'FAILED: request % of 10 was refused: %', i, current_setting('isoko.last_error');
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  ten requests an hour from one address are fine';
END $$;
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.consult_submit_request('{"service":"business","description":"Spam",
  "name":"Rate 11","phone":"1","email":"r11@example.com"}'::jsonb)$$, '203.0.113.7')
  AND current_setting('isoko.last_error') LIKE 'Too many attempts%', 'the eleventh is refused with a clear message');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, $$SELECT public.consult_submit_request('{"service":"business","description":"Hello",
  "name":"Someone else","phone":"1","email":"else@example.com"}'::jsonb)$$, '203.0.113.8'), 'another address is not affected');
DO $$ BEGIN
  FOR i IN 1..30 LOOP
    PERFORM pg_temp.refused(NULL, format('SELECT public.data_request_view(%L)', repeat('ab', 32)), '203.0.113.9');
  END LOOP;
END $$;
SELECT pg_temp.expect(pg_temp.refused(NULL, format('SELECT public.data_request_view(%L)', repeat('cd', 32)), '203.0.113.9'),
  'guessing links: after 30 wrong ones an address is stopped for the hour');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, $$SELECT public.travel_trip_view((SELECT access_token FROM public.travel_trips WHERE id = (SELECT id FROM link)))$$, '203.0.113.10'),
  'a customer with a real link is not affected');
SELECT pg_temp.expect(pg_temp.refused(:other, $$SELECT public.rate_limit('x', 1, 60)$$), 'the website can''t use the rate limiter directly');

-- ---------- Files: staff by assignment, customer uploads only through file-access ----------
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  ('service-files', 'travel/internal/' || (SELECT id FROM link) || '/voucher.pdf');
SELECT pg_temp.expect(pg_temp.visible(:ta, $$SELECT 1 FROM storage.objects WHERE bucket_id = 'service-files' AND name LIKE 'travel/internal/%'
  AND name LIKE '%' || (SELECT id FROM link) || '%'$$) = 1, 'travel staff read the working files of an unassigned trip');
SELECT pg_temp.expect(pg_temp.visible(:ta, $$SELECT 1 FROM storage.objects WHERE bucket_id = 'service-files'
  AND name = 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'$$) = 0,
  'but not the customer''s passport straight from storage');
SELECT pg_temp.expect(pg_temp.may_open(:ta, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  'they open it through file-access');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'file.opened' AND actor_id = :ta
  AND entity_id = 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf' AND details ->> 'request_id' = (SELECT id FROM link)::text),
  '... which is recorded: who, which file, which trip');

UPDATE public.travel_trips SET assigned_to = :ta WHERE id = (SELECT id FROM link);
SELECT pg_temp.expect(NOT pg_temp.may_open(:tb, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  'once the trip is assigned, other travel staff can''t open its passport');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'file.refused' AND actor_id = :tb), '... and the refusal is recorded');
SELECT pg_temp.expect(pg_temp.visible(:tb, $$SELECT 1 FROM storage.objects WHERE bucket_id = 'service-files' AND name LIKE 'travel/internal/%'
  AND name LIKE '%' || (SELECT id FROM link) || '%'$$) = 0, 'nor its working files');
SELECT pg_temp.expect(pg_temp.may_open(:ta, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf')
  AND pg_temp.may_open(:admin, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  'the assigned staff member and admins still can');
SELECT pg_temp.expect(NOT pg_temp.may_open(:analyst, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  'staff of another service can''t');
SELECT pg_temp.expect(NOT pg_temp.may_open(:customer, 'service-files', 'travel/' || (SELECT files_key FROM link) || '/client/passport.pdf'),
  'nor can a signed-in customer');
SELECT pg_temp.expect(pg_temp.refused(:tb, $$INSERT INTO storage.objects (bucket_id, name)
  VALUES ('service-files', 'travel/internal/' || (SELECT id FROM link) || '/sneaky.pdf')$$), 'other travel staff can''t add files to an assigned trip');
SELECT pg_temp.expect(pg_temp.refused(:ta, $$INSERT INTO storage.objects (bucket_id, name)
  VALUES ('service-files', 'travel/' || (SELECT files_key FROM link) || '/client/fake-upload.pdf')$$),
  'staff can''t write into the customer''s upload folder');
SELECT pg_temp.expect(NOT pg_temp.refused(:ta, $$INSERT INTO storage.objects (bucket_id, name)
  VALUES ('service-files', 'travel/' || (SELECT files_key FROM link) || '/shared/itinerary.pdf')$$), 'the assigned staff member shares a file');
SELECT pg_temp.expect(NOT pg_temp.may_open(:ta, 'service-files', 'travel/../etc/passwd') AND NOT pg_temp.may_open(:ta, 'avatars', 'x/y.png'),
  'odd paths and other buckets are refused');

-- ---------- ID documents and delivery proofs ----------
SELECT pg_temp.expect(pg_temp.may_open(:admin, 'id-documents', :customer || '/id.jpg')
  AND pg_temp.may_open(:customer, 'id-documents', :customer || '/id.jpg')
  AND NOT pg_temp.may_open(:other, 'id-documents', :customer || '/id.jpg')
  AND NOT pg_temp.may_open(:ta, 'id-documents', :customer || '/id.jpg'),
  'a seller''s ID: admins and the owner, nobody else');
INSERT INTO public.logistics_requests (user_id, pickup, dropoff, assigned_driver_id, status, proof_url)
VALUES (:customer, 'A', 'B', :driver, 'delivered', :driver || '/proof-1.jpg');
SELECT pg_temp.expect(pg_temp.may_open(:customer, 'delivery-proofs', :driver || '/proof-1.jpg')
  AND pg_temp.may_open(:driver, 'delivery-proofs', :driver || '/proof-1.jpg')
  AND pg_temp.may_open(:admin, 'delivery-proofs', :driver || '/proof-1.jpg')
  AND NOT pg_temp.may_open(:other, 'delivery-proofs', :driver || '/proof-1.jpg'),
  'a delivery proof: the customer, the driver and admins');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.logistics_requests WHERE proof_url LIKE '%/object/sign/%'),
  'no year-long proof links are stored any more');

ROLLBACK;

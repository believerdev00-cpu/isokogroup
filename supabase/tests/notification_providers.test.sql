-- Regression test for 20260925190000_notification_providers.sql (what a
-- WhatsApp / SMS provider needs, and what it reports back), run against the
-- local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/notification_providers.test.sql
--
-- Everything runs in one transaction that is rolled back. The Twilio sender
-- and status reports are covered by notifications-twilio.e2e.mjs.
BEGIN;

CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
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

UPDATE public.platform_settings SET value = 'https://isoko.test' WHERE key = 'site_url';
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'np-admin@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000b1', 'admin');

-- A trip request by link: TRIP_REQUESTED goes by email and WhatsApp
CREATE TEMP TABLE trip AS SELECT public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":1,"needs":["hotel"],"name":"Aline Uwase","phone":"0788 123 456","email":"aline@x.co"}'::jsonb) ->> 'token' AS token;
CREATE TEMP TABLE wa AS
SELECT d.* FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
WHERE e.event_type = 'TRIP_REQUESTED' AND e.entity_id = (SELECT id FROM public.travel_trips WHERE access_token = (SELECT token FROM trip))
  AND d.channel = 'whatsapp';

-- ---------- What a template needs ----------
SELECT pg_temp.expect((SELECT data ->> 'event_type' = 'TRIP_REQUESTED' AND data ->> 'name' = 'Aline Uwase'
    AND data ->> 'link' LIKE 'https://isoko.test/travel/trip/%' AND data ? 'reference' FROM wa),
  'a WhatsApp delivery keeps the values it was written from (name, full link, reference, event type)');
SELECT pg_temp.expect((SELECT recipient_address = '0788123456' AND status = 'pending' FROM wa), 'the number is kept, the message waits for the sender');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.notification_deliveries d JOIN wa ON wa.event_id = d.event_id
  WHERE d.channel = 'in_app' AND d.data <> '{}'::jsonb), 'in-app deliveries don''t need them');

-- ---------- Approved templates ----------
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000b1', $$
  INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
  VALUES ('TRIP_REQUESTED', 'whatsapp', 'Trip request', 'Hello {{name}}, we received your trip request. {{link}}',
          'HX0123456789abcdef0123456789abcdef', ARRAY['name', 'link'])$$),
  'an admin records the approved WhatsApp template and which values fill {{1}}, {{2}}');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000b1', $$
  UPDATE public.notification_templates SET provider_template = 'HX0123456789' WHERE event_type = 'TRIP_REQUESTED' AND channel = '*'$$),
  'provider templates are for WhatsApp and SMS only');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000b1', $$
  UPDATE public.notification_templates SET provider_template = 'HX 1; DROP' WHERE event_type = 'TRIP_REQUESTED' AND channel = 'whatsapp'$$),
  'a template id is an id');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$
  UPDATE public.notification_templates SET provider_template = 'HXevil0000' WHERE event_type = 'TRIP_REQUESTED' AND channel = 'whatsapp'$$)
  AND (SELECT provider_template FROM public.notification_templates WHERE event_type = 'TRIP_REQUESTED' AND channel = 'whatsapp') LIKE 'HX0123%',
  'visitors can''t change templates');

-- ---------- What the provider reports ----------
UPDATE public.notification_deliveries SET status = 'sent', provider = 'twilio', provider_message_id = 'SMtest0001', sent_at = now()
WHERE id = (SELECT id FROM wa);
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.notification_provider_status('twilio', 'SMtest0001', 'failed', 'x')$$)
  AND pg_temp.refused('00000000-0000-4000-8000-0000000000b1', $$SELECT public.notification_provider_status('twilio', 'SMtest0001', 'failed', 'x')$$),
  'only the status function (service role) records provider reports');
SELECT pg_temp.refused('service', $$SELECT public.notification_provider_status('twilio', 'SMtest0001', 'delivered')$$);
SELECT pg_temp.expect((SELECT status = 'delivered' AND delivered_at IS NOT NULL FROM public.notification_deliveries WHERE id = (SELECT id FROM wa)),
  'delivered');
SELECT pg_temp.refused('service', $$SELECT public.notification_provider_status('twilio', 'SMtest0001', 'failed', 'Twilio: undelivered (error 63016)')$$);
SELECT pg_temp.expect((SELECT status = 'failed' AND error LIKE '%63016%' FROM public.notification_deliveries WHERE id = (SELECT id FROM wa)),
  'accepted, then not delivered: failed, with the provider''s reason');
SELECT pg_temp.refused('service', $$SELECT public.notification_provider_status('twilio', 'SMtest0001', 'delivered')$$);
SELECT pg_temp.expect((SELECT status FROM public.notification_deliveries WHERE id = (SELECT id FROM wa)) = 'failed',
  'a report can''t turn a failure back into a delivery');
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$SELECT public.notification_provider_status('twilio', 'SMnobody', 'delivered')$$)
  AND NOT pg_temp.refused('service', $$SELECT public.notification_provider_status('other', 'SMtest0001', 'delivered')$$),
  'a report about a message we don''t know (or another provider''s) changes nothing');

ROLLBACK;

-- Regression test for 20261002110000_fashion_hub.sql (the Isoko Fashion Hub:
-- designs the public browses, requests that only signed-in people send and
-- only media staff answer):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/fashion_hub.test.sql
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000f0a1', 'fh-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f0b2', 'fh-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f0c3', 'fh-staff@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000f0c3', 'media_staff');

\set owner '''00000000-0000-4000-8000-00000000f0a1'''
\set other '''00000000-0000-4000-8000-00000000f0b2'''
\set staff '''00000000-0000-4000-8000-00000000f0c3'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Runs p_sql as p_user (NULL: a visitor); true when the database refused it
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
CREATE FUNCTION pg_temp.last_error() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('isoko.last_error', true) $$;
-- Rows p_user sees from p_sql (a SELECT), or changes (anything else); -1 when refused
CREATE FUNCTION pg_temp.as_user(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    IF p_sql ~* '^\s*select' THEN
      EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    n := -1;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;
-- A function's JSON result as p_user
CREATE FUNCTION pg_temp.call(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO j;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN j;
END $$;

-- ---------- Designs: staff publish, the public browses ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$INSERT INTO ent_fashion_designs (slug, name) VALUES ('fh-test-anon', 'x')$$) = -1,
  'a visitor can''t add a design');
SELECT pg_temp.expect(pg_temp.as_user(:owner, $$INSERT INTO ent_fashion_designs (slug, name) VALUES ('fh-test-cust', 'x')$$) = -1,
  'a customer can''t add a design');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_fashion_designs (id, slug, name, colors, sizes, fabric, availability, category_id)
  VALUES ('00000000-0000-4000-8000-00000000f101', 'fh-test-kitenge-dress', 'Kitenge wrap dress (test)', ARRAY['Blue', 'Red'], ARRAY['S', 'M', 'L'],
          'Kitenge cotton', 'made_to_order', (SELECT id FROM ent_categories WHERE section = 'design' AND slug = 'dresses'))$$) = 1,
  'media staff add a design (a draft)');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_fashion_designs (id, slug, name)
  VALUES ('00000000-0000-4000-8000-00000000f102', 'fh-test-draft', 'Unreleased design (test)')$$) = 1,
  'media staff add a second design that stays a draft');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_fashion_design_images (design_id, path) VALUES ('00000000-0000-4000-8000-00000000f101', 'fashion-hub/a.webp')$$) = 1,
  'media staff add a gallery image');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_fashion_designs WHERE slug LIKE 'fh-test-%'$$) = 0
                  AND pg_temp.as_user(:owner, $$SELECT 1 FROM ent_fashion_designs WHERE slug LIKE 'fh-test-%'$$) = 0,
  'a visitor and a customer see no draft design');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_fashion_design_images WHERE path = 'fashion-hub/a.webp'$$) = 0,
  'a draft design''s images stay hidden');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$UPDATE ent_fashion_designs SET status = 'published' WHERE slug = 'fh-test-kitenge-dress'$$) = 1,
  'media staff publish the design');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_fashion_designs WHERE slug LIKE 'fh-test-%'$$) = 1
                  AND pg_temp.as_user(:owner, $$SELECT 1 FROM ent_fashion_designs WHERE slug LIKE 'fh-test-%'$$) = 1,
  'a visitor and a customer now see the published design, not the draft');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_fashion_design_images WHERE path = 'fashion-hub/a.webp'$$) = 1,
  'its images show with it');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('kitenge', 50) WHERE kind = 'design'$$) = 1
                  AND pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('Unreleased design', 50)$$) = 0,
  'search finds the published design and never the draft');
SELECT pg_temp.expect(pg_temp.as_user(:owner, $$UPDATE ent_fashion_designs SET name = 'hacked' WHERE slug = 'fh-test-kitenge-dress'$$) = 0,
  'a customer can''t edit a design');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_categories WHERE section = 'design'$$) >= 6,
  'the design categories are public');

-- ---------- Requests: only signed-in people, only about public designs ----------
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f101","kind":"inquiry"}')$$),
  'a visitor can''t send a request (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f102","kind":"inquiry","message":"hi"}')$$),
  'a request about a draft design is refused (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f101","kind":"buy"}')$$),
  'an unknown kind is refused');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f101","kind":"production","quantity":"0"}')$$),
  'a quantity of 0 is refused');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$INSERT INTO ent_fashion_requests (reference, design_id, user_id, kind) VALUES ('FH-AAAAAA', '00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f0a1', 'inquiry')$$),
  'a request can''t be inserted directly, only through the function');

SELECT set_config('isoko.fh_result', pg_temp.call(:owner, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f101","kind":"inquiry","message":"Is this available?"}')$$)::text, true);
SELECT pg_temp.expect(current_setting('isoko.fh_result') ~ '"reference": ?"FH-[A-Z0-9]{6}"',
  'a signed-in person asks about the published design and gets a reference: ' || current_setting('isoko.fh_result'));
SELECT set_config('isoko.fh_id', (current_setting('isoko.fh_result')::jsonb ->> 'id'), true);
SELECT set_config('isoko.fh_ref', (current_setting('isoko.fh_result')::jsonb ->> 'reference'), true);

SELECT pg_temp.expect(pg_temp.call(:owner, $$SELECT fashion_submit_request('{"design_id":"00000000-0000-4000-8000-00000000f101","kind":"production","size":"M","color":"Blue","fabric":"Kitenge cotton","quantity":"2","customization":"Longer sleeves"}')$$) ? 'reference',
  'the same person asks Isoko to produce it, with size, colour, fabric, quantity and customization');
SELECT pg_temp.expect((SELECT quantity = 2 AND size = 'M' AND color = 'Blue' AND status = 'submitted' AND kind = 'production'
                       FROM ent_fashion_requests WHERE user_id = :owner AND kind = 'production'),
  'the production request stores the wishes and starts as submitted');

SELECT pg_temp.expect(pg_temp.as_user(:owner, $$SELECT 1 FROM ent_fashion_requests WHERE user_id = '00000000-0000-4000-8000-00000000f0a1'$$) = 2,
  'the owner sees their own two requests');
SELECT pg_temp.expect(pg_temp.as_user(:other, $$SELECT 1 FROM ent_fashion_requests$$) = 0,
  'another customer sees none of them');
SELECT pg_temp.expect(pg_temp.as_user(:owner, $$SELECT id, reference, design_id, kind, status, message, staff_note FROM ent_fashion_requests$$) = 2,
  'the owner reads the customer-facing columns');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$SELECT internal_note FROM ent_fashion_requests$$),
  'the owner can''t read the staff-only note (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$UPDATE ent_fashion_requests SET status = 'in_production'$$),
  'the owner can''t change the status directly (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$DELETE FROM ent_fashion_requests$$),
  'the owner can''t delete a request');
SELECT pg_temp.expect(pg_temp.refused(:other, format($$SELECT fashion_update_request(%L, 'accepted', 'ok', NULL)$$, current_setting('isoko.fh_id'))),
  'a customer can''t call the staff update (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(pg_temp.refused(:owner, $$SELECT * FROM fashion_requests_desk()$$),
  'a customer can''t open the staff desk');

-- ---------- The desk ----------
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$SELECT 1 FROM fashion_requests_desk() WHERE customer_email = 'fh-owner@test.local' AND design_name = 'Kitenge wrap dress (test)'$$) = 2,
  'media staff see both requests with the customer and the design');
SELECT pg_temp.expect(pg_temp.refused(:staff, format($$SELECT fashion_update_request(%L, 'shipped', NULL, NULL)$$, current_setting('isoko.fh_id'))),
  'a status that doesn''t exist is refused (' || pg_temp.last_error() || ')');
SELECT pg_temp.expect(NOT pg_temp.refused(:staff, format($$SELECT fashion_update_request(%L, 'in_production', 'We started cutting your dress.', 'Tailor: Jean')$$, current_setting('isoko.fh_id'))),
  'media staff set In production with a note for the customer and a private note');
SELECT pg_temp.expect(pg_temp.as_user(:owner, format($$SELECT 1 FROM ent_fashion_requests WHERE id = %L AND status = 'in_production' AND staff_note = 'We started cutting your dress.'$$, current_setting('isoko.fh_id'))) = 1,
  'the owner sees the new status and the note');
SELECT pg_temp.expect(pg_temp.as_user(:staff, format($$SELECT 1 FROM fashion_requests_desk() WHERE id = %L AND internal_note = 'Tailor: Jean'$$, current_setting('isoko.fh_id'))) = 1,
  'the private note is in the desk');

-- ---------- Everyone was told ----------
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notification_events WHERE event_type = 'FASHION_REQUEST_RECEIVED' AND entity_id = current_setting('isoko.fh_id')::uuid),
  'the customer''s confirmation event was raised');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notification_events WHERE event_type = 'FASHION_REQUEST_STAFF' AND entity_id = current_setting('isoko.fh_id')::uuid),
  'media staff were told about the new request');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notification_events WHERE event_type = 'FASHION_REQUEST_UPDATED' AND entity_id = current_setting('isoko.fh_id')::uuid),
  'the status change raised an event');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notifications WHERE user_id = :owner AND event_type = 'FASHION_REQUEST_RECEIVED' AND body LIKE '%' || current_setting('isoko.fh_ref') || '%'),
  'the owner has an in-app notification naming the reference');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notifications WHERE user_id = :owner AND event_type = 'FASHION_REQUEST_UPDATED' AND body LIKE '%In production%'),
  'the owner has an in-app notification with the new status');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM notifications WHERE user_id = :staff AND event_type = 'FASHION_REQUEST_STAFF'),
  'the media staff member has an in-app notification');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM audit_log WHERE entity_table = 'ent_fashion_requests'),
  'request changes are in the audit log');

ROLLBACK;

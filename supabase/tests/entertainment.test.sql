-- Isoko Entertainment: who sees and changes what, as the website's roles would.
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/entertainment.test.sql
--
-- Visitors see only published content (and scheduled content once its time has
-- come); only media staff and admins change anything; contact details stay with
-- staff; each person's saves are their own; the rules that protect people
-- (models are adults, private events need consent, paid items never play from a
-- public link) hold even for staff. Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000e0a1', 'ent-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e0b2', 'ent-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e0c3', 'ent-staff@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e0d4', 'ent-travel@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000e0c3', 'media_staff'), ('00000000-0000-4000-8000-00000000e0d4', 'travel_staff');

\set a '''00000000-0000-4000-8000-00000000e0a1'''
\set b '''00000000-0000-4000-8000-00000000e0b2'''
\set staff '''00000000-0000-4000-8000-00000000e0c3'''
\set travel '''00000000-0000-4000-8000-00000000e0d4'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', p_what; END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Runs p_sql as p_user (NULL: an anonymous visitor); returns the rows it saw or
-- changed, or -1 when the database refused
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

-- ---------- Content in every state ----------
INSERT INTO public.ent_titles (id, slug, kind, title, status, publish_at) VALUES
  ('00000000-0000-4000-8000-00000000e101', 'ent-test-published', 'film', 'Umurage (test)', 'published', NULL),
  ('00000000-0000-4000-8000-00000000e102', 'ent-test-draft', 'film', 'Draft film (test)', 'draft', NULL),
  ('00000000-0000-4000-8000-00000000e103', 'ent-test-due', 'film', 'Due film (test)', 'scheduled', now() - interval '1 minute'),
  ('00000000-0000-4000-8000-00000000e104', 'ent-test-later', 'film', 'Later film (test)', 'scheduled', now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000e105', 'ent-test-archived', 'film', 'Archived film (test)', 'archived', NULL);
INSERT INTO public.ent_credits (title_id, name, role) VALUES
  ('00000000-0000-4000-8000-00000000e101', 'Public Director', 'director'),
  ('00000000-0000-4000-8000-00000000e102', 'Hidden Director', 'director');
INSERT INTO public.ent_works (id, slug, section, title, status) VALUES
  ('00000000-0000-4000-8000-00000000e201', 'ent-test-work', 'photo', 'Kigali portraits (test)', 'published'),
  ('00000000-0000-4000-8000-00000000e202', 'ent-test-work-draft', 'art', 'Unreleased poster (test)', 'draft');
INSERT INTO public.ent_work_images (work_id, path) VALUES
  ('00000000-0000-4000-8000-00000000e201', 'photo/a.webp'), ('00000000-0000-4000-8000-00000000e202', 'art/b.webp');
INSERT INTO public.ent_creators (id, slug, display_name, kinds, status) VALUES
  ('00000000-0000-4000-8000-00000000e301', 'ent-test-photographer', 'Test Photographer', ARRAY['photographer'], 'published');
INSERT INTO public.ent_creator_contacts (creator_id, email, phone)
VALUES ('00000000-0000-4000-8000-00000000e301', 'private@test.local', '0788000000');

-- ---------- What visitors see ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_titles WHERE slug LIKE 'ent-test-%'$$) = 2,
  'a visitor sees the published film and the scheduled one whose time has come, nothing else');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$SELECT 1 FROM ent_titles WHERE slug LIKE 'ent-test-%'$$) = 2,
  'a signed-in customer sees the same as a visitor');
SELECT pg_temp.expect(pg_temp.as_user(:travel, $$SELECT 1 FROM ent_titles WHERE slug LIKE 'ent-test-%'$$) = 2,
  'staff of another service see only what is public');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$SELECT 1 FROM ent_titles WHERE slug LIKE 'ent-test-%'$$) = 5,
  'media staff see drafts, scheduled and archived content too');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_credits WHERE name = 'Hidden Director'$$) = 0
                  AND pg_temp.as_user(NULL, $$SELECT 1 FROM ent_credits WHERE name = 'Public Director'$$) = 1,
  'credits show only with a published film');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_work_images WHERE path = 'art/b.webp'$$) = 0
                  AND pg_temp.as_user(NULL, $$SELECT 1 FROM ent_work_images WHERE path = 'photo/a.webp'$$) = 1,
  'gallery images show only with a published work');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('test', 50) WHERE slug LIKE 'ent-test-%'$$) = 4,
  'search finds only what the visitor may see (2 films, 1 work, 1 photographer)');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('Unreleased', 50)$$) = 0,
  'search never reveals a draft');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_categories$$) > 0, 'categories are public');

INSERT INTO public.ent_titles (id, slug, kind, title, status) VALUES
  ('00000000-0000-4000-8000-00000000e106', 'ent-test-draft-show', 'podcast', 'Unreleased show (test)', 'draft');
INSERT INTO public.ent_episodes (title_id, number, name, status) VALUES
  ('00000000-0000-4000-8000-00000000e106', 1, 'Early episode (test)', 'published');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_episodes WHERE name = 'Early episode (test)'$$) = 0,
  'a published episode stays hidden while its show is a draft');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$SELECT 1 FROM ent_episodes WHERE name = 'Early episode (test)'$$) = 1,
  'media staff see that episode');

-- ---------- Private details ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_creator_contacts$$) <= 0
                  AND pg_temp.as_user(:a, $$SELECT 1 FROM ent_creator_contacts$$) = 0,
  'visitors and customers never see creators'' contact details');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$SELECT 1 FROM ent_creator_contacts$$) = 1,
  'media staff see contact details');

-- ---------- Who can change content ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$INSERT INTO ent_titles (slug, kind, title, status) VALUES ('ent-test-anon', 'film', 'x', 'published')$$) = -1,
  'a visitor can''t add a film');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$INSERT INTO ent_titles (slug, kind, title, status) VALUES ('ent-test-cust', 'film', 'x', 'published')$$) = -1,
  'a customer can''t add a film');
SELECT pg_temp.expect(pg_temp.as_user(:travel, $$INSERT INTO ent_works (slug, section, title) VALUES ('ent-test-travel', 'art', 'x')$$) = -1,
  'staff of another service can''t add work');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$UPDATE ent_titles SET title = 'hacked' WHERE slug = 'ent-test-published'$$) = 0,
  'a customer can''t edit a published film');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$DELETE FROM ent_works WHERE slug = 'ent-test-work'$$) = 0,
  'a customer can''t delete a published work');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$UPDATE ent_categories SET name = 'x'$$) = 0,
  'a customer can''t rename categories');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (slug, kind, title) VALUES ('ent-test-staff', 'podcast', 'Staff show')$$) = 1,
  'media staff add a show');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$UPDATE ent_titles SET status = 'published', featured = true WHERE slug = 'ent-test-staff'$$) = 1,
  'media staff publish and feature it');
SELECT pg_temp.expect((SELECT created_by FROM ent_titles WHERE slug = 'ent-test-staff') = :staff,
  'the new row records who created it');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM audit_log WHERE entity_table = 'ent_titles' AND actor_id = :staff),
  'staff changes are in the audit log');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$UPDATE ent_titles SET status = 'archived' WHERE slug = 'ent-test-staff'$$) = 1
                  AND pg_temp.as_user(NULL, $$SELECT 1 FROM ent_titles WHERE slug = 'ent-test-staff'$$) = 0,
  'archiving takes it off the public site');

-- ---------- Rules that hold even for staff ----------
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (slug, kind, title, watch_source, watch_ref, is_free) VALUES ('ent-test-paid-yt', 'film', 'x', 'youtube', 'abc', false)$$) = -1,
  'a paid film can''t play from a public YouTube link');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_creators (slug, display_name, kinds, status) VALUES ('ent-test-model', 'Model', ARRAY['model'], 'published')$$) = -1,
  'a model profile can''t go public before staff confirm the model is an adult');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_events (slug, title, status) VALUES ('ent-test-wedding', 'A wedding', 'published')$$) = -1,
  'event coverage can''t go public without the client''s consent');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_live_streams (slug, title, live_state) VALUES ('ent-test-live', 'Live', 'live')$$) = -1,
  'a stream can''t be marked live without a stream and a start time');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (slug, kind, title, status) VALUES ('ent-test-nodate', 'film', 'x', 'scheduled')$$) = -1,
  'scheduling needs a publish time');

-- ---------- Saves are private ----------
SELECT pg_temp.expect(pg_temp.as_user(:a, $$INSERT INTO ent_saves (item_type, item_id) VALUES ('title', '00000000-0000-4000-8000-00000000e101')$$) = 1,
  'a customer saves a film');
SELECT pg_temp.expect(pg_temp.as_user(:b, $$SELECT 1 FROM ent_saves$$) = 0, 'another customer can''t see those saves');
SELECT pg_temp.expect(pg_temp.as_user(:b, $$INSERT INTO ent_saves (user_id, item_type, item_id) VALUES ('00000000-0000-4000-8000-00000000e0a1', 'work', '00000000-0000-4000-8000-00000000e201')$$) = -1,
  'no one saves on someone else''s behalf');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$INSERT INTO ent_saves (item_type, item_id) VALUES ('title', '00000000-0000-4000-8000-00000000e101')$$) = -1,
  'a visitor must sign in to save');

-- ---------- Files ----------
SELECT pg_temp.expect(pg_temp.as_user(:a, $$INSERT INTO storage.objects (bucket_id, name) VALUES ('media-public', 'film/customer.webp')$$) = -1,
  'a customer can''t upload to the public media bucket');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO storage.objects (bucket_id, name) VALUES ('media-public', 'film/poster.webp')$$) = 1,
  'media staff upload a poster');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$INSERT INTO storage.objects (bucket_id, name) VALUES ('entertainment', 'films/x.mp4')$$) = -1,
  'a customer can''t upload a film file');
SELECT pg_temp.expect(pg_temp.as_user(:a, $$SELECT 1 FROM storage.objects WHERE bucket_id = 'entertainment'$$) = 0,
  'a customer without a subscription can''t read film files');
SELECT pg_temp.expect((SELECT public FROM storage.buckets WHERE id = 'entertainment') = false,
  'full films and episodes stay in a private bucket');

ROLLBACK;

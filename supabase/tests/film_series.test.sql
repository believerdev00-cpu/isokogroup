-- Regression test for 20261002100000_film_series.sql (TV series on Isoko
-- Entertainment, and the film genres):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/film_series.test.sql
--
-- Media staff add a series and its episodes; visitors see a published series
-- and its published episodes, never a draft series' episodes; no other kind
-- sneaks in; customers can't add a series. Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000f0a1', 'fs-customer@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f0c3', 'fs-staff@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000f0c3', 'media_staff');

\set customer '''00000000-0000-4000-8000-00000000f0a1'''
\set staff '''00000000-0000-4000-8000-00000000f0c3'''

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

-- ---------- Genres ----------
SELECT pg_temp.expect(
  (SELECT count(*) FROM public.ent_categories WHERE section = 'film' AND slug IN ('thriller', 'animation', 'family', 'adventure')) = 4,
  'the four new film genres exist');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_categories WHERE section = 'film'$$) >= 10,
  'a visitor sees the film genres');

-- ---------- Who adds a series ----------
SELECT pg_temp.expect(pg_temp.as_user(:customer, $$INSERT INTO ent_titles (slug, kind, title) VALUES ('fs-test-cust', 'series', 'x')$$) = -1,
  'a customer can''t add a series');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$INSERT INTO ent_titles (slug, kind, title) VALUES ('fs-test-anon', 'series', 'x')$$) = -1,
  'a visitor can''t add a series');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (id, slug, kind, title, status) VALUES ('00000000-0000-4000-8000-00000000f101', 'fs-test-series', 'series', 'Kigali Nights (test)', 'published')$$) = 1,
  'media staff add a TV series');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (id, slug, kind, title, status) VALUES ('00000000-0000-4000-8000-00000000f102', 'fs-test-draft-series', 'series', 'Unreleased series (test)', 'draft')$$) = 1,
  'media staff keep a second series as a draft');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_titles (slug, kind, title) VALUES ('fs-test-show', 'show', 'x')$$) = -1,
  'kind ''show'' is refused: only film, podcast and series');

-- ---------- Episodes ----------
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$INSERT INTO ent_episodes (title_id, season, number, name, format, status) VALUES
  ('00000000-0000-4000-8000-00000000f101', 1, 1, 'Pilot (test)', 'video', 'published'),
  ('00000000-0000-4000-8000-00000000f101', 1, 2, 'Episode two (test)', 'video', 'published'),
  ('00000000-0000-4000-8000-00000000f101', 2, 1, 'Season two opener (test)', 'video', 'draft'),
  ('00000000-0000-4000-8000-00000000f102', 1, 1, 'Hidden pilot (test)', 'video', 'published')$$) = 4,
  'media staff add episodes to both series');
SELECT pg_temp.expect(pg_temp.as_user(:customer, $$INSERT INTO ent_episodes (title_id, season, number, name) VALUES ('00000000-0000-4000-8000-00000000f101', 3, 1, 'x')$$) = -1,
  'a customer can''t add an episode');

-- ---------- What visitors see ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_titles WHERE kind = 'series' AND slug LIKE 'fs-test-%'$$) = 1,
  'a visitor sees the published series, not the draft');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_episodes WHERE title_id = '00000000-0000-4000-8000-00000000f101'$$) = 2,
  'a visitor sees the two published episodes of the published series, not its draft episode');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_episodes WHERE name = 'Hidden pilot (test)'$$) = 0,
  'a published episode stays hidden while its series is a draft');
SELECT pg_temp.expect(pg_temp.as_user(:customer, $$SELECT 1 FROM ent_episodes WHERE name LIKE '%(test)'$$) = 2,
  'a signed-in customer sees the same episodes as a visitor');
SELECT pg_temp.expect(pg_temp.as_user(:staff, $$SELECT 1 FROM ent_episodes WHERE name LIKE '%(test)'$$) = 4,
  'media staff see every episode');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('Kigali Nights', 50) WHERE kind = 'series'$$) = 1,
  'search finds the series as kind ''series''');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM ent_search('Unreleased series', 50)$$) = 0,
  'search never reveals a draft series');

ROLLBACK;

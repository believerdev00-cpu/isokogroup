-- Regression test for 20261003110000_research_feeds.sql (how the Information
-- Hub fills itself: feed columns, the import log, the review queue and
-- discarding engine drafts):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/research_feeds.test.sql
--
-- Only the server writes feed rows and the import log; data analysts and admins
-- see the review queue and may discard what a feed drafted, never what staff
-- wrote or anything published; visitors and customers see nothing of it.
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000d0a1', 'rh-analyst@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d0b2', 'rh-user@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000d0a1', 'data_analyst');

\set analyst '''00000000-0000-4000-8000-00000000d0a1'''
\set plain '''00000000-0000-4000-8000-00000000d0b2'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
-- Runs p_sql as p_user (NULL: a visitor; 'service': the service role); true when the database refused it
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    WHEN p_user = 'service' THEN '{"role":"service_role"}'
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
-- Rows p_user sees from p_sql (a SELECT), or changes (anything else); -1 when refused
CREATE FUNCTION pg_temp.as_user(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    WHEN p_user = 'service' THEN '{"role":"service_role"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END);
  BEGIN
    IF p_sql ~* '^\s*select' THEN
      EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM set_config('isoko.last_error', SQLERRM, true);
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
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END);
  EXECUTE p_sql INTO j;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN j;
END $$;

-- a clean slate (the whole suite is rolled back; the local database may hold drafts
-- written by the research-ask / research-ingest e2e scripts or World Bank test imports)
DELETE FROM public.research_items WHERE import_source IS NOT NULL;
DELETE FROM public.research_imports;

-- ---------- Columns and constraints ----------
SELECT pg_temp.expect((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'research_items'
  AND column_name IN ('review_hash', 'import_key', 'import_source', 'imported_at', 'review_note')) = 5
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'research_stats' AND column_name = 'source_url')
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'research_items_review')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'research_imports'),
  'feed columns, the review index and the import log exist');
SELECT pg_temp.expect(pg_temp.refused('service', $$INSERT INTO research_items (slug, kind, title, import_source) VALUES ('rf-bad', 'report', 'x', 'wikipedia')$$)
  AND pg_temp.refused('service', $$INSERT INTO research_items (slug, kind, title, review_note) VALUES ('rf-bad', 'report', 'x', repeat('n', 2001))$$),
  'an unknown feed and an overlong review note are refused');

-- ---------- What the feeds write (service role, as research-ask / research-ingest / research-import do) ----------
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_items (id, slug, kind, title, summary, body, country_id, origin, status, import_source, imported_at, review_hash, review_note, created_by)
  VALUES ('00000000-0000-4000-8000-00000000d201', 'rf-what-is-the-population-of-kigali', 'finding', 'What is the population of Kigali?',
          'About 1.7 million people lived in Kigali at the 2022 census.', 'About 1.7 million people lived in Kigali at the 2022 census.',
          (SELECT id FROM research_countries WHERE code = 'RW'), 'external', 'draft', 'question', now(),
          encode(sha256('what is the population of kigali|rwanda'), 'hex'),
          'Written by the answer engine from outside sources. Check the figures against the sources before publishing.', NULL)$$),
  'the answer engine saves a draft finding keyed by the question');
SELECT pg_temp.expect(pg_temp.refused('service', $$INSERT INTO research_items (slug, kind, title, status, import_source, review_hash)
  VALUES ('rf-dup', 'finding', 'x', 'draft', 'question', encode(sha256('what is the population of kigali|rwanda'), 'hex'))$$),
  'the same question can''t draft a second item (review_hash is unique)');
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_sources (item_id, title, url, publisher, source_type)
  VALUES ('00000000-0000-4000-8000-00000000d201', 'Fifth census, main indicators', 'https://example.org/census-2022', 'Example Statistics Office', 'other')$$)
  AND NOT pg_temp.refused('service', $$INSERT INTO research_stats (item_id, label, value, unit, period_label, source_url)
  VALUES ('00000000-0000-4000-8000-00000000d201', 'Population of Kigali', 1745555, 'people', '2022', 'https://example.org/census-2022')$$),
  'the engine''s sources and figures (with a source link) are saved with the draft');
SELECT pg_temp.expect(pg_temp.refused('service', $$INSERT INTO research_stats (item_id, label, value, source_url) VALUES ('00000000-0000-4000-8000-00000000d201', 'x', 1, 'http://insecure.example')$$),
  'a figure''s source link must be https');
-- a second, older engine draft and one extracted from a document
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_items (id, slug, kind, title, status, import_source, imported_at, review_hash, review_note, created_at)
  VALUES ('00000000-0000-4000-8000-00000000d202', 'rf-coffee-prices-2024', 'finding', 'Coffee prices in 2024', 'draft', 'question', now(),
          encode(sha256('coffee prices in 2024|rwanda'), 'hex'), 'Written by the answer engine from outside sources.', now() - interval '2 days')$$)
  AND NOT pg_temp.refused('service', $$INSERT INTO research_items (id, slug, kind, title, status, import_source, imported_at, review_note, created_at)
  VALUES ('00000000-0000-4000-8000-00000000d203', 'rf-labour-force-survey-2023', 'report', 'Labour force survey 2023', 'draft', 'document', now(),
          'Extracted from labour-force-survey-2023.pdf; check the text and figures.', now() - interval '1 day')$$),
  'an older engine draft and a draft extracted from a document are saved');
-- the World Bank connector publishes straight away, keyed for re-runs
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_items (id, slug, kind, title, summary, country_id, origin, source_name, source_url, status, import_source, imported_at, import_key, tags)
  VALUES ('00000000-0000-4000-8000-00000000d204', 'rf-rwanda-population-total', 'statistic', 'Population, total - Rwanda', 'World Bank World Development Indicators for Rwanda.',
          (SELECT id FROM research_countries WHERE code = 'RW'), 'external', 'World Bank, World Development Indicators',
          'https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW', 'published', 'worldbank', now(), 'worldbank:RW:SP.POP.TOTL', ARRAY['world-bank'])$$)
  AND pg_temp.refused('service', $$INSERT INTO research_items (slug, kind, title, status, import_source, import_key)
  VALUES ('rf-dup2', 'statistic', 'x', 'published', 'worldbank', 'worldbank:RW:SP.POP.TOTL')$$),
  'the World Bank connector publishes an indicator once (import_key is unique)');
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_items (id, slug, kind, title, status, import_source, review_hash)
  VALUES ('00000000-0000-4000-8000-00000000d205', 'rf-published-engine-finding', 'finding', 'Already published finding', 'published', 'question', encode(sha256('already published|rwanda'), 'hex'))$$),
  'an engine draft that staff published is saved as published');
-- a draft staff wrote by hand (no feed)
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (id, slug, kind, title, status) VALUES ('00000000-0000-4000-8000-00000000d206', 'rf-staff-draft', 'report', 'Staff draft', 'draft')$$) = 1,
  'a data analyst writes a draft by hand');
SELECT pg_temp.expect(pg_temp.as_user(:plain, $$UPDATE research_items SET status = 'published' WHERE slug LIKE 'rf-%'$$) = 0
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_items WHERE slug LIKE 'rf-%'$$) = 2
  AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_items WHERE slug LIKE 'rf-%'$$) = 2,
  'visitors and customers see only the two published feed items and change nothing');

-- ---------- Import log ----------
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$INSERT INTO research_imports (id, source, country_id, status, finished_at, created_items, updated_items)
  VALUES ('00000000-0000-4000-8000-00000000d301', 'worldbank', (SELECT id FROM research_countries WHERE code = 'RW'), 'done', now(), 15, 0)$$)
  AND NOT pg_temp.refused('service', $$INSERT INTO research_imports (source, status, error) VALUES ('document', 'failed', 'No text could be extracted')$$)
  AND pg_temp.refused('service', $$INSERT INTO research_imports (source) VALUES ('wikipedia')$$)
  AND pg_temp.refused('service', $$INSERT INTO research_imports (source, status) VALUES ('worldbank', 'paused')$$),
  'the server logs runs; an unknown source or status is refused');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$SELECT 1 FROM research_imports$$) = 2
  AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_imports$$) = 0
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_imports$$) = -1,
  'staff read the import log; customers see nothing; visitors are refused');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_imports (source) VALUES ('document')$$) = -1
  AND pg_temp.as_user(:analyst, $$UPDATE research_imports SET status = 'failed'$$) = -1
  AND pg_temp.as_user(:analyst, $$DELETE FROM research_imports$$) = -1
  AND pg_temp.as_user(NULL, $$INSERT INTO research_imports (source) VALUES ('document')$$) = -1,
  'nobody but the server writes the import log');

-- ---------- Review queue ----------
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$SELECT 1 FROM research_review_queue(50)$$) = 3
  AND (pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$) -> 0 ->> 'slug') = 'rf-what-is-the-population-of-kigali'
  AND (pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$) -> 1 ->> 'slug') = 'rf-labour-force-survey-2023'
  AND (pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$) -> 2 ->> 'slug') = 'rf-coffee-prices-2024',
  'a data analyst sees the three feed drafts, newest first');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$)) e
                                  WHERE e ->> 'slug' IN ('rf-staff-draft', 'rf-rwanda-population-total', 'rf-published-engine-finding')),
  'the queue never lists a draft staff wrote by hand, a World Bank item or anything published');
SELECT pg_temp.expect((SELECT q FROM jsonb_array_elements(pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$)) q
                       WHERE q ->> 'slug' = 'rf-what-is-the-population-of-kigali') @> '{"kind": "finding", "country_name": "Rwanda", "import_source": "question",
                       "sources": [{"title": "Fifth census, main indicators", "url": "https://example.org/census-2022", "publisher": "Example Statistics Office"}]}'::jsonb
  AND (SELECT q ->> 'review_note' FROM jsonb_array_elements(pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$)) q
       WHERE q ->> 'slug' = 'rf-labour-force-survey-2023') LIKE 'Extracted from %'
  AND (SELECT q -> 'sources' FROM jsonb_array_elements(pg_temp.call(:analyst, $$SELECT to_jsonb(array_agg(q)) FROM research_review_queue(50) q$$)) q
       WHERE q ->> 'slug' = 'rf-labour-force-survey-2023') = '[]'::jsonb,
  'each row carries kind, country, feed, review note and its sources (an empty list when there are none)');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$SELECT 1 FROM research_review_queue(1)$$) = 1
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_review_queue(0)$$) = 1
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_review_queue(NULL)$$) = 3,
  'the limit is clamped to at least one; NULL means the default');
SELECT pg_temp.expect(pg_temp.as_user(:plain, $$SELECT 1 FROM research_review_queue(50)$$) = 0
  AND pg_temp.refused(NULL, $$SELECT * FROM research_review_queue(50)$$),
  'a customer gets an empty queue; a visitor is refused');

-- ---------- Discarding drafts ----------
SELECT pg_temp.expect(pg_temp.refused(:plain, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d201')$$)
  AND current_setting('isoko.last_error', true) LIKE '%data analysts and admins%'
  AND pg_temp.refused(NULL, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d201')$$)
  AND EXISTS (SELECT 1 FROM public.research_items WHERE id = '00000000-0000-4000-8000-00000000d201'),
  'customers and visitors can''t discard anything');
SELECT pg_temp.expect(pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d206')$$)
  AND pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d204')$$)
  AND pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d205')$$)
  AND pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d999')$$)
  AND (SELECT count(*) FROM public.research_items WHERE slug LIKE 'rf-%') = 6,
  'a draft staff wrote, a World Bank item, a published item and an unknown id are not discarded (clear error)');
-- (two statements: a subquery in the same expression would be evaluated before the calls)
SELECT pg_temp.expect(NOT pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d201')$$)
  AND NOT pg_temp.refused(:analyst, $$SELECT research_discard_draft('00000000-0000-4000-8000-00000000d203')$$),
  'a data analyst discards an engine draft and a document draft');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.research_items WHERE id IN ('00000000-0000-4000-8000-00000000d201', '00000000-0000-4000-8000-00000000d203'))
  AND NOT EXISTS (SELECT 1 FROM public.research_sources WHERE item_id = '00000000-0000-4000-8000-00000000d201')
  AND NOT EXISTS (SELECT 1 FROM public.research_stats WHERE item_id = '00000000-0000-4000-8000-00000000d201')
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_review_queue(50)$$) = 1,
  'the discarded drafts are gone with their sources and figures; the queue shrinks');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'research_items' AND action = 'delete'
                              AND actor_id = '00000000-0000-4000-8000-00000000d0a1' AND old_data ->> 'slug' = 'rf-what-is-the-population-of-kigali' AND occurred_at >= now()),
  'the discard is in the audit log with the analyst as actor');

ROLLBACK;

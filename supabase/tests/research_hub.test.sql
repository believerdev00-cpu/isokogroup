-- Regression test for 20261003100000_research_hub.sql (the ISOKO Information
-- Hub: research items, figures, sources, documents, search, questions):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/research_hub.test.sql
--
-- Visitors read only published items (and their figures, sources and links);
-- data analysts and admins manage everything; documents, questions and cached
-- answers never reach the website; search finds by words, keywords and a
-- misspelt title and never returns a draft, whoever asks. Rolled back at the end.
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

-- ---------- Seeds ----------
SELECT pg_temp.expect((SELECT count(*) FROM public.research_countries) = 6 AND (SELECT count(*) FROM public.research_countries WHERE is_active) = 1
  AND (SELECT slug FROM public.research_countries WHERE is_active) = 'rwanda', 'six countries seeded, Rwanda the only active one');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_regions r JOIN public.research_countries c ON c.id = r.country_id
  WHERE c.code = 'RW' AND r.level = 'province') = 5, 'Rwanda''s five provinces seeded');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_topics WHERE parent_id IS NULL) = 16, 'sixteen top-level topics seeded');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_countries$$) = 1
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_countries$$) = 6
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_regions$$) = 5
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_topics$$) = 16,
  'visitors see active countries, all regions and topics; staff see every country');

-- ---------- Items: staff write, the public reads what is published ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$INSERT INTO research_items (slug, kind, title) VALUES ('rh-anon', 'report', 'x')$$) = -1,
  'a visitor can''t add an item');
SELECT pg_temp.expect(pg_temp.as_user(:plain, $$INSERT INTO research_items (slug, kind, title) VALUES ('rh-plain', 'report', 'x')$$) = -1,
  'a signed-in person without the role can''t add an item');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (id, slug, kind, title, summary, body, country_id, region_id, topic_id, published_on, featured, keywords, tags, status)
  VALUES ('00000000-0000-4000-8000-00000000d101', 'rh-population-of-rwanda', 'statistic', 'Population of Rwanda',
          'How many people live in Rwanda, by province, from the national census.',
          'The resident population counted at each census.\n\n## By province\n\n- Kigali City grows fastest.',
          (SELECT id FROM research_countries WHERE code = 'RW'), (SELECT id FROM research_regions WHERE slug = 'kigali'),
          (SELECT id FROM research_topics WHERE slug = 'population'), '2023-05-01', true, ARRAY['census', 'demographics'], ARRAY['nisr'], 'published')$$) = 1,
  'a data analyst adds a published statistic');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (id, slug, kind, title, summary, country_id, topic_id, published_on, status, keywords)
  VALUES ('00000000-0000-4000-8000-00000000d102', 'rh-coffee-exports-study', 'study', 'Coffee exports study',
          'A study of coffee export volumes and prices over ten seasons.',
          (SELECT id FROM research_countries WHERE code = 'RW'), (SELECT id FROM research_topics WHERE slug = 'agriculture'), '2022-11-10', 'published', ARRAY['coffee', 'exports'])$$) = 1,
  'a data analyst adds a published study');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (id, slug, kind, title, summary, country_id, topic_id, status)
  VALUES ('00000000-0000-4000-8000-00000000d103', 'rh-draft-housing-report', 'report', 'Housing report draft', 'Not finished yet.',
          (SELECT id FROM research_countries WHERE code = 'RW'), (SELECT id FROM research_topics WHERE slug = 'housing'), 'draft')$$) = 1,
  'a data analyst adds a draft report');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (slug, kind, title, status) VALUES ('rh-bad', 'opinion', 'x', 'published')$$) = -1,
  'an unknown kind is refused');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_items (slug, kind, title, source_url) VALUES ('rh-bad2', 'report', 'x', 'http://insecure.example')$$) = -1,
  'a source link must be https');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$UPDATE research_items SET verification = 'verified', verified_at = now(), verified_by = auth.uid() WHERE slug = 'rh-population-of-rwanda'$$) = 1,
  'a data analyst marks an item verified');
-- inside one transaction now() does not move: date the row an hour back, then the edit must be newer
UPDATE public.research_items SET created_at = created_at - interval '1 hour' WHERE slug = 'rh-population-of-rwanda';
SELECT pg_temp.expect((SELECT updated_at > created_at FROM public.research_items WHERE slug = 'rh-population-of-rwanda'),
  'updated_at moves on edit');
SELECT pg_temp.expect(pg_temp.as_user(:plain, $$UPDATE research_items SET title = 'hacked' WHERE slug = 'rh-population-of-rwanda'$$) = 0,
  'a signed-in person without the role changes nothing');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_items WHERE slug LIKE 'rh-%'$$) = 2
  AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_items WHERE slug LIKE 'rh-%'$$) = 2
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_items WHERE slug LIKE 'rh-%'$$) = 3,
  'visitors and customers see the two published items, never the draft; staff see all three');

-- ---------- Figures, sources, documents, links ----------
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_stats (item_id, label, value, unit, period_label, period_date, series, sort) VALUES
  ('00000000-0000-4000-8000-00000000d101', 'Resident population', 10515973, 'people', '2012', '2012-08-15', 'population', 1),
  ('00000000-0000-4000-8000-00000000d101', 'Resident population', 13246394, 'people', '2022', '2022-08-15', 'population', 2),
  ('00000000-0000-4000-8000-00000000d103', 'Households', 1, 'households', '2022', '2022-01-01', NULL, 1)$$) = 3,
  'a data analyst adds figures (a two-point series, and one on the draft)');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_sources (item_id, title, url, publisher, source_type, published_on, sort) VALUES
  ('00000000-0000-4000-8000-00000000d101', 'Fifth Population and Housing Census', 'https://www.statistics.gov.rw/', 'NISR', 'statistics_agency', '2023-02-01', 1),
  ('00000000-0000-4000-8000-00000000d103', 'Draft source', NULL, 'Isoko', 'isoko', NULL, 1)$$) = 2,
  'a data analyst records sources');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_documents (item_id, name, path, size, mime) VALUES
  ('00000000-0000-4000-8000-00000000d101', 'census.pdf', 'research/00000000-0000-4000-8000-00000000d101/census.pdf', 1234, 'application/pdf')$$) = 1,
  'a data analyst attaches a document');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_item_links (item_id, related_id) VALUES
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000d102'),
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000d103')$$) = 2,
  'a data analyst links related items (one of them a draft)');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$INSERT INTO research_item_links (item_id, related_id) VALUES
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000d101')$$) = -1,
  'an item can''t relate to itself');
SELECT pg_temp.expect(pg_temp.as_user(:plain, $$INSERT INTO research_stats (item_id, label, value) VALUES ('00000000-0000-4000-8000-00000000d101', 'x', 1)$$) = -1
  AND pg_temp.as_user(:plain, $$INSERT INTO research_sources (item_id, title) VALUES ('00000000-0000-4000-8000-00000000d101', 'x')$$) = -1
  AND pg_temp.as_user(:plain, $$INSERT INTO research_documents (item_id, name, path) VALUES ('00000000-0000-4000-8000-00000000d101', 'x', 'research/x')$$) = -1
  AND pg_temp.as_user(:plain, $$INSERT INTO research_item_links (item_id, related_id) VALUES ('00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000d101')$$) = -1,
  'without the role nobody writes figures, sources, documents or links');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_stats$$) = 2 AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_sources$$) = 1,
  'a visitor sees the figures and sources of published items only');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_item_links$$) = 1,
  'a visitor sees only the link whose both ends are published');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_documents$$) = 0 AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_documents$$) = 0,
  'documents never reach the website (no policy: a visitor and a customer see none)');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_questions$$) = -1 AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_questions$$) = -1
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_answers$$) = -1 AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_answers$$) = -1
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_ask_log$$) = -1,
  'questions, cached answers and the ask log are not readable from the website');
SELECT pg_temp.expect(pg_temp.as_user(:analyst, $$SELECT 1 FROM research_documents$$) = 1, 'staff read documents');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM storage.buckets WHERE id = 'research' AND NOT public$$) >= 0
  AND (SELECT NOT public FROM storage.buckets WHERE id = 'research'), 'the research bucket is private');

-- ---------- Search ----------
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_search('population') WHERE slug = 'rh-population-of-rwanda'$$) = 1,
  'search finds an item by a word in its title');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_search('census') WHERE slug = 'rh-population-of-rwanda'$$) = 1,
  'search finds an item by a keyword');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_search('populaton') WHERE slug = 'rh-population-of-rwanda'$$) = 1,
  'a misspelt word still finds the item (trigrams)');
SELECT pg_temp.expect(pg_temp.as_user(NULL, $$SELECT 1 FROM research_search('housing')$$) = 0
  AND pg_temp.as_user(:analyst, $$SELECT 1 FROM research_search('housing')$$) = 0,
  'the draft is never found, even by staff');
SELECT pg_temp.expect(pg_temp.as_user('service', $$SELECT 1 FROM research_search('housing')$$) = 0
  AND pg_temp.as_user('service', $$SELECT 1 FROM research_search('')$$) = 2,
  'the service role gets only published items from search too');
SELECT pg_temp.expect((SELECT slug FROM public.research_search('') LIMIT 1) = 'rh-population-of-rwanda'
  AND (SELECT count(*) FROM public.research_search('')) = 2,
  'an empty query browses, featured first');
SELECT pg_temp.expect((SELECT total FROM public.research_search('') LIMIT 1) = 2
  AND (SELECT total FROM public.research_search('', NULL, 'study') LIMIT 1) = 1,
  'total counts the whole result, not the page');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_search('', 'rwanda')) = 2
  AND (SELECT count(*) FROM public.research_search('', 'uganda')) = 0
  AND (SELECT count(*) FROM public.research_search('', NULL, 'statistic')) = 1
  AND (SELECT count(*) FROM public.research_search('', NULL, NULL, 'agriculture')) = 1
  AND (SELECT count(*) FROM public.research_search('', NULL, NULL, 'housing')) = 0,
  'country, kind and topic filters work');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_search('', NULL, NULL, NULL, 1, 0)) = 1
  AND (SELECT slug FROM public.research_search('', NULL, NULL, NULL, 1, 1)) = 'rh-coffee-exports-study'
  AND (SELECT count(*) FROM public.research_search('', NULL, NULL, NULL, 1, 5)) = 0
  AND (SELECT count(*) FROM public.research_search('', NULL, NULL, NULL, 999, -3)) = 2,
  'limit and offset page through the results and are clamped');
SELECT pg_temp.expect((SELECT country_name || '/' || topic_name || '/' || region_name || '/' || verification
  FROM public.research_search('population') WHERE slug = 'rh-population-of-rwanda') = 'Rwanda/Population/Kigali City/verified',
  'a hit carries its country, topic, region and verification');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_search(repeat('x', 5000))) = 0, 'a very long query is clamped and finds nothing');
SELECT pg_temp.expect((SELECT count(*) FROM public.research_search($q$'; drop table research_items; --$q$)) = 0
  AND (SELECT count(*) FROM public.research_items WHERE slug LIKE 'rh-%') = 3, 'a hostile query is just text');

-- ---------- Counts ----------
SELECT pg_temp.expect((SELECT string_agg(kind || '=' || n, ',' ORDER BY kind) FROM public.research_counts()) = 'statistic=1,study=1',
  'research_counts counts public items by kind');
SELECT pg_temp.expect((SELECT n FROM public.research_region_counts('rwanda') WHERE slug = 'kigali') = 1
  AND (SELECT count(*) FROM public.research_region_counts('rwanda')) = 5
  AND (SELECT count(*) FROM public.research_region_counts('nowhere')) = 0,
  'research_region_counts lists a country''s regions with their public items');

-- ---------- One item in full ----------
SELECT pg_temp.expect((SELECT (d ->> 'title') = 'Population of Rwanda' AND jsonb_array_length(d -> 'stats') = 2
  AND jsonb_array_length(d -> 'sources') = 1 AND jsonb_array_length(d -> 'related') = 1
  AND (d -> 'related' -> 0 ->> 'slug') = 'rh-coffee-exports-study'
  AND (d -> 'country' ->> 'slug') = 'rwanda' AND (d -> 'region' ->> 'level') = 'province' AND (d -> 'topic' ->> 'slug') = 'population'
  AND (d -> 'stats' -> 1 ->> 'period_label') = '2022'
  FROM pg_temp.call(NULL, $$SELECT research_item_detail('rh-population-of-rwanda')$$) d),
  'research_item_detail returns the item with its figures, its source and only the published related item');
SELECT pg_temp.expect(pg_temp.call(NULL, $$SELECT research_item_detail('rh-draft-housing-report')$$) IS NULL
  AND pg_temp.call(NULL, $$SELECT research_item_detail('no-such-item')$$) IS NULL,
  'research_item_detail gives nothing for a draft or an unknown slug');

-- ---------- Questions ----------
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT research_record_question('What is the population of Rwanda?', 'rwanda')$$)
  AND pg_temp.refused(:plain, $$SELECT research_record_question('What is the population of Rwanda?', 'rwanda')$$)
  AND pg_temp.refused(:analyst, $$SELECT research_record_question('What is the population of Rwanda?', 'rwanda')$$),
  'only the server records questions (visitors, customers and staff are refused)');
-- a clean slate for the counting checks (the whole suite is rolled back; the local
-- database may hold questions recorded by the research-ask e2e script)
DELETE FROM public.research_questions;
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$SELECT research_record_question('What is the population of Rwanda?', 'rwanda')$$)
  AND NOT pg_temp.refused('service', $$SELECT research_record_question('  what is the   population of rwanda ', NULL)$$)
  AND NOT pg_temp.refused('service', $$SELECT research_record_question('Youth employment statistics', 'rwanda')$$),
  'the service role records questions');
SELECT pg_temp.expect((SELECT ask_count FROM public.research_questions WHERE normalized = 'what is the population of rwanda') = 2
  AND (SELECT count(*) FROM public.research_questions) = 2
  AND (SELECT c.slug FROM public.research_questions q JOIN public.research_countries c ON c.id = q.country_id WHERE q.normalized = 'what is the population of rwanda') = 'rwanda',
  'the same question asked twice (spacing, case, question mark) counts once with ask_count 2');
SELECT pg_temp.expect(NOT pg_temp.refused('service', $$SELECT research_record_question('', NULL)$$)
  AND (SELECT count(*) FROM public.research_questions) = 2, 'an empty question is ignored');
SELECT pg_temp.expect((pg_temp.call(NULL, $$SELECT to_jsonb(array_agg(q)) FROM research_trending_questions(5) q$$) -> 0 ->> 'question') = 'What is the population of Rwanda?'
  AND pg_temp.as_user(NULL, $$SELECT 1 FROM research_trending_questions(100)$$) = 2
  AND pg_temp.as_user(:plain, $$SELECT 1 FROM research_trending_questions(1)$$) = 1,
  'anyone reads the trending questions, most asked first, limit clamped');

-- ---------- Audit ----------
-- only this transaction's audit rows (now() is fixed per transaction; older local runs leave rows behind)
SELECT pg_temp.expect((SELECT count(*) FROM public.audit_log WHERE entity_table = 'research_items' AND action = 'insert' AND occurred_at >= now()) = 3
  AND EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'research_items' AND action = 'update'
              AND actor_id = '00000000-0000-4000-8000-00000000d0a1' AND new_data ->> 'verification' = 'verified')
  AND EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'research_sources' AND action = 'insert')
  AND EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'research_documents' AND action = 'insert'),
  'items, sources and documents are in the audit log with the analyst as actor');

ROLLBACK;

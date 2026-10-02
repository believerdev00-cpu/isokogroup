-- The ISOKO Information Hub: research, statistics, reports, studies, findings,
-- surveys and datasets that anyone can search and read.
--
-- How it fits the platform:
--   * Everything public is a research item with a status (draft, published,
--     scheduled, archived; the same ent_is_public() rule as Entertainment), a
--     kind, a country and region (a flexible hierarchy: each region names its
--     own level, so Rwanda's provinces and districts, Kenya's counties and so on
--     all fit), a topic and subtopic, keywords and tags.
--   * Numbers live in research_stats (one row per figure; a series + period make
--     a chart line), provenance in research_sources (every item keeps where it
--     came from, when it was published and retrieved), supporting files in
--     research_documents (staff only: visitors read, they do not download).
--   * Search is Postgres full text (a generated tsvector, weighted title >
--     summary/keywords > body) plus word-level trigram similarity on the title, so a
--     misspelt word still finds the item. research_search() runs with the
--     caller's rights and always applies the public filter, so even the service
--     role never gets a draft through it.
--   * The questions people ask are counted (no names, no addresses) for the
--     "trending questions" list, and answers are cached for a day. Only the
--     research-ask Edge Function (service role) writes those.
--   * Data analysts and admins (is_service_staff('data')) manage everything
--     from the staff workspace; every change is in the audit log.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- array_to_string is only STABLE in Postgres; a generated column needs IMMUTABLE
CREATE OR REPLACE FUNCTION public.research_words(_words text[])
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT array_to_string(_words, ' ');
$$;

-- ============== PLACES ==============
CREATE TABLE public.research_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.research_countries (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.research_regions (id) ON DELETE CASCADE,
  level text NOT NULL CHECK (length(level) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  code text CHECK (length(code) <= 40),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, slug)
);
CREATE INDEX research_regions_country ON public.research_regions (country_id, parent_id, sort);

CREATE TABLE public.research_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  parent_id uuid REFERENCES public.research_topics (id) ON DELETE SET NULL,
  description text CHECK (length(description) <= 1000),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============== ITEMS ==============
CREATE TABLE public.research_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text NOT NULL CHECK (kind IN ('statistic', 'research', 'study', 'report', 'finding', 'dataset', 'survey')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  summary text CHECK (length(summary) <= 1000),
  -- plain text: paragraphs separated by blank lines, "## " headings, "- " bullets
  body text CHECK (length(body) <= 50000),
  country_id uuid REFERENCES public.research_countries (id) ON DELETE SET NULL,
  region_id uuid REFERENCES public.research_regions (id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.research_topics (id) ON DELETE SET NULL,
  subtopic_id uuid REFERENCES public.research_topics (id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  published_on date,
  author text CHECK (length(author) <= 200),
  organization text CHECK (length(organization) <= 200),
  methodology text CHECK (length(methodology) <= 5000),
  origin text NOT NULL DEFAULT 'isoko' CHECK (origin IN ('isoko', 'external')),
  source_name text CHECK (length(source_name) <= 200),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  verification text NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified', 'verified')),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  keywords text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  cover_path text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    || setweight(to_tsvector('english', public.research_words(keywords) || ' ' || public.research_words(tags)), 'B')
    || setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED,
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX research_items_search ON public.research_items USING gin (search);
CREATE INDEX research_items_browse ON public.research_items (status, published_on DESC);
CREATE INDEX research_items_country ON public.research_items (country_id);
CREATE INDEX research_items_topic ON public.research_items (topic_id);
CREATE INDEX research_items_subtopic ON public.research_items (subtopic_id);
CREATE INDEX research_items_region ON public.research_items (region_id);
CREATE INDEX research_items_kind ON public.research_items (kind);
CREATE INDEX research_items_tags ON public.research_items USING gin (tags);
CREATE INDEX research_items_keywords ON public.research_items USING gin (keywords);
CREATE INDEX research_items_title_trgm ON public.research_items USING gin (title extensions.gin_trgm_ops);
CREATE INDEX research_items_featured ON public.research_items (published_on DESC) WHERE featured;

-- One figure each; rows sharing a series and carrying a period make a chart line
CREATE TABLE public.research_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.research_items (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  value numeric NOT NULL,
  unit text CHECK (length(unit) <= 40),
  period_label text CHECK (length(period_label) <= 40),
  period_date date,
  region_id uuid REFERENCES public.research_regions (id) ON DELETE SET NULL,
  series text CHECK (length(series) <= 80),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_stats_item ON public.research_stats (item_id, series, period_date);

-- Where an item's information comes from (kept whatever the website shows)
CREATE TABLE public.research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.research_items (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  url text CHECK (url IS NULL OR url ~ '^https://'),
  publisher text CHECK (length(publisher) <= 200),
  source_type text NOT NULL DEFAULT 'other' CHECK (source_type IN (
    'government', 'statistics_agency', 'university', 'research_institution', 'international_org',
    'publication', 'organization', 'isoko', 'other')),
  published_on date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (length(note) <= 1000),
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX research_sources_item ON public.research_sources (item_id, sort);

-- Supporting files in the private 'research' bucket: staff only
CREATE TABLE public.research_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.research_items (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  path text NOT NULL,
  size bigint CHECK (size >= 0),
  mime text CHECK (length(mime) <= 120),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_documents_item ON public.research_documents (item_id);

CREATE TABLE public.research_item_links (
  item_id uuid NOT NULL REFERENCES public.research_items (id) ON DELETE CASCADE,
  related_id uuid NOT NULL REFERENCES public.research_items (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, related_id),
  CHECK (item_id <> related_id)
);

-- ============== QUESTIONS AND ANSWERS (service role only) ==============
CREATE TABLE public.research_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 300),
  normalized text NOT NULL UNIQUE,
  ask_count integer NOT NULL DEFAULT 1,
  last_asked_at timestamptz NOT NULL DEFAULT now(),
  country_id uuid REFERENCES public.research_countries (id) ON DELETE SET NULL
);
CREATE INDEX research_questions_trending ON public.research_questions (ask_count DESC, last_asked_at DESC);

CREATE TABLE public.research_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash text NOT NULL UNIQUE,
  question text NOT NULL,
  country_id uuid REFERENCES public.research_countries (id) ON DELETE SET NULL,
  answer text,
  mode text NOT NULL CHECK (mode IN ('kb', 'kb_external', 'external', 'none')),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sources) = 'array'),
  conflicts jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(conflicts) = 'array'),
  model text CHECK (length(model) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX research_answers_expiry ON public.research_answers (expires_at);

CREATE TABLE public.research_ask_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_ask_log_key ON public.research_ask_log (key_hash, created_at);

-- ============== SEEDS (structure, not content) ==============
INSERT INTO public.research_countries (code, name, slug, is_active, sort) VALUES
  ('RW', 'Rwanda', 'rwanda', true, 1), ('UG', 'Uganda', 'uganda', false, 2), ('KE', 'Kenya', 'kenya', false, 3),
  ('TZ', 'Tanzania', 'tanzania', false, 4), ('BI', 'Burundi', 'burundi', false, 5), ('CD', 'DR Congo', 'dr-congo', false, 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.research_regions (country_id, level, name, slug, sort)
SELECT c.id, 'province', r.name, r.slug, r.sort
FROM public.research_countries c, (VALUES
  ('Kigali City', 'kigali', 1), ('Northern Province', 'northern', 2), ('Southern Province', 'southern', 3),
  ('Eastern Province', 'eastern', 4), ('Western Province', 'western', 5)) AS r (name, slug, sort)
WHERE c.code = 'RW'
ON CONFLICT (country_id, slug) DO NOTHING;

INSERT INTO public.research_topics (slug, name, sort) VALUES
  ('economy', 'Economy', 1), ('education', 'Education', 2), ('population', 'Population', 3),
  ('agriculture', 'Agriculture', 4), ('tourism', 'Tourism', 5), ('business', 'Business', 6),
  ('housing', 'Housing & Property', 7), ('health', 'Health', 8), ('technology', 'Technology', 9),
  ('logistics', 'Logistics & Trade', 10), ('market', 'Market Information', 11),
  ('employment', 'Employment & Youth', 12), ('finance', 'Finance & Banking', 13),
  ('environment', 'Environment & Climate', 14), ('infrastructure', 'Infrastructure & Energy', 15),
  ('governance', 'Governance & Public Services', 16)
ON CONFLICT (slug) DO NOTHING;

-- ============== ROW-LEVEL SECURITY ==============
ALTER TABLE public.research_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_ask_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads active countries" ON public.research_countries FOR SELECT TO anon, authenticated
  USING (is_active OR public.is_service_staff('data'));
CREATE POLICY "Anyone reads regions" ON public.research_regions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone reads topics" ON public.research_topics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public reads what is published" ON public.research_items FOR SELECT TO anon, authenticated
  USING (public.ent_is_public(status, publish_at) OR public.is_service_staff('data'));
-- parts of an item are visible when the item is (the item policy applies inside the EXISTS)
CREATE POLICY "Public reads stats of public items" ON public.research_stats FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.research_items i WHERE i.id = item_id));
CREATE POLICY "Public reads sources of public items" ON public.research_sources FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.research_items i WHERE i.id = item_id));
CREATE POLICY "Public reads links of public items" ON public.research_item_links FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.research_items i WHERE i.id = item_id)
     AND EXISTS (SELECT 1 FROM public.research_items r WHERE r.id = related_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['research_countries', 'research_regions', 'research_topics', 'research_items',
                           'research_stats', 'research_sources', 'research_documents', 'research_item_links'] LOOP
    EXECUTE format($p$CREATE POLICY "Research staff manage" ON public.%I FOR ALL TO authenticated
      USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'))$p$, t);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.research_countries, public.research_regions, public.research_topics,
  public.research_items, public.research_stats, public.research_sources, public.research_documents,
  public.research_item_links FROM anon;
REVOKE ALL ON public.research_questions, public.research_answers, public.research_ask_log FROM anon, authenticated;

-- ============== HOUSEKEEPING ==============
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.research_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['research_items', 'research_countries', 'research_regions', 'research_topics',
                           'research_sources', 'research_documents'] LOOP
    EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- ============== STORAGE ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('research', 'research', false, 26214400, ARRAY[
  'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip', 'application/json', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Research staff upload documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'research' AND public.is_service_staff('data'));
CREATE POLICY "Research staff read documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'research' AND public.is_service_staff('data'));
CREATE POLICY "Research staff replace documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'research' AND public.is_service_staff('data'))
  WITH CHECK (bucket_id = 'research' AND public.is_service_staff('data'));
CREATE POLICY "Research staff remove documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'research' AND public.is_service_staff('data'));

-- ============== SEARCH ==============
-- Runs with the caller's rights and always applies the public rule, so the
-- service role never gets a draft through it either. An empty query browses.
CREATE OR REPLACE FUNCTION public.research_search(
  p_query text DEFAULT '', p_country text DEFAULT NULL, p_kind text DEFAULT NULL, p_topic text DEFAULT NULL,
  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, kind text, title text, summary text, country_slug text, country_name text,
  topic_slug text, topic_name text, region_name text, published_on date, verification text, origin text,
  featured boolean, is_demo boolean, cover_path text, rank real, total bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH params AS (
    SELECT left(btrim(coalesce(p_query, '')), 200) AS q,
           nullif(btrim(coalesce(p_country, '')), '') AS country,
           nullif(btrim(coalesce(p_kind, '')), '') AS kind,
           nullif(btrim(coalesce(p_topic, '')), '') AS topic,
           least(greatest(coalesce(p_limit, 20), 1), 50) AS lim,
           greatest(coalesce(p_offset, 0), 0) AS off
  ), topic_ids AS (
    SELECT t.id FROM public.research_topics t, params p WHERE p.topic IS NOT NULL AND t.slug = p.topic
  ), hits AS (
    SELECT i.id, i.slug, i.kind, i.title, i.summary,
           c.slug AS country_slug, c.name AS country_name, t.slug AS topic_slug, t.name AS topic_name,
           r.name AS region_name, i.published_on, i.verification, i.origin, i.featured, i.is_demo, i.cover_path,
           CASE WHEN p.q = '' THEN 0::real
                ELSE greatest(ts_rank_cd(i.search, websearch_to_tsquery('english', p.q)),
                              extensions.word_similarity(p.q, i.title))::real END AS rank
    FROM public.research_items i
    CROSS JOIN params p
    LEFT JOIN public.research_countries c ON c.id = i.country_id
    LEFT JOIN public.research_topics t ON t.id = i.topic_id
    LEFT JOIN public.research_regions r ON r.id = i.region_id
    WHERE public.ent_is_public(i.status, i.publish_at)
      AND (p.country IS NULL OR c.slug = p.country)
      AND (p.kind IS NULL OR i.kind = p.kind)
      AND (p.topic IS NULL OR i.topic_id IN (SELECT id FROM topic_ids) OR i.subtopic_id IN (SELECT id FROM topic_ids))
      AND (p.q = ''
           OR i.search @@ websearch_to_tsquery('english', p.q)
           OR extensions.word_similarity(p.q, i.title) > 0.45
           OR i.title ILIKE '%' || p.q || '%')
  )
  SELECT h.id, h.slug, h.kind, h.title, h.summary, h.country_slug, h.country_name, h.topic_slug, h.topic_name,
         h.region_name, h.published_on, h.verification, h.origin, h.featured, h.is_demo, h.cover_path, h.rank,
         count(*) OVER () AS total
  FROM hits h, params p
  ORDER BY h.rank DESC, h.featured DESC, h.published_on DESC NULLS LAST, h.title
  LIMIT (SELECT lim FROM params) OFFSET (SELECT off FROM params);
$$;

-- Public items per kind, for the "Explore data" tiles
CREATE OR REPLACE FUNCTION public.research_counts()
RETURNS TABLE (kind text, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT i.kind, count(*) FROM public.research_items i
  WHERE public.ent_is_public(i.status, i.publish_at)
  GROUP BY i.kind ORDER BY i.kind;
$$;

-- Public items per region of a country, for the country page
CREATE OR REPLACE FUNCTION public.research_region_counts(p_country text)
RETURNS TABLE (region_id uuid, slug text, name text, level text, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT r.id, r.slug, r.name, r.level,
         (SELECT count(*) FROM public.research_items i
           WHERE i.region_id = r.id AND public.ent_is_public(i.status, i.publish_at)) AS n
  FROM public.research_regions r
  JOIN public.research_countries c ON c.id = r.country_id
  WHERE c.slug = nullif(btrim(coalesce(p_country, '')), '')
  ORDER BY r.parent_id NULLS FIRST, r.sort, r.name;
$$;

-- The questions people ask most (the table itself stays private)
CREATE OR REPLACE FUNCTION public.research_trending_questions(p_limit integer DEFAULT 8)
RETURNS TABLE (question text, ask_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.question, q.ask_count FROM public.research_questions q
  ORDER BY q.ask_count DESC, q.last_asked_at DESC
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

-- One public item with its figures, sources and related items (null when it isn't public)
CREATE OR REPLACE FUNCTION public.research_item_detail(p_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', i.id, 'slug', i.slug, 'kind', i.kind, 'title', i.title, 'summary', i.summary, 'body', i.body,
    'period_start', i.period_start, 'period_end', i.period_end, 'published_on', i.published_on,
    'author', i.author, 'organization', i.organization, 'methodology', i.methodology, 'origin', i.origin,
    'source_name', i.source_name, 'source_url', i.source_url, 'verification', i.verification, 'verified_at', i.verified_at,
    'featured', i.featured, 'is_demo', i.is_demo, 'keywords', to_jsonb(i.keywords), 'tags', to_jsonb(i.tags),
    'cover_path', i.cover_path, 'created_at', i.created_at, 'updated_at', i.updated_at,
    'country', (SELECT jsonb_build_object('slug', c.slug, 'name', c.name) FROM public.research_countries c WHERE c.id = i.country_id),
    'region', (SELECT jsonb_build_object('slug', r.slug, 'name', r.name, 'level', r.level) FROM public.research_regions r WHERE r.id = i.region_id),
    'topic', (SELECT jsonb_build_object('slug', t.slug, 'name', t.name) FROM public.research_topics t WHERE t.id = i.topic_id),
    'subtopic', (SELECT jsonb_build_object('slug', t.slug, 'name', t.name) FROM public.research_topics t WHERE t.id = i.subtopic_id),
    'stats', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'label', s.label, 'value', s.value, 'unit', s.unit, 'period_label', s.period_label,
        'period_date', s.period_date, 'series', s.series, 'sort', s.sort,
        'region', (SELECT jsonb_build_object('slug', r.slug, 'name', r.name) FROM public.research_regions r WHERE r.id = s.region_id))
        ORDER BY s.series NULLS FIRST, s.period_date NULLS FIRST, s.sort, s.label)
      FROM public.research_stats s WHERE s.item_id = i.id), '[]'::jsonb),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'url', s.url, 'publisher', s.publisher, 'source_type', s.source_type,
        'published_on', s.published_on, 'retrieved_at', s.retrieved_at, 'note', s.note)
        ORDER BY s.sort, s.title)
      FROM public.research_sources s WHERE s.item_id = i.id), '[]'::jsonb),
    'related', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'kind', r.kind, 'title', r.title)
        ORDER BY r.published_on DESC NULLS LAST, r.title)
      FROM public.research_item_links l JOIN public.research_items r ON r.id = l.related_id
      WHERE l.item_id = i.id AND public.ent_is_public(r.status, r.publish_at)), '[]'::jsonb)
  )
  FROM public.research_items i
  WHERE i.slug = nullif(btrim(coalesce(p_slug, '')), '') AND public.ent_is_public(i.status, i.publish_at);
$$;

-- Counts a question asked (the research-ask function only; no one is named)
CREATE OR REPLACE FUNCTION public.research_record_question(p_question text, p_country text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q text := left(btrim(coalesce(p_question, '')), 300);
  v_norm text;
  v_country uuid;
BEGIN
  v_norm := regexp_replace(lower(btrim(v_q)), '\s+', ' ', 'g');
  v_norm := regexp_replace(v_norm, '[?\s]+$', '');
  IF v_norm = '' THEN
    RETURN;
  END IF;
  SELECT id INTO v_country FROM public.research_countries WHERE slug = nullif(btrim(coalesce(p_country, '')), '');
  INSERT INTO public.research_questions (question, normalized, country_id)
  VALUES (v_q, v_norm, v_country)
  ON CONFLICT (normalized) DO UPDATE
    SET ask_count = public.research_questions.ask_count + 1, last_asked_at = now(),
        country_id = coalesce(EXCLUDED.country_id, public.research_questions.country_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.research_words(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_words(text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_search(text, text, text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_region_counts(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.research_trending_questions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_trending_questions(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_item_detail(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.research_record_question(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_record_question(text, text) TO service_role;

-- ISOKO Information Hub, round 2: how the knowledge base fills itself.
--
-- Three feeds add to the hub beside what staff type in by hand:
--   * the answer engine (research-ask) saves a DRAFT when it had to answer from
--     outside sources, so an analyst can check it and publish it;
--   * document ingestion (research-ingest) turns an uploaded PDF, spreadsheet or
--     text file into a DRAFT with its figures;
--   * the World Bank connector (research-import) publishes official indicator
--     series for every active country and keeps them up to date.
-- Items remember where they came from (import_source), the key that keeps a
-- re-run from duplicating them (review_hash for questions, import_key for
-- connectors) and what the analyst should check (review_note). Every run of a
-- feed is logged in research_imports. Nothing is seeded.
-- Same conventions as 20261003100000_research_hub.sql.

-- ============== COLUMNS ==============
ALTER TABLE public.research_items
  ADD COLUMN review_hash text UNIQUE,            -- sha256 hex of the normalized question + '|' + country slug
  ADD COLUMN import_key text UNIQUE,             -- connector idempotency key, e.g. 'worldbank:RW:SP.POP.TOTL'
  ADD COLUMN import_source text CHECK (import_source IN ('question', 'document', 'worldbank')),
  ADD COLUMN imported_at timestamptz,
  ADD COLUMN review_note text CHECK (length(review_note) <= 2000);
COMMENT ON COLUMN public.research_items.import_source IS 'NULL when staff wrote the item; otherwise the feed that created it';
COMMENT ON COLUMN public.research_items.review_note IS 'What the analyst should check before publishing, written by the engine or importer';

ALTER TABLE public.research_stats
  ADD COLUMN source_url text CHECK (source_url IS NULL OR source_url ~ '^https://');

CREATE INDEX research_items_review ON public.research_items (import_source, status, created_at DESC);

-- ============== IMPORT RUNS ==============
CREATE TABLE public.research_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('worldbank', 'document')),
  country_id uuid REFERENCES public.research_countries (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  created_items integer NOT NULL DEFAULT 0,
  updated_items integer NOT NULL DEFAULT 0,
  error text CHECK (length(error) <= 2000),
  triggered_by uuid
);
CREATE INDEX research_imports_recent ON public.research_imports (started_at DESC);

ALTER TABLE public.research_imports ENABLE ROW LEVEL SECURITY;
-- Staff read the log; only the server (service role, which bypasses RLS) writes it.
CREATE POLICY "Research staff read imports" ON public.research_imports FOR SELECT TO authenticated
  USING (public.is_service_staff('data'));
REVOKE ALL ON public.research_imports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.research_imports FROM authenticated;

-- ============== FUNCTIONS ==============
-- The review queue: drafts the engine wrote or that were extracted from a
-- document, newest first, with their sources. Runs as the caller, so the row
-- policies decide who sees anything (visitors and customers: nothing).
CREATE OR REPLACE FUNCTION public.research_review_queue(p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, slug text, kind text, title text, summary text, country_name text, review_note text,
               import_source text, created_at timestamptz, sources jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT i.id, i.slug, i.kind, i.title, i.summary, c.name, i.review_note, i.import_source, i.created_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('title', s.title, 'url', s.url, 'publisher', s.publisher) ORDER BY s.sort, s.retrieved_at)
                   FROM public.research_sources s WHERE s.item_id = i.id), '[]'::jsonb)
  FROM public.research_items i
  LEFT JOIN public.research_countries c ON c.id = i.country_id
  WHERE i.status = 'draft' AND i.import_source IN ('question', 'document')
  ORDER BY i.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- Throws away a draft a feed created (never one staff wrote, never anything
-- published). Data analysts and admins only.
CREATE OR REPLACE FUNCTION public.research_discard_draft(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_service_staff('data') THEN
    RAISE EXCEPTION 'Only data analysts and admins can discard drafts' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.research_items WHERE id = p_id AND status = 'draft' AND import_source IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only drafts written by the answer engine or extracted from a document can be discarded here'
      USING ERRCODE = 'P0002';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.research_review_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_review_queue(integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.research_discard_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_discard_draft(uuid) TO authenticated, service_role;

-- ============== STORAGE ==============
-- Documents for ingestion are uploaded under ingest/ in the research bucket;
-- tab-separated files join the accepted types.
UPDATE storage.buckets SET allowed_mime_types = array_append(allowed_mime_types, 'text/tab-separated-values')
WHERE id = 'research' AND NOT ('text/tab-separated-values' = ANY (allowed_mime_types));

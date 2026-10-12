-- Evidence a reader can actually see.
--
-- Until now every file attached to a research item was staff-only, by design:
-- the bucket is private, the table has no public read, and the desk told the
-- analyst "visitors never see or download these". That was the right default
-- while the files were questionnaires and raw datasets. It is the wrong one
-- for the photograph of the site, the recording of the interview and the
-- video of the field visit -- the things that show a finding is true. A
-- reader who cannot see the evidence has to take the number on trust.
--
-- The fix is NOT to open the bucket. Most of what is in it should stay shut:
-- draft spreadsheets, internal notes, personal data inside a questionnaire.
-- Instead each file gets a flag and somebody has to set it. The default is
-- false, so everything uploaded before today stays exactly as private as it
-- was when it was uploaded, and nothing becomes public because a migration
-- ran. Publishing evidence is a decision an analyst makes per file.
--
-- Two gates have to open for a visitor to reach a file, and they are checked
-- in different places:
--
--   * the row, so the page knows the file exists -- a SELECT policy on
--     research_documents limited to flagged rows of public items;
--   * the bytes, so storage will hand them over -- a SELECT policy on
--     storage.objects for the 'research' bucket, which defers to the same
--     question about the same path.
--
-- Unflag a file and both shut again at once, because there is one fact and
-- two readers of it. Nothing is copied into a public bucket, so there is no
-- second copy to forget about: the file that stops being evidence stops being
-- reachable, rather than lingering under a URL nobody is watching.

ALTER TABLE public.research_documents
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN caption text CHECK (caption IS NULL OR length(caption) <= 300),
  ADD COLUMN sort integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.research_documents.is_public IS
  'Shown on the hub as evidence. False by default: staff decide per file.';
COMMENT ON COLUMN public.research_documents.caption IS
  'What the reader is looking at. Doubles as the alt text for a photograph.';

-- The public page reads the flagged files of one item in order.
CREATE INDEX research_documents_evidence ON public.research_documents (item_id, sort, created_at)
  WHERE is_public;
-- The storage policy below looks a file up by its path on every object read.
CREATE INDEX research_documents_path ON public.research_documents (path);

-- ============== WHO MAY SEE WHAT ==============

-- Storage policies cannot see public.research_documents on their own: the
-- policy is evaluated as the caller, and the caller is anon, who has no read
-- on that table beyond the one added below -- which would make the two
-- policies depend on each other. SECURITY DEFINER settles the question once,
-- as the owner, and both sides ask it.
--
-- STABLE, not IMMUTABLE: the answer changes when staff unflag a file or
-- unpublish an item, and must not be cached across statements.
CREATE OR REPLACE FUNCTION public.research_evidence_is_public(_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.research_documents d
      JOIN public.research_items i ON i.id = d.item_id
     WHERE d.path = _path
       AND d.is_public
       AND public.ent_is_public(i.status, i.publish_at)
  );
$$;

-- A policy is evaluated as the querying role, so every role whose policy calls
-- this function needs EXECUTE on it -- the lesson of 20261009200000, where
-- revoking a policy's function denied the policy itself. anon is included on
-- purpose: a signed-out reader is who this whole change is for.
REVOKE EXECUTE ON FUNCTION public.research_evidence_is_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_evidence_is_public(text) TO anon, authenticated, service_role;

-- The row. Written like the stats and sources policies above it: the EXISTS
-- leans on research_items' own policy to decide whether the item is public,
-- rather than repeating the status rule and letting the two drift apart.
CREATE POLICY "Public reads evidence of public items" ON public.research_documents FOR SELECT TO anon, authenticated
  USING (is_public AND EXISTS (SELECT 1 FROM public.research_items i WHERE i.id = item_id));

-- The bytes. The bucket stays private: this grants read on flagged objects
-- only, which is what lets an anonymous visitor sign a URL for a photograph
-- and still be refused the questionnaire sitting next to it in the same
-- folder. In storage.objects the path lives in "name".
CREATE POLICY "Anyone reads published research evidence" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'research' AND public.research_evidence_is_public(name));

-- ============== THE PUBLIC ITEM ==============

-- Unchanged except for 'evidence'. SECURITY INVOKER, so the policy above is
-- what actually decides; the is_public test is repeated here so the intent is
-- readable without going to look up the policy.
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
    'evidence', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'path', d.path, 'caption', d.caption, 'mime', d.mime, 'size', d.size)
        ORDER BY d.sort, d.created_at)
      FROM public.research_documents d WHERE d.item_id = i.id AND d.is_public), '[]'::jsonb),
    'related', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'kind', r.kind, 'title', r.title)
        ORDER BY r.published_on DESC NULLS LAST, r.title)
      FROM public.research_item_links l JOIN public.research_items r ON r.id = l.related_id
      WHERE l.item_id = i.id AND public.ent_is_public(r.status, r.publish_at)), '[]'::jsonb)
  )
  FROM public.research_items i
  WHERE i.slug = nullif(btrim(coalesce(p_slug, '')), '') AND public.ent_is_public(i.status, i.publish_at);
$$;

GRANT EXECUTE ON FUNCTION public.research_item_detail(text) TO anon, authenticated, service_role;

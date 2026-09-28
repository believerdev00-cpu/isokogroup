-- Isoko Entertainment as a media platform: films, podcasts, photo studio,
-- art & design, fashion, live streams and event coverage.
--
-- Who does what:
--   * Anyone (signed in or not) browses what is published: posters, portfolios,
--     events, profiles. Full films and episodes kept in Storage stay for
--     subscribers (the private 'entertainment' bucket signs links only for them).
--   * Media staff (role media_staff, or admins) create, edit, schedule, feature,
--     archive and delete everything. Creators don't self-publish yet; rows keep
--     an owner column so they can later.
--   * A signed-in person saves items to their own list and sees only theirs.
--
-- Every piece of content has a status: draft, published, scheduled (goes public
-- at publish_at, no job needed) or archived. Content marked is_demo is sample
-- content and the site labels it so.

-- ============== MEDIA STAFF ==============
CREATE OR REPLACE FUNCTION public.is_service_staff(_service text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text = CASE _service
        WHEN 'travel' THEN 'travel_staff'
        WHEN 'consultancy' THEN 'consultancy_staff'
        WHEN 'data' THEN 'data_analyst'
        WHEN 'entertainment' THEN 'media_staff'
      END
  );
$$;

-- Published, or scheduled and its time has come
CREATE OR REPLACE FUNCTION public.ent_is_public(_status text, _publish_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _status = 'published' OR (_status = 'scheduled' AND _publish_at IS NOT NULL AND _publish_at <= now());
$$;

-- ============== CATEGORIES ==============
CREATE TABLE public.ent_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('film', 'podcast', 'photo', 'art', 'fashion', 'live', 'event')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, slug)
);

INSERT INTO public.ent_categories (section, slug, name, sort) VALUES
  ('film', 'drama', 'Drama', 1), ('film', 'comedy', 'Comedy', 2), ('film', 'documentary', 'Documentary', 3),
  ('film', 'action', 'Action', 4), ('film', 'romance', 'Romance', 5), ('film', 'short-film', 'Short film', 6),
  ('podcast', 'business', 'Business', 1), ('podcast', 'culture', 'Culture', 2), ('podcast', 'tech', 'Tech', 3),
  ('podcast', 'faith', 'Faith', 4), ('podcast', 'sports', 'Sports', 5), ('podcast', 'lifestyle', 'Lifestyle', 6),
  ('photo', 'portraits', 'Portraits', 1), ('photo', 'weddings', 'Weddings', 2), ('photo', 'events', 'Events', 3),
  ('photo', 'commercial', 'Commercial', 4), ('photo', 'studio', 'Studio', 5),
  ('art', 'graphic-design', 'Graphic Design', 1), ('art', 'digital-art', 'Digital Art', 2),
  ('art', 'illustration', 'Illustration', 3), ('art', 'branding', 'Branding', 4), ('art', 'ui-ux', 'UI/UX', 5),
  ('art', 'posters', 'Posters', 6), ('art', 'photography-art', 'Photography Art', 7),
  ('art', 'creative-projects', 'Creative Projects', 8),
  ('fashion', 'editorial', 'Editorial', 1), ('fashion', 'campaigns', 'Campaigns', 2),
  ('fashion', 'runway', 'Runway', 3), ('fashion', 'lookbooks', 'Lookbooks', 4),
  ('live', 'music', 'Music', 1), ('live', 'talk', 'Talk', 2), ('live', 'sports', 'Sports', 3),
  ('live', 'church', 'Church', 4), ('live', 'events', 'Events', 5),
  ('event', 'weddings', 'Weddings', 1), ('event', 'concerts', 'Concerts', 2),
  ('event', 'conferences', 'Conferences', 3), ('event', 'sports', 'Sports', 4),
  ('event', 'corporate', 'Corporate Events', 5), ('event', 'festivals', 'Festivals', 6),
  ('event', 'private', 'Private Events', 7);

-- ============== PEOPLE ==============
-- Directors, cast, podcast hosts, photographers, artists, designers, models and
-- studios. Only public profile fields live here; contact details are staff-only.
CREATE TABLE public.ent_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  kinds text[] NOT NULL CHECK (cardinality(kinds) > 0 AND kinds <@ ARRAY[
    'director', 'actor', 'host', 'photographer', 'artist', 'designer', 'model', 'studio']),
  headline text CHECK (length(headline) <= 160),
  bio text CHECK (length(bio) <= 4000),
  location text CHECK (length(location) <= 120),
  avatar_path text,
  cover_path text,
  services text[] NOT NULL DEFAULT '{}',
  -- public profile details the person agreed to show (e.g. a model's height, sizes, experience)
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  links jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(links) = 'object'),
  -- Isoko represents adults only; staff confirm it before a model profile goes public
  adult_confirmed boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK (NOT ('model' = ANY (kinds)) OR status IN ('draft', 'archived') OR adult_confirmed)
);

CREATE TABLE public.ent_creator_contacts (
  creator_id uuid PRIMARY KEY REFERENCES public.ent_creators (id) ON DELETE CASCADE,
  email text CHECK (length(email) <= 200),
  phone text CHECK (length(phone) <= 40),
  notes text CHECK (length(notes) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============== FILMS AND PODCAST SHOWS ==============
-- Where something plays: 'storage' is a path in the private 'entertainment'
-- bucket (subscribers only); 'youtube' is a video id or link, which anyone can
-- open, so only free items may use it.
CREATE TABLE public.ent_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text NOT NULL CHECK (kind IN ('film', 'podcast')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  tagline text CHECK (length(tagline) <= 200),
  description text CHECK (length(description) <= 5000),
  category_id uuid REFERENCES public.ent_categories (id) ON DELETE SET NULL,
  genres text[] NOT NULL DEFAULT '{}',
  country text CHECK (length(country) <= 60),
  language text CHECK (length(language) <= 60),
  age_rating text CHECK (length(age_rating) <= 10),
  release_date date,
  duration_minutes integer CHECK (duration_minutes BETWEEN 0 AND 1000),
  poster_path text,
  backdrop_path text,
  trailer_youtube text CHECK (length(trailer_youtube) <= 300),
  watch_source text CHECK (watch_source IN ('storage', 'youtube')),
  watch_ref text CHECK (length(watch_ref) <= 500),
  is_free boolean NOT NULL DEFAULT false,
  trend_rank smallint CHECK (trend_rank BETWEEN 1 AND 100),
  legacy_id uuid UNIQUE, -- the row it came from in the old entertainment table
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK ((watch_source IS NULL) = (watch_ref IS NULL)),
  CHECK (watch_source IS DISTINCT FROM 'youtube' OR is_free)
);

CREATE TABLE public.ent_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id uuid NOT NULL REFERENCES public.ent_titles (id) ON DELETE CASCADE,
  creator_id uuid REFERENCES public.ent_creators (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  role text NOT NULL CHECK (role IN ('director', 'cast', 'host', 'guest', 'producer', 'writer')),
  character_name text CHECK (length(character_name) <= 120),
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE public.ent_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id uuid NOT NULL REFERENCES public.ent_titles (id) ON DELETE CASCADE,
  season integer NOT NULL DEFAULT 1 CHECK (season BETWEEN 1 AND 100),
  number integer NOT NULL CHECK (number BETWEEN 1 AND 10000),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description text CHECK (length(description) <= 5000),
  format text NOT NULL DEFAULT 'audio' CHECK (format IN ('audio', 'video')),
  duration_minutes integer CHECK (duration_minutes BETWEEN 0 AND 1000),
  thumb_path text,
  watch_source text CHECK (watch_source IN ('storage', 'youtube')),
  watch_ref text CHECK (length(watch_ref) <= 500),
  is_free boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title_id, season, number),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK ((watch_source IS NULL) = (watch_ref IS NULL)),
  CHECK (watch_source IS DISTINCT FROM 'youtube' OR is_free)
);

-- ============== PHOTO STUDIO, ART & DESIGN, FASHION ==============
-- A work is one portfolio piece or project; its cover size lets galleries lay
-- out masonry columns before the images load.
CREATE TABLE public.ent_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  section text NOT NULL CHECK (section IN ('photo', 'art', 'fashion')),
  category_id uuid REFERENCES public.ent_categories (id) ON DELETE SET NULL,
  creator_id uuid REFERENCES public.ent_creators (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text CHECK (length(description) <= 5000),
  cover_path text,
  cover_w integer CHECK (cover_w > 0),
  cover_h integer CHECK (cover_h > 0),
  tags text[] NOT NULL DEFAULT '{}',
  year integer CHECK (year BETWEEN 1900 AND 2100),
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  trend_rank smallint CHECK (trend_rank BETWEEN 1 AND 100),
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL)
);

CREATE TABLE public.ent_work_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.ent_works (id) ON DELETE CASCADE,
  path text NOT NULL,
  w integer CHECK (w > 0),
  h integer CHECK (h > 0),
  caption text CHECK (length(caption) <= 300),
  kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'before', 'after')),
  sort integer NOT NULL DEFAULT 0
);

-- Fashion collections, campaigns, shows and lookbooks, made of works
CREATE TABLE public.ent_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text NOT NULL CHECK (kind IN ('collection', 'campaign', 'show', 'lookbook', 'editorial')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text CHECK (length(description) <= 5000),
  designer_id uuid REFERENCES public.ent_creators (id) ON DELETE SET NULL,
  season text CHECK (length(season) <= 60),
  held_on date,
  cover_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL)
);

CREATE TABLE public.ent_collection_works (
  collection_id uuid NOT NULL REFERENCES public.ent_collections (id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.ent_works (id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, work_id)
);

-- ============== EVENT COVERAGE ==============
-- Weddings and private events are people's own moments: they go public only
-- once the client has agreed (publish_consent).
CREATE TABLE public.ent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id uuid REFERENCES public.ent_categories (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text CHECK (length(description) <= 5000),
  held_on date,
  location text CHECK (length(location) <= 160),
  cover_path text,
  video_youtube text CHECK (length(video_youtube) <= 300),
  publish_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK (status IN ('draft', 'archived') OR publish_consent)
);

CREATE TABLE public.ent_event_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ent_events (id) ON DELETE CASCADE,
  path text NOT NULL,
  w integer CHECK (w > 0),
  h integer CHECK (h > 0),
  caption text CHECK (length(caption) <= 300),
  sort integer NOT NULL DEFAULT 0
);

-- ============== LIVE ==============
-- A stream plays from YouTube (the id or link). "Live" is what staff set when
-- the broadcast actually starts; there is no viewer count until one can be
-- read from the provider.
CREATE TABLE public.ent_live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text CHECK (length(description) <= 5000),
  category_id uuid REFERENCES public.ent_categories (id) ON DELETE SET NULL,
  host_id uuid REFERENCES public.ent_creators (id) ON DELETE SET NULL,
  thumb_path text,
  provider text NOT NULL DEFAULT 'youtube' CHECK (provider IN ('youtube')),
  stream_ref text CHECK (length(stream_ref) <= 300),
  scheduled_at timestamptz,
  live_state text NOT NULL DEFAULT 'upcoming' CHECK (live_state IN ('upcoming', 'live', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_ref text CHECK (length(recording_ref) <= 300),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),
  CHECK (live_state <> 'live' OR (stream_ref IS NOT NULL AND started_at IS NOT NULL)),
  CHECK (live_state <> 'ended' OR ended_at IS NOT NULL)
);

-- ============== SAVES ==============
CREATE TABLE public.ent_saves (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('title', 'work', 'collection', 'event', 'creator')),
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX ent_titles_browse ON public.ent_titles (kind, status, created_at DESC);
CREATE INDEX ent_episodes_title ON public.ent_episodes (title_id, season, number);
CREATE INDEX ent_works_browse ON public.ent_works (section, status, created_at DESC);
CREATE INDEX ent_works_creator ON public.ent_works (creator_id);
CREATE INDEX ent_work_images_work ON public.ent_work_images (work_id, sort);
CREATE INDEX ent_event_images_event ON public.ent_event_images (event_id, sort);
CREATE INDEX ent_credits_title ON public.ent_credits (title_id, sort);
CREATE INDEX ent_live_browse ON public.ent_live_streams (live_state, scheduled_at);
CREATE INDEX ent_events_browse ON public.ent_events (status, held_on DESC);

-- ============== ROW-LEVEL SECURITY ==============
ALTER TABLE public.ent_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_creator_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_work_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_collection_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_event_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_saves ENABLE ROW LEVEL SECURITY;

-- Content with a status: the public sees what is public, staff see everything
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ent_creators', 'ent_titles', 'ent_episodes', 'ent_works', 'ent_collections',
                           'ent_events', 'ent_live_streams'] LOOP
    EXECUTE format($p$CREATE POLICY "Public reads what is published" ON public.%I FOR SELECT TO anon, authenticated
      USING (public.ent_is_public(status, publish_at) OR public.is_service_staff('entertainment'))$p$, t);
    EXECUTE format($p$CREATE POLICY "Media staff manage" ON public.%I FOR ALL TO authenticated
      USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'))$p$, t);
  END LOOP;
END $$;

-- An episode is public only when its show is too
DROP POLICY "Public reads what is published" ON public.ent_episodes;
CREATE POLICY "Public reads what is published" ON public.ent_episodes FOR SELECT TO anon, authenticated
  USING ((public.ent_is_public(status, publish_at) AND EXISTS (SELECT 1 FROM public.ent_titles p WHERE p.id = title_id))
         OR public.is_service_staff('entertainment'));

-- Parts of something: visible when their parent is
CREATE POLICY "Public reads credits of what is published" ON public.ent_credits FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ent_titles p WHERE p.id = title_id));
CREATE POLICY "Public reads images of what is published" ON public.ent_work_images FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ent_works p WHERE p.id = work_id));
CREATE POLICY "Public reads works of what is published" ON public.ent_collection_works FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ent_collections p WHERE p.id = collection_id)
     AND EXISTS (SELECT 1 FROM public.ent_works w WHERE w.id = work_id));
CREATE POLICY "Public reads images of what is published" ON public.ent_event_images FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ent_events p WHERE p.id = event_id));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ent_credits', 'ent_work_images', 'ent_collection_works', 'ent_event_images'] LOOP
    EXECUTE format($p$CREATE POLICY "Media staff manage" ON public.%I FOR ALL TO authenticated
      USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'))$p$, t);
  END LOOP;
END $$;

CREATE POLICY "Anyone reads categories" ON public.ent_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Media staff manage" ON public.ent_categories FOR ALL TO authenticated
  USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'));

CREATE POLICY "Media staff only" ON public.ent_creator_contacts FOR ALL TO authenticated
  USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'));

CREATE POLICY "Own saves" ON public.ent_saves FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Only signed-in people act; visitors only read
REVOKE INSERT, UPDATE, DELETE ON public.ent_categories, public.ent_creators, public.ent_creator_contacts,
  public.ent_titles, public.ent_credits, public.ent_episodes, public.ent_works, public.ent_work_images,
  public.ent_collections, public.ent_collection_works, public.ent_events, public.ent_event_images,
  public.ent_live_streams, public.ent_saves FROM anon;
REVOKE ALL ON public.ent_creator_contacts, public.ent_saves FROM anon;

-- ============== HOUSEKEEPING ==============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ent_creators', 'ent_creator_contacts', 'ent_titles', 'ent_episodes', 'ent_works',
                           'ent_collections', 'ent_events', 'ent_live_streams'] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
  -- who published, edited or removed what
  FOREACH t IN ARRAY ARRAY['ent_categories', 'ent_creators', 'ent_creator_contacts', 'ent_titles', 'ent_credits',
                           'ent_episodes', 'ent_works', 'ent_collections', 'ent_events', 'ent_live_streams'] LOOP
    EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- ============== SEARCH ==============
-- One search across the platform; runs with the visitor's own rights, so it
-- only ever finds what they may see.
CREATE OR REPLACE FUNCTION public.ent_search(p_query text, p_limit integer DEFAULT 30)
RETURNS TABLE (kind text, id uuid, slug text, title text, subtitle text, image_path text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH q AS (
    SELECT '%' || replace(replace(replace(left(trim(p_query), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  ), hits AS (
    SELECT t.kind, t.id, t.slug, t.title, coalesce(t.tagline, array_to_string(t.genres, ', ')) AS subtitle,
           t.poster_path AS image_path, 1 AS pri
      FROM ent_titles t, q WHERE t.title ILIKE q.pat OR t.tagline ILIKE q.pat OR array_to_string(t.genres, ' ') ILIKE q.pat
    UNION ALL
    SELECT 'creator', c.id, c.slug, c.display_name, array_to_string(c.kinds, ', '), c.avatar_path, 2
      FROM ent_creators c, q WHERE c.display_name ILIKE q.pat OR c.headline ILIKE q.pat
    UNION ALL
    SELECT 'work:' || w.section, w.id, w.slug, w.title, array_to_string(w.tags, ', '), w.cover_path, 3
      FROM ent_works w, q WHERE w.title ILIKE q.pat OR array_to_string(w.tags, ' ') ILIKE q.pat
    UNION ALL
    SELECT 'collection', c.id, c.slug, c.title, c.kind, c.cover_path, 3
      FROM ent_collections c, q WHERE c.title ILIKE q.pat
    UNION ALL
    SELECT 'event', e.id, e.slug, e.title, e.location, e.cover_path, 3
      FROM ent_events e, q WHERE e.title ILIKE q.pat OR e.location ILIKE q.pat
    UNION ALL
    SELECT 'live', l.id, l.slug, l.title, l.live_state, l.thumb_path, 2
      FROM ent_live_streams l, q WHERE l.title ILIKE q.pat
  )
  SELECT kind, id, slug, title, subtitle, image_path FROM hits
  WHERE length(trim(p_query)) >= 2
  ORDER BY pri, title
  LIMIT least(greatest(p_limit, 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.ent_search(text, integer) TO anon, authenticated;

-- ============== STORAGE ==============
-- Posters, thumbnails and display images: public, web-sized images only.
-- Full films, episodes and originals stay in the private 'entertainment' bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media-public', 'media-public', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Media staff upload display images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-public' AND public.is_service_staff('entertainment'));
CREATE POLICY "Media staff replace display images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media-public' AND public.is_service_staff('entertainment'))
  WITH CHECK (bucket_id = 'media-public' AND public.is_service_staff('entertainment'));
CREATE POLICY "Media staff remove display images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media-public' AND public.is_service_staff('entertainment'));

-- Media staff manage the private film and episode files too (admins already could)
CREATE POLICY "Media staff upload entertainment files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entertainment' AND public.is_service_staff('entertainment'));
CREATE POLICY "Media staff read entertainment files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'entertainment' AND public.is_service_staff('entertainment'));
CREATE POLICY "Media staff remove entertainment files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'entertainment' AND public.is_service_staff('entertainment'));
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav',
                               'image/jpeg', 'image/png', 'image/webp']
WHERE id = 'entertainment';

-- ============== FROM THE OLD TABLE ==============
-- Films and podcasts added before become drafts on the new platform, for staff
-- to add a poster and publish. The old table stays as it is.
INSERT INTO public.ent_titles (slug, kind, title, description, duration_minutes, watch_source, watch_ref,
                               legacy_id, status, created_by)
SELECT coalesce(nullif(regexp_replace(left(regexp_replace(regexp_replace(lower(e.title), '[^a-z0-9]+', '-', 'g'),
         '(^-+|-+$)', '', 'g'), 60), '-+$', ''), ''), e.type) || '-' || left(e.id::text, 8),
       e.type, e.title, e.description, e.duration_minutes,
       CASE WHEN e.media_url IS NOT NULL THEN 'storage' END, e.media_url,
       e.id, 'draft', NULL
FROM public.entertainment e
WHERE NOT EXISTS (SELECT 1 FROM public.ent_titles t WHERE t.legacy_id = e.id);

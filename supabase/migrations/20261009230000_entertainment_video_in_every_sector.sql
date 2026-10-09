-- A video in every Entertainment sector, not just films and episodes.
--
-- Until now only ent_titles and ent_episodes could carry a video. A person's
-- profile, a photo or art piece, a fashion look or collection and an event
-- could only ever be stills, and an event could hold a YouTube link but not an
-- uploaded file. So a photographer could not show a reel, a designer could not
-- show a runway clip, and an event had no way to carry the video the client was
-- actually given.
--
-- The three columns are the same ones ent_titles already uses, so the existing
-- "Playback" control, the player and the free/paid rule all work unchanged:
--
--   watch_source  'storage' (a file in the entertainment bucket) or 'youtube'
--   watch_ref     the storage path, or the YouTube link
--   is_free       whether it plays without a subscription
--
-- is_free defaults to TRUE here, unlike ent_titles. These sectors are the
-- public showcase -- a portfolio nobody can watch is not a portfolio -- and a
-- YouTube link cannot be gated anyway, which is what the last CHECK enforces.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ent_creators', 'ent_works', 'ent_collections', 'ent_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS watch_source text,
      ADD COLUMN IF NOT EXISTS watch_ref text,
      ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT true', t);

    -- added separately so re-running cannot fail on a constraint that is there
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_watch_source_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I
        CHECK (watch_source IS NULL OR watch_source IN (''storage'', ''youtube''))',
        t, t || '_watch_source_check');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_watch_ref_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I
        CHECK (watch_ref IS NULL OR length(watch_ref) <= 500)', t, t || '_watch_ref_check');
    END IF;

    -- a reference without a source, or the other way round, plays nothing
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_watch_pair_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I
        CHECK ((watch_source IS NULL) = (watch_ref IS NULL))', t, t || '_watch_pair_check');
    END IF;

    -- the same rule ent_titles has: an unlisted YouTube link is obscurity, not
    -- access control, so nothing paid may play from one
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_watch_free_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I
        CHECK (watch_source IS DISTINCT FROM ''youtube'' OR is_free)', t, t || '_watch_free_check');
    END IF;
  END LOOP;
END $$;

-- Events already had a YouTube-link-only field. Move those across so the one
-- control shows what is already there; the old column stays for now so nothing
-- that still reads it breaks.
UPDATE public.ent_events
   SET watch_source = 'youtube', watch_ref = video_youtube
 WHERE video_youtube IS NOT NULL
   AND btrim(video_youtube) <> ''
   AND watch_source IS NULL;

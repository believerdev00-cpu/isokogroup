-- A Fashion Hub style can carry a video, like every other sector already can.
--
-- 20261009230000 gave ent_creators, ent_works, ent_collections and ent_events
-- the three watch columns. ent_fashion_designs was left out, so a design was
-- the one thing on the site that could only ever be photographed: a designer
-- could not show the garment moving, which for clothing is most of what there
-- is to see.
--
-- Same three columns, same meaning, same rules as everywhere else:
--
--   watch_source  'storage' (a file in the entertainment bucket) or 'youtube'
--   watch_ref     the storage path, or the YouTube link
--   is_free       whether it plays without a subscription
--
-- is_free defaults to TRUE: the Hub is a shop window, and a garment nobody
-- can look at does not sell. The last CHECK is the rule from the other
-- tables -- an unlisted YouTube link is obscurity, not access control, so
-- nothing paid may play from one.

ALTER TABLE public.ent_fashion_designs
  ADD COLUMN IF NOT EXISTS watch_source text,
  ADD COLUMN IF NOT EXISTS watch_ref text,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ent_fashion_designs_watch_source_check') THEN
    ALTER TABLE public.ent_fashion_designs ADD CONSTRAINT ent_fashion_designs_watch_source_check
      CHECK (watch_source IS NULL OR watch_source IN ('storage', 'youtube'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ent_fashion_designs_watch_ref_check') THEN
    ALTER TABLE public.ent_fashion_designs ADD CONSTRAINT ent_fashion_designs_watch_ref_check
      CHECK (watch_ref IS NULL OR length(watch_ref) <= 500);
  END IF;

  -- a reference without a source, or the other way round, plays nothing
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ent_fashion_designs_watch_pair_check') THEN
    ALTER TABLE public.ent_fashion_designs ADD CONSTRAINT ent_fashion_designs_watch_pair_check
      CHECK ((watch_source IS NULL) = (watch_ref IS NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ent_fashion_designs_watch_free_check') THEN
    ALTER TABLE public.ent_fashion_designs ADD CONSTRAINT ent_fashion_designs_watch_free_check
      CHECK (watch_source IS DISTINCT FROM 'youtube' OR is_free);
  END IF;
END $$;

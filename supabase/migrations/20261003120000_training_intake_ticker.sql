-- Training Center: the live intake ticker on the website
--
-- The homepage shows a moving band of the intakes that are open (or about to
-- open), built from these rows: nothing about it is written by hand. Admins
-- decide what it says by publishing an intake and setting its dates; three new
-- columns let them decide what appears prominently:
--
--   * show_in_ticker   keep one intake out of the band without unpublishing it
--   * is_featured      show it first, marked as a new intake
--   * ticker_priority  the order of the rest (higher first)
--
-- Nothing else changes: every intake already published keeps showing, and the
-- states the band uses (Applications Open, Closing Soon, Coming Soon) are read
-- from the intake's status, dates and free seats, which already exist.

ALTER TABLE training.intakes
  ADD COLUMN IF NOT EXISTS show_in_ticker boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticker_priority smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE training.intakes
    ADD CONSTRAINT intakes_ticker_priority_range CHECK (ticker_priority BETWEEN 0 AND 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN training.intakes.show_in_ticker IS 'Include this intake in the website''s moving intake band.';
COMMENT ON COLUMN training.intakes.is_featured IS 'Show this intake first in the band, marked as a new intake.';
COMMENT ON COLUMN training.intakes.ticker_priority IS 'Order in the band among intakes that are not featured; higher first (0-100).';

-- The band only ever asks for intakes that are open or about to open
CREATE INDEX IF NOT EXISTS intakes_ticker_idx
  ON training.intakes (is_featured DESC, ticker_priority DESC, training_starts_on)
  WHERE show_in_ticker AND status IN ('open', 'upcoming');

-- Regression test for 20261003120000_training_intake_ticker.sql (the columns the
-- website's moving intake band is built from):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/training_ticker.test.sql
--
-- The band itself is served by the Training Center API (training-api/test/ticker.test.ts);
-- what is checked here is the shape of the table and that the schema stays closed
-- to the website's own database roles.
--
-- Rolled back at the end.
BEGIN;

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

-- ---------- The columns an admin sets ----------
SELECT pg_temp.expect((SELECT count(*) FROM information_schema.columns
                       WHERE table_schema = 'training' AND table_name = 'intakes'
                         AND column_name IN ('show_in_ticker', 'is_featured', 'ticker_priority')) = 3,
  'intakes carry show_in_ticker, is_featured and ticker_priority');
SELECT pg_temp.expect((SELECT bool_and(is_nullable = 'NO') FROM information_schema.columns
                       WHERE table_schema = 'training' AND table_name = 'intakes'
                         AND column_name IN ('show_in_ticker', 'is_featured', 'ticker_priority')),
  'none of the three can be null');

INSERT INTO training.programs (id, code, name, slug, category, duration_value, duration_unit)
VALUES ('00000000-0000-4000-8000-0000000f0001', 'TKRA', 'Ticker test program', 'ticker-test-program', 'Logistics', 3, 'months');
INSERT INTO training.intakes (id, name, slug, application_opens_on, application_closes_on, training_starts_on, training_ends_on, status)
VALUES ('00000000-0000-4000-8000-0000000f0010', 'Ticker test intake', 'ticker-test-intake',
        current_date, current_date + 30, current_date + 40, current_date + 130, 'open');
INSERT INTO training.intake_programs (id, intake_id, program_id, capacity)
VALUES ('00000000-0000-4000-8000-0000000f0101', '00000000-0000-4000-8000-0000000f0010', '00000000-0000-4000-8000-0000000f0001', 10);

-- ---------- Defaults: an intake is announced, not featured, in the middle of the order ----------
SELECT pg_temp.expect((SELECT show_in_ticker AND NOT is_featured AND ticker_priority = 0
                       FROM training.intakes WHERE id = '00000000-0000-4000-8000-0000000f0010'),
  'a new intake is announced by default, not featured, with order 0');

-- Every intake that existed before the migration keeps being announced
SELECT pg_temp.expect((SELECT bool_and(show_in_ticker) FROM training.intakes), 'no intake was silenced by the migration');

-- ---------- The order is kept inside 0 to 100 ----------
DO $$
BEGIN
  UPDATE training.intakes SET ticker_priority = 101 WHERE id = '00000000-0000-4000-8000-0000000f0010';
  PERFORM set_config('isoko.last_error', 'no error', true);
EXCEPTION WHEN check_violation THEN
  PERFORM set_config('isoko.last_error', 'check_violation', true);
END $$;
SELECT pg_temp.expect(current_setting('isoko.last_error', true) = 'check_violation', 'an order above 100 is refused');
DO $$
BEGIN
  UPDATE training.intakes SET ticker_priority = -1 WHERE id = '00000000-0000-4000-8000-0000000f0010';
  PERFORM set_config('isoko.last_error', 'no error', true);
EXCEPTION WHEN check_violation THEN
  PERFORM set_config('isoko.last_error', 'check_violation', true);
END $$;
SELECT pg_temp.expect(current_setting('isoko.last_error', true) = 'check_violation', 'a negative order is refused');
UPDATE training.intakes SET ticker_priority = 100, is_featured = true WHERE id = '00000000-0000-4000-8000-0000000f0010';
SELECT pg_temp.expect((SELECT ticker_priority = 100 AND is_featured FROM training.intakes
                       WHERE id = '00000000-0000-4000-8000-0000000f0010'), 'the ends of the range are allowed');

-- ---------- The band's index exists, for the rows it asks for ----------
SELECT pg_temp.expect((SELECT count(*) FROM pg_indexes WHERE schemaname = 'training' AND indexname = 'intakes_ticker_idx') = 1,
  'the band has its own index');

-- ---------- The website's own roles still cannot read the Training Center ----------
SELECT pg_temp.expect(NOT has_table_privilege('anon', 'training.intakes', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'training.intakes', 'SELECT'),
  'visitors and signed-in accounts cannot read training.intakes directly');
SELECT pg_temp.expect(NOT has_schema_privilege('anon', 'training', 'USAGE')
                  AND NOT has_schema_privilege('authenticated', 'training', 'USAGE'),
  'the training schema stays closed to the website roles');

ROLLBACK;

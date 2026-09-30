-- Regression test for 20260930110000_training_admin_edits.sql (a deadline per
-- program; moving an application re-prices its registration fee):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/training_admin_edits.test.sql
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
CREATE FUNCTION pg_temp.owed(p_app uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce((public.finance_totals_for('training.applications', p_app) ->> 'balance')::numeric, 0);
$$;

-- Three programs: 10,000 RWF, 4,000 RWF and free registration
INSERT INTO training.programs (id, code, name, slug, category, duration_value, duration_unit, tuition_fee, registration_fee) VALUES
  ('00000000-0000-4000-8000-0000000e0001', 'TAEA', 'Edit test A', 'edit-test-a', 'Technology', 3, 'months', 100000, 10000),
  ('00000000-0000-4000-8000-0000000e0002', 'TAEB', 'Edit test B', 'edit-test-b', 'Technology', 3, 'months', 100000, 4000),
  ('00000000-0000-4000-8000-0000000e0003', 'TAEC', 'Edit test C', 'edit-test-c', 'Technology', 3, 'months', 0, 0);
INSERT INTO training.intakes (id, name, slug, application_opens_on, application_closes_on, training_starts_on, training_ends_on, status)
VALUES ('00000000-0000-4000-8000-0000000e0010', 'Edit test intake', 'edit-test-intake', current_date, current_date + 30,
        current_date + 40, current_date + 130, 'open');
INSERT INTO training.intake_programs (id, intake_id, program_id, capacity, application_closes_on) VALUES
  ('00000000-0000-4000-8000-0000000e0101', '00000000-0000-4000-8000-0000000e0010', '00000000-0000-4000-8000-0000000e0001', 10, NULL),
  ('00000000-0000-4000-8000-0000000e0102', '00000000-0000-4000-8000-0000000e0010', '00000000-0000-4000-8000-0000000e0002', 10, current_date + 5),
  ('00000000-0000-4000-8000-0000000e0103', '00000000-0000-4000-8000-0000000e0010', '00000000-0000-4000-8000-0000000e0003', 10, current_date - 1);

-- ---------- A deadline per program ----------
SELECT pg_temp.expect((SELECT application_closes_on FROM training.intake_program_stats
                       WHERE intake_program_id = '00000000-0000-4000-8000-0000000e0102') = current_date + 5,
  'each program in an intake can have its own deadline (and the stats show it)');
SELECT pg_temp.expect((SELECT application_closes_on IS NULL FROM training.intake_program_stats
                       WHERE intake_program_id = '00000000-0000-4000-8000-0000000e0101'),
  'no deadline of its own: the intake''s applies');

-- ---------- Moving an application re-prices its fee ----------
INSERT INTO training.applications (id, reference, intake_program_id, full_name, phone, email, previous_education)
VALUES ('00000000-0000-4000-8000-0000000e0201', 'APP-EDIT-1', '00000000-0000-4000-8000-0000000e0101',
        'Edit Test', '0788000000', 'edit-test@test.local', 'Secondary');
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0201') = 10000, 'applying to A owes 10,000');
UPDATE training.applications SET intake_program_id = '00000000-0000-4000-8000-0000000e0102' WHERE id = '00000000-0000-4000-8000-0000000e0201';
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0201') = 4000, 'moved to B: owes B''s 4,000 (6,000 waived)');
UPDATE training.applications SET intake_program_id = '00000000-0000-4000-8000-0000000e0101' WHERE id = '00000000-0000-4000-8000-0000000e0201';
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0201') = 10000, 'moved back to A: owes 10,000 again');
UPDATE training.applications SET intake_program_id = '00000000-0000-4000-8000-0000000e0103' WHERE id = '00000000-0000-4000-8000-0000000e0201';
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0201') = 0, 'moved to the free program: owes nothing');
SELECT pg_temp.expect((SELECT count(*) FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
                       WHERE a.entity_table = 'training.applications' AND a.entity_id = '00000000-0000-4000-8000-0000000e0201') = 4,
  'every re-pricing is its own ledger entry (charge, waiver, charge, waiver)');

-- a free application moved to a paid program opens the account and charges it
INSERT INTO training.applications (id, reference, intake_program_id, full_name, phone, email, previous_education)
VALUES ('00000000-0000-4000-8000-0000000e0202', 'APP-EDIT-2', '00000000-0000-4000-8000-0000000e0103',
        'Edit Test Two', '0788000001', 'edit-test2@test.local', 'Secondary');
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0202') = 0, 'applying to the free program owes nothing');
UPDATE training.applications SET intake_program_id = '00000000-0000-4000-8000-0000000e0102' WHERE id = '00000000-0000-4000-8000-0000000e0202';
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0202') = 4000, 'moved from free to B: owes 4,000');

-- decided applications keep their fee as it was
UPDATE training.applications SET status = 'rejected' WHERE id = '00000000-0000-4000-8000-0000000e0202';
UPDATE training.applications SET intake_program_id = '00000000-0000-4000-8000-0000000e0101' WHERE id = '00000000-0000-4000-8000-0000000e0202';
SELECT pg_temp.expect(pg_temp.owed('00000000-0000-4000-8000-0000000e0202') = 0, 'a rejected application is not re-priced');

-- ---------- Announcements ----------
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'training' AND table_name = 'announcements' AND column_name = 'updated_at'),
  'announcements record when they were edited');

ROLLBACK;

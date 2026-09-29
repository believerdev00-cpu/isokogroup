-- Regression test for 20260929100000_training_application_fee.sql (applicants pay
-- the registration fee by mobile money, with the application's private link):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/training_application_fee.test.sql
--
-- Rolled back at the end.
BEGIN;

CREATE FUNCTION pg_temp.as_(p_user text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END;
$$;
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := pg_temp.as_(p_user);
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;
CREATE FUNCTION pg_temp.run(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_role text := pg_temp.as_(p_user); v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  EXECUTE p_sql INTO v;
  RESET ROLE;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
CREATE FUNCTION pg_temp.totals(p_app uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.finance_totals_for('training.applications', p_app);
$$;

-- A program with a 10,000 RWF registration fee, one with none, in an open intake
INSERT INTO training.programs (id, code, name, slug, category, duration_value, duration_unit, tuition_fee, registration_fee)
VALUES ('00000000-0000-4000-8000-0000000f0001', 'TAFEE', 'Fee test program', 'fee-test-program', 'Technology', 3, 'months', 100000, 10000),
       ('00000000-0000-4000-8000-0000000f0002', 'TAFREE', 'Free test program', 'free-test-program', 'Technology', 3, 'months', 0, 0);
INSERT INTO training.intakes (id, name, slug, application_opens_on, application_closes_on, training_starts_on, training_ends_on, status)
VALUES ('00000000-0000-4000-8000-0000000f0010', 'Fee test intake', 'fee-test-intake', current_date, current_date + 30, current_date + 40, current_date + 130, 'open');
INSERT INTO training.intake_programs (id, intake_id, program_id, capacity) VALUES
  ('00000000-0000-4000-8000-0000000f0101', '00000000-0000-4000-8000-0000000f0010', '00000000-0000-4000-8000-0000000f0001', 10),
  ('00000000-0000-4000-8000-0000000f0102', '00000000-0000-4000-8000-0000000f0010', '00000000-0000-4000-8000-0000000f0002', 10);

INSERT INTO training.applications (id, reference, intake_program_id, full_name, phone, email) VALUES
  ('00000000-0000-4000-8000-0000000fa001', 'TEST-FEE-1', '00000000-0000-4000-8000-0000000f0101', 'Applicant One', '0788000001', 'fee1@test.local'),
  ('00000000-0000-4000-8000-0000000fa002', 'TEST-FEE-2', '00000000-0000-4000-8000-0000000f0101', 'Applicant Two', '0788000002', 'fee2@test.local'),
  ('00000000-0000-4000-8000-0000000fa003', 'TEST-FEE-3', '00000000-0000-4000-8000-0000000f0102', 'Applicant Free', '0788000003', 'fee3@test.local');
CREATE TEMP TABLE tok AS SELECT reference, pay_token FROM training.applications WHERE reference LIKE 'TEST-FEE-%';
GRANT SELECT ON tok TO anon, authenticated;

-- ---------- The fee is owed from the start ----------
SELECT pg_temp.expect((pg_temp.totals('00000000-0000-4000-8000-0000000fa001') ->> 'balance')::numeric = 10000,
  'a new application owes its program''s registration fee');
SELECT pg_temp.expect((SELECT module FROM public.finance_accounts WHERE entity_table = 'training.applications'
                        AND entity_id = '00000000-0000-4000-8000-0000000fa001') = 'training',
  'it is in the ledger under the Training Center');
SELECT pg_temp.expect(public.finance_account_of('training.applications', '00000000-0000-4000-8000-0000000fa003') IS NULL,
  'a program without a registration fee owes nothing');
SELECT pg_temp.expect((SELECT count(DISTINCT pay_token) FROM tok) = 3 AND (SELECT min(length(pay_token)) FROM tok) >= 64,
  'every application gets its own long payment link');

-- ---------- The payment page ----------
SELECT pg_temp.expect(
  pg_temp.run(NULL, format('SELECT public.training_application_payment(%L)', (SELECT pay_token FROM tok WHERE reference = 'TEST-FEE-1')))
    @> '{"reference":"TEST-FEE-1","balance":10000,"payable":true,"program":"Fee test program"}',
  'the applicant''s link shows the fee to pay, without signing in');
SELECT pg_temp.expect(pg_temp.refused(NULL, 'SELECT public.training_application_payment(''not-a-real-token-at-all-000000000000'')'),
  'a made-up link shows nothing');
SELECT pg_temp.expect(pg_temp.refused(NULL, 'SELECT pay_token FROM training.applications'),
  'visitors can''t read the payment links');

-- ---------- Paying from the phone ----------
UPDATE public.platform_settings SET value = 'on' WHERE key = 'mobile_money';
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, format(
  'SELECT public.mobile_money_start(''training.applications'', NULL, %L, ''mtn'', ''0788000001'', 10000)',
  (SELECT pay_token FROM tok WHERE reference = 'TEST-FEE-1'))),
  'the applicant starts a mobile money payment with the link');
SELECT pg_temp.expect((pg_temp.totals('00000000-0000-4000-8000-0000000fa001') ->> 'pending')::numeric = 10000,
  'the payment waits for approval on the phone');
SELECT pg_temp.expect(pg_temp.refused(NULL, format(
  'SELECT public.mobile_money_start(''training.applications'', NULL, %L, ''mtn'', ''0788000002'', 20000)',
  (SELECT pay_token FROM tok WHERE reference = 'TEST-FEE-2'))),
  'nobody can pay more than the fee');
SELECT pg_temp.expect(pg_temp.refused(NULL,
  'SELECT public.mobile_money_start(''training.applications'', ''00000000-0000-4000-8000-0000000fa002'', NULL, ''mtn'', ''0788000002'', 10000)'),
  'without the link (just the application id) paying is refused');

-- ---------- Once decided, an unpaid fee is closed off ----------
UPDATE training.applications SET status = 'rejected' WHERE reference = 'TEST-FEE-2';
SELECT pg_temp.expect((pg_temp.totals('00000000-0000-4000-8000-0000000fa002') ->> 'balance')::numeric = 0,
  'a rejected application no longer owes the fee');
SELECT pg_temp.expect(pg_temp.refused(NULL, format(
  'SELECT public.mobile_money_start(''training.applications'', NULL, %L, ''mtn'', ''0788000002'', 10000)',
  (SELECT pay_token FROM tok WHERE reference = 'TEST-FEE-2'))),
  'and can''t be paid any more');
SELECT pg_temp.expect(
  pg_temp.run(NULL, format('SELECT public.training_application_payment(%L)', (SELECT pay_token FROM tok WHERE reference = 'TEST-FEE-2')))
    @> '{"payable":false}',
  'its payment page says so');
UPDATE training.applications SET status = 'approved' WHERE reference = 'TEST-FEE-1';
SELECT pg_temp.expect((pg_temp.totals('00000000-0000-4000-8000-0000000fa001') ->> 'balance')::numeric = 10000,
  'a payment still waiting on the phone keeps the fee open so its result can land');

ROLLBACK;

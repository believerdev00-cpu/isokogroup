-- Regression test for 20260925160000_training_on_engines.sql (Training Center
-- money on the payment engine, its emails on the notification engine), run
-- against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/training_engines.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code. The Training API's own
-- tests (training-api/test/finance.test.ts) cover the API on top of this.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'te-tadmin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'te-student@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e3', 'te-finance@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e4', 'te-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e5', 'te-travel@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000e3', 'finance'),
  ('00000000-0000-4000-8000-0000000000e4', 'admin'),
  ('00000000-0000-4000-8000-0000000000e5', 'travel_staff');
INSERT INTO training.users (id, email, role, full_name) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'te-tadmin@test.local', 'admin', 'Training Admin'),
  ('00000000-0000-4000-8000-0000000000e2', 'te-student@test.local', 'student', 'Te Student');

CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
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

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

\set tadmin '''00000000-0000-4000-8000-0000000000e1'''
\set student '''00000000-0000-4000-8000-0000000000e2'''
\set finance '''00000000-0000-4000-8000-0000000000e3'''
\set admin '''00000000-0000-4000-8000-0000000000e4'''
\set travel '''00000000-0000-4000-8000-0000000000e5'''

-- One student owing 50 registration + 500 tuition (as the API's approval does it)
INSERT INTO training.programs (id, code, name, slug, category, duration_value, duration_unit)
VALUES ('00000000-0000-4000-8000-00000000e0a1', 'TETEST', 'Engine test', 'engine-test-te', 'Tech', 3, 'months');
INSERT INTO training.intakes (id, name, slug, application_opens_on, application_closes_on, training_starts_on, training_ends_on)
VALUES ('00000000-0000-4000-8000-00000000e0a2', 'TE intake', 'te-intake', current_date - 10, current_date + 10, current_date, current_date + 60);
INSERT INTO training.intake_programs (id, intake_id, program_id, capacity)
VALUES ('00000000-0000-4000-8000-00000000e0a3', '00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-00000000e0a1', 10);
INSERT INTO training.students (id, user_id, student_number, full_name, phone, email)
VALUES ('00000000-0000-4000-8000-00000000e0a4', :student, 'ISK-TE-00001', 'Te Student', '+250788000555', 'te-student@test.local');
INSERT INTO training.enrollments (id, student_id, intake_program_id)
VALUES ('00000000-0000-4000-8000-00000000e0a5', '00000000-0000-4000-8000-00000000e0a4', '00000000-0000-4000-8000-00000000e0a3');
\set enr '''00000000-0000-4000-8000-00000000e0a5'''
INSERT INTO training.fee_charges (enrollment_id, type, description, amount) VALUES
  (:enr, 'registration', 'Registration', 50), (:enr, 'tuition', 'Tuition', 500), (:enr, 'other', 'Nothing', 0);

-- ---------- Fees are charges ----------
SELECT pg_temp.expect((SELECT (public.finance_totals_for('training.enrollments', :enr) ->> 'balance')::numeric) = 550,
  'fees become ledger charges (a zero fee adds nothing)');
SELECT pg_temp.expect((SELECT customer_user_id FROM public.finance_accounts WHERE entity_id = :enr) = :student,
  'the student''s Isoko account is the account''s customer');
SELECT pg_temp.expect(pg_temp.visible(:student, $$SELECT 1 FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
  WHERE a.entity_id = '00000000-0000-4000-8000-00000000e0a5'$$) = 2, 'the student sees their own ledger');
SELECT pg_temp.expect(pg_temp.visible(:travel, $$SELECT 1 FROM public.finance_accounts WHERE module = 'training'$$) = 0,
  'other services'' staff don''t see training accounts');
SELECT pg_temp.expect(pg_temp.visible(:tadmin, $$SELECT 1 FROM public.finance_accounts WHERE entity_id = '00000000-0000-4000-8000-00000000e0a5'$$) = 1,
  'a Training Center admin sees training accounts');

-- ---------- Who records and reverses ----------
SELECT pg_temp.expect(pg_temp.refused(:student, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 10, 'cash', '')$$),
  'a student can''t record their own payment');
SELECT pg_temp.expect(pg_temp.refused(:travel, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 10, 'cash', '')$$),
  'travel staff can''t record training payments');
SELECT pg_temp.expect(pg_temp.refused(:tadmin, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 10, 'cash', '', NULL, NULL, current_date + 2)$$),
  'a payment date in the future is refused');
SELECT pg_temp.expect(NOT pg_temp.refused(:tadmin, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 100, 'momo', 'TE-MOMO-0001', 'At the desk', 'te-key-1', current_date - 2)$$),
  'a Training Center admin records a payment');
SELECT pg_temp.expect((SELECT paid_on = current_date - 2 AND notes = 'At the desk' AND recorded_by = :tadmin FROM training.payments WHERE enrollment_id = :enr),
  'the payment date, note and who recorded it are kept');
SELECT pg_temp.expect((SELECT receipt_number LIKE 'ISK-RCPT-%' FROM training.receipts r JOIN training.payments p ON p.id = r.payment_id WHERE p.enrollment_id = :enr),
  'the database issues the receipt');
SELECT pg_temp.expect(NOT pg_temp.refused(:finance, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 50, 'cash', '')$$),
  'Isoko finance staff can record training payments too');
SELECT pg_temp.expect((SELECT count(*) FROM training.receipts r JOIN training.payments p ON p.id = r.payment_id WHERE p.enrollment_id = :enr) = 2,
  '... and get a receipt as well');
SELECT pg_temp.expect(pg_temp.refused(:student, $$SELECT public.finance_adjust('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 'waiver', 400, 'Please')$$),
  'a student can''t waive their fees');
SELECT pg_temp.expect(pg_temp.refused(:student, $$SELECT public.finance_void_payment((SELECT id FROM public.finance_payments WHERE reference = 'TE-MOMO-0001'), 'Mine')$$),
  'a student can''t void a payment');
SELECT pg_temp.expect(pg_temp.refused(:travel, $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'TE-MOMO-0001'), 10, 'Refund it')$$),
  'other services'' staff can''t refund training payments');
SELECT pg_temp.expect(NOT pg_temp.refused(:tadmin, $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'TE-MOMO-0001'), 30, 'Left early')$$),
  'a Training Center admin refunds a training payment');
SELECT pg_temp.expect(NOT pg_temp.refused(:tadmin, $$SELECT public.finance_adjust('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 'waiver', 100, 'Scholarship')$$),
  'a Training Center admin waives part of the fees');
SELECT pg_temp.expect((SELECT total_fees = 450 AND total_paid = 120 FROM training.enrollment_balances WHERE enrollment_id = :enr),
  'fees less waivers, payments less refunds');
UPDATE training.users SET is_active = false WHERE id = :tadmin;
SELECT pg_temp.expect(pg_temp.refused(:tadmin, $$SELECT public.finance_record_payment('training.enrollments', '00000000-0000-4000-8000-00000000e0a5', 10, 'cash', '')$$),
  'a deactivated Training Center admin can''t');
SELECT pg_temp.expect(pg_temp.refused(:tadmin, $$SELECT public.finance_adjust('travel_trips', gen_random_uuid(), 'waiver', 10, 'Not mine')$$),
  'a Training Center admin has no say over other services');
UPDATE training.users SET is_active = true WHERE id = :tadmin;

-- ---------- Nothing changes behind the engine's back ----------
SELECT pg_temp.expect(pg_temp.refused('service', $$UPDATE training.fee_charges SET amount = 1$$), 'the service role can''t touch training tables');
DO $$ BEGIN
  UPDATE training.fee_charges SET amount = 1 WHERE enrollment_id = '00000000-0000-4000-8000-00000000e0a5';
  RAISE EXCEPTION 'FAILED: a fee was edited';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  fees can''t be edited, even by the database owner';
END $$;
DO $$ BEGIN
  INSERT INTO training.payments_legacy (enrollment_id, amount, method, paid_on)
  VALUES ('00000000-0000-4000-8000-00000000e0a5', 1, 'cash', current_date);
  RAISE EXCEPTION 'FAILED: an old-style payment was written';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  the old payments table is history only';
END $$;

-- ---------- Secrets in emails ----------
SELECT public.notify_event('TRAINING_NOTICE', 'TRAINING_NOTICE:te-1', 'training.notifications', gen_random_uuid(),
  '[{"email": "te-applicant@test.local"}]', '{"title": "Welcome", "body": "Line one.\n\nLine two.", "url": "https://example.test/x"}') AS event \gset
SELECT pg_temp.expect(public.notification_attach_secret(:'event', 'Temporary password: ABCD-EFGH') = 1, 'a secret is attached to the pending email');
SELECT pg_temp.expect((SELECT body = E'Line one.\n\nLine two.\n\nhttps://example.test/x' AND subject = 'Welcome'
  FROM public.notification_deliveries WHERE event_id = :'event'), 'the email keeps its paragraphs and has no secret in it');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$SELECT * FROM public.notification_secrets$$), 'admins can''t read secrets');
SELECT pg_temp.expect(pg_temp.refused('service', $$SELECT * FROM public.notification_secrets$$), 'the service role can''t read secrets directly');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$SELECT public.notification_attach_secret(gen_random_uuid(), 'x')$$), 'nobody on the website attaches secrets');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$SELECT public.training_is_admin()$$), 'internal helpers aren''t callable from the website');

UPDATE public.notification_deliveries SET next_attempt_at = now() + interval '1 day'
WHERE status = 'pending' AND event_id <> :'event';
CREATE TEMP TABLE claimed AS SELECT id, body FROM public.notification_deliveries WHERE false;
GRANT ALL ON claimed TO service_role;
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, body FROM public.notification_claim(100)$$);
SELECT pg_temp.expect((SELECT body LIKE '%Temporary password: ABCD-EFGH' FROM claimed), 'the sender gets the secret with the message');
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM claimed), false, 'smtp', NULL, 'timeout', true)$$);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_secrets s JOIN claimed c ON c.id = s.delivery_id), 'a retry keeps the secret');
UPDATE public.notification_deliveries SET next_attempt_at = now() WHERE id = (SELECT id FROM claimed);
DELETE FROM claimed;
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, body FROM public.notification_claim(100)$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM claimed), true, 'smtp', 'm-1', NULL)$$);
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.notification_secrets s JOIN claimed c ON c.id = s.delivery_id)
  AND (SELECT status FROM public.notification_deliveries WHERE id = (SELECT id FROM claimed)) = 'sent',
  'once sent, the secret is gone');

-- ---------- Payment messages reach the student ----------
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_events e JOIN public.notification_deliveries d ON d.event_id = e.id
  WHERE e.event_type = 'PAYMENT_SUCCESSFUL' AND e.entity_id = :enr AND d.channel = 'email' AND d.recipient_address = 'te-student@test.local'),
  'the student is emailed about a training payment');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_events WHERE event_type = 'PAYMENT_REFUNDED' AND entity_id = :enr),
  '... and about a refund');

ROLLBACK;

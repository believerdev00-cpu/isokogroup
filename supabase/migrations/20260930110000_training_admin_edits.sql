-- Training Center: admins edit more of what the site shows
--
--   * Each program in an intake may have its own application deadline
--     (intake_programs.application_closes_on). Empty: the intake's deadline.
--     The intake's own deadline still applies too, unless an admin opened the
--     intake by hand (training-api: acceptingSql).
--   * Admins can correct an application (the applicant's details) and move it
--     to another program. Moving it re-prices the registration fee in the
--     ledger: the difference is charged, or waived, so what the applicant owes
--     always matches the program they are in.
--   * Announcements can be edited (updated_at shows when).

-- ============== A DEADLINE PER PROGRAM ==============
ALTER TABLE training.intake_programs ADD COLUMN IF NOT EXISTS application_closes_on date;

-- (new column at the end: CREATE OR REPLACE VIEW keeps the others as they are)
CREATE OR REPLACE VIEW training.intake_program_stats AS
SELECT ip.id AS intake_program_id,
       ip.intake_id,
       ip.program_id,
       ip.capacity,
       ip.accepting_applications,
       count(e.id) FILTER (WHERE e.status <> 'withdrawn')::int AS enrolled,
       greatest(ip.capacity - count(e.id) FILTER (WHERE e.status <> 'withdrawn'), 0)::int AS available_seats,
       ip.application_closes_on
FROM training.intake_programs ip
LEFT JOIN training.enrollments e ON e.intake_program_id = ip.id
GROUP BY ip.id;

-- ============== MOVING AN APPLICATION ==============
-- The registration fee follows the program: what is charged (less discounts
-- and waivers) is brought to the new program's fee.
CREATE OR REPLACE FUNCTION training.application_fee_moved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE
  v_fee numeric;
  v_program text;
  v_currency text := coalesce((SELECT value ->> 'currency' FROM training.settings WHERE key = 'center'), 'RWF');
  a public.finance_accounts;
  t jsonb;
  v_diff numeric;
BEGIN
  IF NEW.intake_program_id IS NOT DISTINCT FROM OLD.intake_program_id
     OR NEW.status NOT IN ('pending', 'under_review', 'waitlisted') THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(coalesce(ip.registration_fee, p.registration_fee), 0), p.name INTO v_fee, v_program
  FROM training.intake_programs ip JOIN training.programs p ON p.id = ip.program_id
  WHERE ip.id = NEW.intake_program_id;
  a := public.finance_account_of('training.applications', NEW.id);
  IF a.id IS NULL THEN
    IF v_fee <= 0 THEN
      RETURN NULL;
    END IF;
    a := public.finance_open_account('training.applications', NEW.id, v_currency, NULL, NEW.reference || ' · ' || NEW.full_name);
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  t := public.finance_totals(a.id);
  v_diff := v_fee - ((t ->> 'charged')::numeric - (t ->> 'credits')::numeric);
  IF v_diff > 0 THEN
    PERFORM public.finance_post(a, 'charge', v_diff, 'price', 'Registration fee — moved to ' || v_program);
  ELSIF v_diff < 0 THEN
    PERFORM public.finance_begin();
    PERFORM public.finance_post(a, 'waiver', v_diff, 'manual', 'Registration fee — moved to ' || v_program,
      NULL, NULL, 'Application moved to ' || v_program);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER application_fee_moved AFTER UPDATE OF intake_program_id ON training.applications
  FOR EACH ROW EXECUTE FUNCTION training.application_fee_moved();
REVOKE EXECUTE ON FUNCTION training.application_fee_moved() FROM PUBLIC, anon, authenticated;

-- ============== ANNOUNCEMENTS ==============
ALTER TABLE training.announcements ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Applicants pay the Training Center registration fee by mobile money (ItecPay)
-- right after applying, without an account.
--
--   * Each application gets a private payment link (pay_token), shown on the
--     confirmation screen and kept in the applicant's messages.
--   * When it is submitted, the registration fee of its program becomes a
--     charge in the ledger (module 'training', entity 'training.applications').
--   * Paying works like the other private links: mobile_money_start accepts the
--     token while the application is still being considered.
--   * Once the application is decided (approved, rejected or withdrawn) an
--     unpaid fee is closed off here; on approval the enrollment charges it (or
--     skips it when it was paid with the application, see training-api).

-- ============== THE PAYMENT LINK ==============
ALTER TABLE training.applications ADD COLUMN IF NOT EXISTS pay_token text UNIQUE DEFAULT public.new_access_token();
UPDATE training.applications SET pay_token = public.new_access_token() WHERE pay_token IS NULL;
ALTER TABLE training.applications ALTER COLUMN pay_token SET NOT NULL;

-- ============== APPLICATIONS IN THE LEDGER ==============
CREATE OR REPLACE FUNCTION public.finance_module_of(_entity_table text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _entity_table
    WHEN 'travel_trips' THEN 'travel'
    WHEN 'consult_requests' THEN 'consultancy'
    WHEN 'data_requests' THEN 'data'
    WHEN 'orders' THEN 'marketplace'
    WHEN 'subscriptions' THEN 'subscriptions'
    WHEN 'software_bookings' THEN 'software'
    WHEN 'training.enrollments' THEN 'training'
    WHEN 'training.applications' THEN 'training'
  END;
$$;

-- Payment messages about an application's fee go to the applicant
CREATE OR REPLACE FUNCTION public.notification_customer(_table text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  CASE _table
    WHEN 'travel_trips' THEN
      SELECT jsonb_build_object('user_id', user_id, 'email', customer_email, 'phone', customer_phone,
                                'name', customer_name, 'link', '/travel/trip/' || access_token) INTO r
      FROM public.travel_trips WHERE id = _id;
    WHEN 'consult_requests' THEN
      SELECT jsonb_build_object('user_id', user_id, 'email', email, 'phone', phone,
                                'name', client_name, 'link', '/consultancy/r/' || access_token) INTO r
      FROM public.consult_requests WHERE id = _id;
    WHEN 'data_requests' THEN
      SELECT jsonb_build_object('user_id', user_id, 'email', email, 'phone', phone,
                                'name', client_name, 'link', '/data-analysis/r/' || access_token) INTO r
      FROM public.data_requests WHERE id = _id;
    WHEN 'orders' THEN
      SELECT jsonb_build_object('user_id', buyer_id, 'link', '/my-orders') INTO r FROM public.orders WHERE id = _id;
    WHEN 'subscriptions' THEN
      SELECT jsonb_build_object('user_id', user_id, 'link', '/subscription') INTO r FROM public.subscriptions WHERE id = _id;
    WHEN 'software_bookings' THEN
      SELECT jsonb_build_object('user_id', user_id, 'email', email, 'phone', phone, 'name', full_name, 'link', '/software') INTO r
      FROM public.software_bookings WHERE id = _id;
    WHEN 'training.enrollments' THEN
      SELECT jsonb_build_object('user_id', s.user_id, 'email', s.email, 'phone', s.phone, 'name', s.full_name,
                                'link', '/training-center/student/payments') INTO r
      FROM training.enrollments e JOIN training.students s ON s.id = e.student_id WHERE e.id = _id;
    WHEN 'training.applications' THEN
      SELECT jsonb_build_object('email', email, 'phone', phone, 'name', full_name,
                                'link', '/training-center/pay/' || pay_token) INTO r
      FROM training.applications WHERE id = _id;
    ELSE r := NULL;
  END CASE;
  RETURN CASE WHEN r IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_strip_nulls(r)) END;
END $$;

-- The registration fee is owed from the moment the application is sent
CREATE OR REPLACE FUNCTION training.application_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE
  v_fee numeric;
  v_program text;
  v_currency text := coalesce((SELECT value ->> 'currency' FROM training.settings WHERE key = 'center'), 'RWF');
  a public.finance_accounts;
BEGIN
  SELECT coalesce(ip.registration_fee, p.registration_fee), p.name INTO v_fee, v_program
  FROM training.intake_programs ip JOIN training.programs p ON p.id = ip.program_id
  WHERE ip.id = NEW.intake_program_id;
  IF coalesce(v_fee, 0) > 0 THEN
    a := public.finance_open_account('training.applications', NEW.id, v_currency, NULL,
      NEW.reference || ' · ' || NEW.full_name);
    PERFORM public.finance_post(a, 'charge', v_fee, 'price', 'Registration fee — ' || v_program);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER application_fee AFTER INSERT ON training.applications
  FOR EACH ROW EXECUTE FUNCTION training.application_fee();

-- A decided application no longer owes its fee here: rejected or withdrawn, it
-- isn't needed; approved, the enrollment carries it. What was paid stays paid
-- (a refund, if any, is a finance decision). A payment still waiting for the
-- phone keeps the balance open so its result can land.
CREATE OR REPLACE FUNCTION training.application_fee_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of('training.applications', NEW.id);
  t jsonb;
  v_left numeric;
BEGIN
  IF a.id IS NULL OR NEW.status NOT IN ('approved', 'rejected', 'withdrawn') OR OLD.status = NEW.status THEN
    RETURN NULL;
  END IF;
  PERFORM public.finance_begin();
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  t := public.finance_totals(a.id);
  v_left := (t ->> 'balance')::numeric;
  IF v_left > 0 AND (t ->> 'pending')::numeric = 0 THEN
    PERFORM public.finance_post(a, 'waiver', -v_left, 'manual',
      CASE NEW.status WHEN 'approved' THEN 'Moved to the enrollment' ELSE 'Application ' || NEW.status END,
      NULL, NULL, 'Application ' || NEW.status);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER application_fee_closed AFTER UPDATE OF status ON training.applications
  FOR EACH ROW EXECUTE FUNCTION training.application_fee_closed();

REVOKE EXECUTE ON FUNCTION training.application_fee(), training.application_fee_closed() FROM PUBLIC, anon, authenticated;

-- ============== PAYING FROM THE PHONE ==============
CREATE OR REPLACE FUNCTION public.mobile_money_start(
  p_entity_table text, p_entity_id uuid, p_token text, p_network text, p_phone text, p_amount numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts;
  v_entity uuid;
  v_phone text := public.mobile_money_phone(p_phone);
  v_network text := lower(btrim(coalesce(p_network, '')));
  t jsonb;
  v_left numeric;
  v_amount numeric;
  v_open public.finance_payments;
  v_id uuid;
BEGIN
  IF NOT public.mobile_money_available() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Paying from your phone isn''t available yet';
  END IF;
  PERFORM public.rate_limit('mobile-money:start', 20, 3600);

  -- Whose record, and may they pay for it
  IF nullif(btrim(coalesce(p_token, '')), '') IS NOT NULL THEN
    CASE p_entity_table
      WHEN 'travel_trips' THEN
        SELECT id INTO v_entity FROM public.travel_trip_by_token(p_token) WHERE status IN ('confirmed', 'completed');
      WHEN 'consult_requests' THEN
        SELECT id INTO v_entity FROM public.consult_request_by_token(p_token) WHERE status IN ('approved', 'in_progress', 'completed');
      WHEN 'data_requests' THEN
        SELECT id INTO v_entity FROM public.data_request_by_token(p_token) WHERE fee IS NOT NULL AND status <> 'cancelled';
      WHEN 'training.applications' THEN
        -- the registration fee of an application still being considered
        SELECT id INTO v_entity FROM training.applications
        WHERE pay_token = p_token AND status IN ('pending', 'under_review', 'waitlisted');
      ELSE
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Not something you can pay for here';
    END CASE;
    a := public.finance_account_of(p_entity_table, v_entity);
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Please sign in to pay';
    END IF;
    a := public.finance_account_of(p_entity_table, p_entity_id);
    IF a.id IS NOT NULL AND a.customer_user_id IS DISTINCT FROM auth.uid() THEN
      a := NULL;
    END IF;
  END IF;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is nothing to pay here yet';
  END IF;
  PERFORM public.rate_limit('mobile-money:account', 6, 3600, a.id::text);

  IF a.currency <> 'RWF' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Mobile money is for amounts in RWF. Please pay by bank transfer.';
  END IF;
  IF v_network NOT IN ('mtn', 'airtel', 'spenn') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose MTN Mobile Money, Airtel Money or SPENN';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter a Rwandan phone number, e.g. 0788 123 456';
  END IF;
  IF (v_network = 'mtn' AND v_phone !~ '^07[89]') OR (v_network = 'airtel' AND v_phone !~ '^07[23]') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('%s isn''t an %s number', v_phone,
      CASE v_network WHEN 'mtn' THEN 'MTN' ELSE 'Airtel' END);
  END IF;

  -- One at a time per account, so two requests can't both pass the check
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  SELECT * INTO v_open FROM public.finance_payments
  WHERE account_id = a.id AND provider = 'itecpay' AND status IN ('pending', 'processing')
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', HINT = v_open.id::text,
      MESSAGE = 'A payment is already waiting for approval on your phone';
  END IF;
  t := public.finance_totals(a.id);
  v_left := (t ->> 'balance')::numeric - (t ->> 'pending')::numeric;
  v_amount := coalesce(p_amount, v_left);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> trunc(v_amount) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount in whole francs';
  END IF;
  IF NOT a.allow_overpayment AND v_amount > v_left THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = CASE WHEN v_left <= 0 THEN 'Nothing is left to pay'
      ELSE format('The amount is more than the %s RWF left to pay', v_left) END;
  END IF;

  PERFORM public.finance_begin();
  INSERT INTO public.finance_payments (account_id, amount, currency, method, provider, status, created_by, metadata)
  VALUES (a.id, v_amount, a.currency, 'momo', 'itecpay', 'pending', auth.uid(),
          jsonb_build_object('network', v_network, 'phone', v_phone))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('payment_id', v_id, 'amount', v_amount, 'currency', a.currency, 'network', v_network,
    'phone', v_phone);
END $$;

-- What the payment page shows: the application and what is left to pay.
-- The token is the key (like the other private links), rate-limited.
CREATE OR REPLACE FUNCTION public.training_application_payment(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  t jsonb;
BEGIN
  PERFORM public.rate_limit('training-application-payment', 60, 3600);
  SELECT a.id, a.reference, a.full_name, a.status, p.name AS program, i.name AS intake
  INTO r
  FROM training.applications a
  JOIN training.intake_programs ip ON ip.id = a.intake_program_id
  JOIN training.programs p ON p.id = ip.program_id
  JOIN training.intakes i ON i.id = ip.intake_id
  WHERE a.pay_token = p_token;
  IF NOT FOUND OR coalesce(length(p_token), 0) < 32 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'This payment link isn''t valid';
  END IF;
  t := public.finance_totals_for('training.applications', r.id);
  RETURN jsonb_build_object(
    'reference', r.reference, 'full_name', r.full_name, 'status', r.status,
    'program', r.program, 'intake', r.intake,
    'currency', coalesce(t ->> 'currency', 'RWF'),
    'charged', (t ->> 'charged')::numeric, 'paid', (t ->> 'paid')::numeric,
    'pending', (t ->> 'pending')::numeric, 'balance', (t ->> 'balance')::numeric,
    'payable', r.status IN ('pending', 'under_review', 'waitlisted'));
END $$;
REVOKE EXECUTE ON FUNCTION public.training_application_payment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_application_payment(text) TO anon, authenticated;

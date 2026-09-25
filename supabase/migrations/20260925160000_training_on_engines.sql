-- The Training Center joins the platform's payment and notification engines
--
-- Before: the Training Center kept its own fee and payment tables. The API
-- checked amounts in application code, the database owner could edit or delete
-- payments, the same mobile-money reference could be recorded twice, fees could
-- not be reduced and money could not be refunded. Its emails had their own
-- outbox and SMTP sender, separate from the rest of Isoko.
--
-- Now:
--   * every enrollment that owes something has a finance account (module
--     'training', entity 'training.enrollments'). Fees become ledger charges,
--     payments are finance_payments, voids/refunds/discounts/waivers go through
--     the finance functions, with the same rules as every other service.
--     Training admins handle their center's money; Isoko finance staff and
--     admins can too.
--   * training.payments is now a read-only view over the engine (same columns
--     plus status and refunded_amount), so receipts, reports and the portals keep
--     reading it. The old rows are copied in with their ids, so receipt numbers
--     and links don't change. Receipts are issued by the database for every
--     training payment, however it was recorded.
--   * Training emails are TRAINING_NOTICE events sent by notifications-dispatch.
--     A one-time secret (a temporary password) is kept apart from the message,
--     added only when the email is handed to the provider, and deleted once the
--     delivery is finished.
--
-- The public-schema part is written to be re-run: training-api's tests rebuild
-- the training schema from its migrations, this one included.

-- ============== NOTIFICATIONS: SECRETS AND LINE BREAKS ==============
-- Only runs of spaces are tidied, so multi-paragraph messages keep their breaks
CREATE OR REPLACE FUNCTION public.notification_render(_text text, _data jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v text;
  out text := _text;
BEGIN
  FOR k, v IN SELECT key, value FROM jsonb_each_text(coalesce(_data, '{}'::jsonb)) LOOP
    out := replace(out, '{{' || k || '}}', coalesce(v, ''));
  END LOOP;
  out := regexp_replace(out, '\{\{[a-z_]+\}\}', '', 'g');
  RETURN btrim(regexp_replace(out, '[ \t]{2,}', ' ', 'g'));
END $$;

-- Not readable by anyone but the database owner and the claim function
CREATE TABLE IF NOT EXISTS public.notification_secrets (
  delivery_id uuid PRIMARY KEY REFERENCES public.notification_deliveries(id) ON DELETE CASCADE,
  secret text NOT NULL CHECK (length(secret) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_secrets FROM PUBLIC, anon, authenticated, service_role;

-- Attaches a secret to the email deliveries of an event that are still to be sent
CREATE OR REPLACE FUNCTION public.notification_attach_secret(p_event_id uuid, p_secret text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_event_id IS NULL OR nullif(btrim(coalesce(p_secret, '')), '') IS NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO public.notification_secrets (delivery_id, secret)
  SELECT id, p_secret FROM public.notification_deliveries
  WHERE event_id = p_event_id AND channel = 'email' AND status = 'pending'
  ON CONFLICT (delivery_id) DO UPDATE SET secret = EXCLUDED.secret;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notification_claim(p_limit integer DEFAULT 25)
RETURNS SETOF public.notification_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.notification_deliveries;
  v_secret text;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  FOR d IN
    UPDATE public.notification_deliveries nd
    SET status = 'sending', attempts = nd.attempts + 1, locked_until = now() + interval '2 minutes'
    WHERE nd.id IN (
      SELECT id FROM public.notification_deliveries
      WHERE channel <> 'in_app'
        AND ((status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now()))
        AND attempts < max_attempts
      ORDER BY next_attempt_at
      LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING nd.*
  LOOP
    -- the secret travels to the sender with the message but is never stored in it
    SELECT secret INTO v_secret FROM public.notification_secrets WHERE delivery_id = d.id;
    IF v_secret IS NOT NULL THEN
      d.body := d.body || E'\n\n' || v_secret;
    END IF;
    RETURN NEXT d;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notification_result(
  p_delivery_id uuid, p_ok boolean, p_provider text, p_message_id text, p_error text, p_retry boolean DEFAULT true
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.notification_deliveries;
  v_outcome text;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  SELECT * INTO d FROM public.notification_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR d.status <> 'sending' THEN
    RETURN 'ignored';
  END IF;
  IF p_ok THEN
    UPDATE public.notification_deliveries
    SET status = 'sent', sent_at = now(), provider = p_provider, provider_message_id = p_message_id,
        error = NULL, locked_until = NULL
    WHERE id = d.id;
    v_outcome := 'sent';
  ELSIF NOT p_retry AND p_provider IS NULL THEN
    UPDATE public.notification_deliveries
    SET status = 'skipped', error = left(p_error, 500), locked_until = NULL WHERE id = d.id;
    v_outcome := 'skipped';
  ELSIF NOT p_retry OR d.attempts >= d.max_attempts THEN
    UPDATE public.notification_deliveries
    SET status = 'failed', failed_at = now(), provider = p_provider, error = left(p_error, 500), locked_until = NULL
    WHERE id = d.id;
    v_outcome := 'failed';
  ELSE
    UPDATE public.notification_deliveries
    SET status = 'pending', provider = p_provider, error = left(p_error, 500), locked_until = NULL,
        next_attempt_at = now() + make_interval(mins => power(2, d.attempts - 1)::int)
    WHERE id = d.id;
    RETURN 'retry'; -- the secret is kept for the next attempt
  END IF;
  DELETE FROM public.notification_secrets WHERE delivery_id = d.id;
  RETURN v_outcome;
END $$;

-- Training Center messages: the API writes the text, the engine delivers it.
-- Email only by default (the portal has its own in-app list); admins can add
-- WhatsApp or SMS here, which never carry a secret.
INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  ('TRAINING_NOTICE', 'Training Center: applications, accounts, results, certificates, announcements', ARRAY['email'], 'info')
ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('TRAINING_NOTICE', '*', '{{title}}', E'{{body}}\n\n{{url}}')
ON CONFLICT (event_type, channel) DO NOTHING;

-- Payment messages for training fees go to the student
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
    ELSE r := NULL;
  END CASE;
  RETURN CASE WHEN r IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_strip_nulls(r)) END;
END $$;

-- ============== FINANCE: THE TRAINING MODULE ==============
ALTER TABLE public.finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_module_check;
ALTER TABLE public.finance_accounts ADD CONSTRAINT finance_accounts_module_check
  CHECK (module IN ('travel', 'consultancy', 'data', 'marketplace', 'subscriptions', 'software', 'training'));

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
  END;
$$;

-- An active Training Center administrator (training.users, not Isoko roles)
CREATE OR REPLACE FUNCTION public.training_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM training.users WHERE id = auth.uid() AND role = 'admin' AND is_active);
$$;

CREATE OR REPLACE FUNCTION public.finance_can_collect(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
      OR public.has_role(auth.uid(), 'finance')
      OR (_module IN ('travel', 'consultancy', 'data') AND public.is_service_staff(_module))
      OR (_module = 'training' AND public.training_is_admin());
$$;

-- Refunds, voids, discounts, waivers and adjustments on one service's accounts:
-- finance staff and admins everywhere; Training Center admins on training fees.
CREATE OR REPLACE FUNCTION public.finance_can_reverse_module(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.finance_can_reverse() OR (_module = 'training' AND public.training_is_admin());
$$;

CREATE OR REPLACE FUNCTION public.finance_refund_payment(
  p_payment_id uuid, p_amount numeric, p_reason text, p_idempotency_key text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.finance_payments;
  a public.finance_accounts;
  v_reason text;
  v_amount numeric := round(p_amount, 2);
BEGIN
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can refund payments');
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id;
  PERFORM public.finance_require(public.finance_can_reverse_module(a.module), 'Only finance staff can refund payments');
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_ledger WHERE idempotency_key = p_idempotency_key AND payment_id = p_payment_id AND kind = 'refund'
  ) THEN
    RETURN; -- a retry of the same refund
  END IF;
  v_reason := public.finance_reason(p_reason);
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id FOR UPDATE;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id FOR UPDATE;
  IF p.status NOT IN ('successful', 'partially_refunded') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only received payments can be refunded';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > p.amount - p.refunded_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = format('Refund between 0 and %s %s', p.amount - p.refunded_amount, p.currency);
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments
  SET refunded_amount = refunded_amount + v_amount,
      status = CASE WHEN refunded_amount + v_amount = amount THEN 'refunded' ELSE 'partially_refunded' END,
      refunded_at = now()
  WHERE id = p.id;
  PERFORM public.finance_post(a, 'refund', v_amount, 'manual', 'Refund', p.id, NULL, v_reason, p_idempotency_key);
  PERFORM public.finance_sync_entity(a);
END $$;

CREATE OR REPLACE FUNCTION public.finance_void_payment(p_payment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.finance_payments;
  a public.finance_accounts;
  v_reason text;
  v_entry public.finance_ledger;
BEGIN
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can void payments');
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id;
  PERFORM public.finance_require(public.finance_can_reverse_module(a.module), 'Only finance staff can void payments');
  v_reason := public.finance_reason(p_reason);
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id FOR UPDATE;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id FOR UPDATE;
  IF p.status <> 'successful' OR p.refunded_amount > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only a received payment with no refunds can be voided';
  END IF;
  SELECT * INTO v_entry FROM public.finance_ledger WHERE payment_id = p.id AND kind = 'payment' ORDER BY id LIMIT 1;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments SET status = 'voided', voided_at = now() WHERE id = p.id;
  PERFORM public.finance_post(a, 'void', -v_entry.amount, 'manual', 'Payment voided', p.id, v_entry.id, v_reason);
  PERFORM public.finance_sync_entity(a);
END $$;

CREATE OR REPLACE FUNCTION public.finance_adjust(
  p_entity_table text, p_entity_id uuid, p_kind text, p_amount numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v_reason text;
  v_amount numeric := round(p_amount, 2);
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse_module(public.finance_module_of(p_entity_table)),
    'Only finance staff can change what a customer owes');
  v_reason := public.finance_reason(p_reason);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price to adjust yet';
  END IF;
  IF p_kind NOT IN ('discount', 'waiver', 'adjustment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown kind of change';
  END IF;
  IF v_amount IS NULL OR v_amount = 0 OR (p_kind <> 'adjustment' AND v_amount < 0) OR abs(v_amount) > 1000000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount';
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  PERFORM public.finance_post(a, p_kind, CASE WHEN p_kind = 'adjustment' THEN v_amount ELSE -v_amount END,
    'manual', initcap(p_kind), NULL, NULL, v_reason);
  PERFORM public.finance_sync_entity(a);
END $$;

CREATE OR REPLACE FUNCTION public.finance_set_overpayment(p_entity_table text, p_entity_id uuid, p_allow boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse_module(public.finance_module_of(p_entity_table)),
    'Only finance staff can allow overpayment');
  PERFORM public.finance_reason(p_reason);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price yet';
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_accounts SET allow_overpayment = coalesce(p_allow, false) WHERE id = a.id;
END $$;

-- Staff record money they received. p_paid_on: the day it arrived, when that
-- wasn't today (e.g. cash taken yesterday); never in the future.
DROP FUNCTION IF EXISTS public.finance_record_payment(text, uuid, numeric, text, text, text, text);
CREATE OR REPLACE FUNCTION public.finance_record_payment(
  p_entity_table text, p_entity_id uuid, p_amount numeric, p_method text, p_reference text,
  p_note text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_paid_on date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v_existing public.finance_payments;
  v_payment uuid;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect(public.finance_module_of(p_entity_table)),
    'You can''t record payments for this service');
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price to pay yet';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.finance_payments WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.account_id <> a.id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This request key was already used for another payment';
      END IF;
      RETURN v_existing.id; -- a retry of the same request
    END IF;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount received';
  END IF;
  IF p_method NOT IN ('momo', 'bank', 'card', 'cash', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how it was paid';
  END IF;
  IF p_method IN ('momo', 'bank', 'card') AND length(btrim(coalesce(p_reference, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the transaction reference';
  END IF;
  IF length(coalesce(p_reference, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The reference is too long';
  END IF;
  IF p_paid_on IS NOT NULL THEN
    IF p_paid_on > (now() AT TIME ZONE 'Africa/Kigali')::date THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The payment date can''t be in the future';
    END IF;
    v_meta := jsonb_build_object('paid_on', p_paid_on);
  END IF;
  IF nullif(btrim(coalesce(p_note, '')), '') IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('note', left(btrim(p_note), 500));
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  IF NOT a.allow_overpayment AND round(p_amount, 2) > (public.finance_totals(a.id) ->> 'balance')::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('This is more than the %s %s balance',
      (public.finance_totals(a.id) ->> 'balance')::numeric, a.currency);
  END IF;
  v_payment := public.finance_receive(a, p_amount, p_method, p_reference, 'manual', NULL, NULL, p_idempotency_key,
    nullif(v_meta, '{}'::jsonb));
  PERFORM public.finance_sync_entity(a);
  RETURN v_payment;
END $$;

-- ============== TRAINING: FEES ARE CHARGES ==============
-- The finance account of an enrollment, opened on its first fee
CREATE OR REPLACE FUNCTION training.finance_account(_enrollment uuid)
RETURNS public.finance_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE
  v_currency text := coalesce((SELECT value ->> 'currency' FROM training.settings WHERE key = 'center'), 'RWF');
  v_student training.students;
BEGIN
  SELECT s.* INTO v_student FROM training.enrollments e JOIN training.students s ON s.id = e.student_id WHERE e.id = _enrollment;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Enrollment not found';
  END IF;
  RETURN public.finance_open_account('training.enrollments', _enrollment, v_currency, v_student.user_id,
    v_student.student_number || ' · ' || v_student.full_name);
END $$;

CREATE OR REPLACE FUNCTION training.fee_to_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE a public.finance_accounts;
BEGIN
  IF NEW.amount > 0 THEN
    a := training.finance_account(NEW.enrollment_id);
    PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
    PERFORM public.finance_post(a, 'charge', NEW.amount, CASE WHEN NEW.type = 'other' THEN 'manual' ELSE 'price' END,
      NEW.description);
    PERFORM public.finance_sync_entity(a);
  END IF;
  RETURN NULL;
END $$;

-- A fee is a record of what was charged: a mistake is corrected with a discount,
-- waiver or adjustment, never by editing or deleting the fee.
CREATE OR REPLACE FUNCTION training.fee_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = 'Fees can''t be changed or deleted. Reduce what the student owes with a discount or waiver.';
END $$;

-- The student's Isoko account, once they have one, sees their own account
CREATE OR REPLACE FUNCTION training.finance_customer_follows_student()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.finance_begin();
    UPDATE public.finance_accounts a SET customer_user_id = NEW.user_id
    FROM training.enrollments e
    WHERE e.student_id = NEW.id AND a.entity_table = 'training.enrollments' AND a.entity_id = e.id
      AND a.customer_user_id IS DISTINCT FROM NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

-- ============== TRAINING: RECEIPTS FOR EVERY PAYMENT ==============
CREATE OR REPLACE FUNCTION training.issue_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = training, public AS $$
DECLARE
  v_year int;
  v_n int;
BEGIN
  IF NEW.status NOT IN ('successful', 'partially_refunded', 'refunded')
     OR NOT EXISTS (SELECT 1 FROM public.finance_accounts WHERE id = NEW.account_id AND module = 'training')
     OR EXISTS (SELECT 1 FROM training.receipts WHERE payment_id = NEW.id) THEN
    RETURN NULL;
  END IF;
  v_year := extract(year FROM coalesce((NEW.metadata ->> 'paid_on')::date, (now() AT TIME ZONE 'Africa/Kigali')::date))::int;
  INSERT INTO training.counters (key, value) VALUES ('receipt:' || v_year, 1)
  ON CONFLICT (key) DO UPDATE SET value = training.counters.value + 1
  RETURNING value INTO v_n;
  INSERT INTO training.receipts (payment_id, receipt_number)
  VALUES (NEW.id, format('ISK-RCPT-%s-%s', v_year, lpad(v_n::text, 5, '0')));
  RETURN NULL;
END $$;

-- ============== TRAINING: MOVE THE MONEY ==============
ALTER TABLE training.payments RENAME TO payments_legacy;
COMMENT ON TABLE training.payments_legacy IS
  'Before 2026-09-25: Training Center payments. Copied into public.finance_payments (same ids); read-only history.';
ALTER TABLE training.receipts DROP CONSTRAINT IF EXISTS receipts_payment_id_fkey;

-- Copying history must not message anyone about old payments
ALTER TABLE public.finance_payments DISABLE TRIGGER notify_changes;

DO $$
DECLARE
  e record;
  a public.finance_accounts;
  p training.payments_legacy;
  v_entry bigint;
BEGIN
  PERFORM public.finance_begin();
  FOR e IN
    SELECT DISTINCT enrollment_id FROM training.fee_charges WHERE amount > 0
    UNION SELECT DISTINCT enrollment_id FROM training.payments_legacy
  LOOP
    a := training.finance_account(e.enrollment_id);
    INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, created_by, created_at)
    SELECT a.id, 'charge', f.amount, a.currency, 'legacy', f.description,
           (SELECT id FROM auth.users WHERE id = f.created_by), f.created_at
    FROM training.fee_charges f WHERE f.enrollment_id = e.enrollment_id AND f.amount > 0 ORDER BY f.created_at;

    FOR p IN SELECT * FROM training.payments_legacy WHERE enrollment_id = e.enrollment_id ORDER BY recorded_at LOOP
      INSERT INTO public.finance_payments (id, account_id, amount, currency, method, provider, reference, status,
        confirmed_at, voided_at, metadata, created_by, confirmed_by, legacy, created_at)
      VALUES (p.id, a.id, p.amount, a.currency, p.method, 'manual', p.reference,
        CASE WHEN p.voided_at IS NULL THEN 'successful' ELSE 'voided' END, p.recorded_at, p.voided_at,
        jsonb_strip_nulls(jsonb_build_object('paid_on', p.paid_on, 'note', nullif(p.notes, ''))),
        (SELECT id FROM auth.users WHERE id = p.recorded_by), (SELECT id FROM auth.users WHERE id = p.recorded_by),
        true, p.recorded_at);
      INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, payment_id, created_by, created_at)
      VALUES (a.id, 'payment', -p.amount, a.currency, 'legacy',
        format('Payment received (%s%s)', p.method, CASE WHEN p.reference <> '' THEN ' ' || p.reference ELSE '' END),
        p.id, (SELECT id FROM auth.users WHERE id = p.recorded_by), p.recorded_at)
      RETURNING id INTO v_entry;
      IF p.voided_at IS NOT NULL THEN
        INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, reason,
          payment_id, reverses_entry_id, created_by, created_at)
        VALUES (a.id, 'void', p.amount, a.currency, 'legacy', 'Payment voided', coalesce(p.void_reason, 'Voided'),
          p.id, v_entry, (SELECT id FROM auth.users WHERE id = p.voided_by), p.voided_at);
      END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.finance_payments ENABLE TRIGGER notify_changes;

ALTER TABLE training.receipts ADD CONSTRAINT receipts_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.finance_payments(id) ON DELETE RESTRICT;

-- The old tables are history: nothing writes them again
CREATE TRIGGER payments_legacy_read_only BEFORE INSERT OR UPDATE OR DELETE ON training.payments_legacy
  FOR EACH ROW EXECUTE FUNCTION training.fee_guard();

-- From now on
CREATE TRIGGER fee_to_ledger AFTER INSERT ON training.fee_charges
  FOR EACH ROW EXECUTE FUNCTION training.fee_to_ledger();
CREATE TRIGGER fee_guard BEFORE UPDATE OR DELETE ON training.fee_charges
  FOR EACH ROW EXECUTE FUNCTION training.fee_guard();
CREATE TRIGGER finance_customer AFTER INSERT OR UPDATE OF user_id ON training.students
  FOR EACH ROW EXECUTE FUNCTION training.finance_customer_follows_student();
DROP TRIGGER IF EXISTS training_receipt ON public.finance_payments;
CREATE TRIGGER training_receipt AFTER INSERT OR UPDATE OF status ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION training.issue_receipt();

-- What the API reads as "payments": the engine's training payments
CREATE VIEW training.payments AS
SELECT p.id,
       a.entity_id AS enrollment_id,
       p.amount,
       p.refunded_amount,
       p.status,
       p.method,
       p.reference,
       coalesce((p.metadata ->> 'paid_on')::date, (p.created_at AT TIME ZONE 'Africa/Kigali')::date) AS paid_on,
       coalesce(p.metadata ->> 'note', '') AS notes,
       p.created_by AS recorded_by,
       p.created_at AS recorded_at,
       p.voided_at,
       v.created_by AS voided_by,
       v.reason AS void_reason
FROM public.finance_payments p
JOIN public.finance_accounts a ON a.id = p.account_id AND a.module = 'training'
LEFT JOIN LATERAL (
  SELECT l.created_by, l.reason FROM public.finance_ledger l
  WHERE l.payment_id = p.id AND l.kind = 'void' ORDER BY l.id DESC LIMIT 1
) v ON true
WHERE p.status IN ('successful', 'partially_refunded', 'refunded', 'voided');

-- What each enrollment owes and has paid, from the ledger: total_fees is the
-- fees less discounts and waivers, total_paid the money kept (refunds and
-- voids excluded), so total_fees - total_paid is the ledger balance.
CREATE OR REPLACE VIEW training.enrollment_balances AS
SELECT e.id AS enrollment_id,
       ((t ->> 'charged')::numeric - (t ->> 'credits')::numeric)::numeric(12,2) AS total_fees,
       (t ->> 'paid')::numeric(12,2) AS total_paid
FROM training.enrollments e
CROSS JOIN LATERAL public.finance_totals_for('training.enrollments', e.id) t;

-- ============== TRAINING: EMAILS GO THROUGH THE ENGINE ==============
ALTER TABLE training.notifications ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.notification_events(id);

-- Emails still waiting in the old outbox are handed over, secrets included
DO $$
DECLARE
  n record;
  v_event uuid;
  v_site text := coalesce(nullif((SELECT value FROM public.platform_settings WHERE key = 'site_url'), ''), '');
BEGIN
  FOR n IN SELECT * FROM training.notifications WHERE email_status IN ('pending', 'sending') AND email IS NOT NULL LOOP
    v_event := public.notify_event('TRAINING_NOTICE', 'TRAINING_NOTICE:' || n.id, 'training.notifications', n.id,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('user_id', (SELECT id FROM auth.users WHERE id = n.user_id), 'email', n.email))),
      jsonb_build_object('title', n.title, 'body', n.body,
        'url', CASE WHEN n.link IS NULL THEN '' WHEN n.link LIKE 'http%' THEN n.link
                    WHEN v_site = '' THEN '' ELSE v_site || '/training-center' || n.link END));
    PERFORM public.notification_attach_secret(v_event, n.email_secret);
    UPDATE training.notifications SET event_id = v_event, email_status = 'none', email_secret = NULL, email_locked_until = NULL
    WHERE id = n.id;
  END LOOP;
END $$;

-- ============== PERMISSIONS ==============
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'notification_attach_secret(uuid, text)', 'training_is_admin()', 'finance_can_reverse_module(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.finance_record_payment(text, uuid, numeric, text, text, text, text, date) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.finance_record_payment(text, uuid, numeric, text, text, text, text, date) TO authenticated';
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA training FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA training FROM PUBLIC, anon, authenticated;

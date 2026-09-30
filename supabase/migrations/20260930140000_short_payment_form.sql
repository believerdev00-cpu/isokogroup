-- A shorter subscription payment form (company decision, 2026-09-30)
--
-- The customer now gives only:
--   * the name of the person who paid, and
--   * the MoMo transaction ID, or a screenshot of the payment confirmation
--     (either one; both is fine).
-- The amount is the chosen plan's price (the database's, as before); the payer
-- number and the payment time are no longer asked. The admin checks the name,
-- the ID or the screenshot against the company MoMo account before confirming.
--
-- Screenshots go to the private bucket payment-proofs, in the customer's own
-- folder (<user id>/...). Only the customer, admins and finance staff can open
-- them; nobody can change or delete one once sent.

-- ============== THE SCREENSHOTS ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Customers upload own payment proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Customers and finance read payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text
                                            OR public.finance_can_collect('subscriptions')));

-- ============== THE PAYMENT REPORT ==============
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS payer_name text CHECK (length(payer_name) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS proof_path text CHECK (proof_path ~ '^[0-9a-f-]{36}/[^/]{1,200}$');
ALTER TABLE public.subscription_payments ALTER COLUMN reference DROP NOT NULL;
ALTER TABLE public.subscription_payments ALTER COLUMN reference_key DROP NOT NULL;
-- a transaction ID or a screenshot, at least one
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_evidence_check
  CHECK (reference_key IS NOT NULL OR proof_path IS NOT NULL);
-- one report per screenshot
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_proof_uq ON public.subscription_payments (proof_path) WHERE proof_path IS NOT NULL;
-- the guard compared reference_key with <>, which is NULL-blind
CREATE OR REPLACE FUNCTION public.subscription_payment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('isoko.subscription_internal', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Payment reports change only through their functions';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status <> 'pending' OR NEW.amount <> OLD.amount OR NEW.plan <> OLD.plan
      OR NEW.reference_key IS DISTINCT FROM OLD.reference_key OR NEW.proof_path IS DISTINCT FROM OLD.proof_path
      OR NEW.payer_name IS DISTINCT FROM OLD.payer_name
      OR NEW.user_id <> OLD.user_id OR NEW.subscription_id <> OLD.subscription_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This payment was already ' || OLD.status;
  END IF;
  RETURN NEW;
END $$;

-- ============== REPORTING A PAYMENT ==============
DROP FUNCTION IF EXISTS public.submit_subscription_payment(text, numeric, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.submit_subscription_payment(
  p_plan text,
  p_payer_name text,
  p_reference text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  -- optional: when given, it must be the price (the browser can't choose it)
  p_amount numeric DEFAULT NULL
) RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  v_price numeric;
  v_balance numeric;
  v_due numeric;
  v_name text := btrim(coalesce(p_payer_name, ''));
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_key text := nullif(public.subscription_reference_key(p_reference), '');
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_id uuid := gen_random_uuid();
  v_submission uuid;
  r public.subscription_payments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(p_plan = ANY (public.subscription_allowed_plans(auth.uid())), false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = CASE WHEN public.subscription_is_seller_path(auth.uid())
      THEN 'As a seller you pay the seller subscription (it includes everything a normal user has)'
      ELSE 'Choose 7 days or 1 month' END;
  END IF;
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the name of the person who paid';
  END IF;
  IF v_key IS NULL AND v_proof IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the transaction ID, or add a screenshot of the payment';
  END IF;
  IF v_key IS NOT NULL AND (length(v_key) < 4 OR length(v_ref) > 100) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the transaction ID from your Mobile Money message';
  END IF;
  -- the screenshot must be one this person uploaded, in their own folder
  IF v_proof IS NOT NULL AND (split_part(v_proof, '/', 1) <> auth.uid()::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = v_proof)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Add the screenshot again';
  END IF;
  PERFORM public.rate_limit('subscription_payment', 10, 3600, auth.uid()::text);

  -- someone who never signed in to start a trial (e.g. straight to the seller
  -- application) still has a subscription row to pay into
  PERFORM public.start_trial();
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.subscription_payments WHERE subscription_id = v_sub.id AND status = 'pending') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Your last payment is still being checked';
  END IF;
  -- the same transaction (or screenshot) can't pay twice, here or anywhere else on Isoko
  IF v_key IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.subscription_payments WHERE reference_key = v_key AND status <> 'rejected')
    OR EXISTS (SELECT 1 FROM public.finance_payments
               WHERE public.subscription_reference_key(reference) = v_key AND status NOT IN ('voided', 'failed', 'cancelled'))
    OR EXISTS (SELECT 1 FROM public.finance_submissions
               WHERE public.subscription_reference_key(reference) = v_key AND status <> 'rejected')) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This transaction ID was already used for a payment';
  END IF;
  IF v_proof IS NOT NULL AND EXISTS (SELECT 1 FROM public.subscription_payments WHERE proof_path = v_proof) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This screenshot was already sent';
  END IF;

  -- One period at a time, charged at the chosen plan's price. A charge left
  -- open by a rejected report for another plan is waived first.
  a := public.finance_open_account('subscriptions', v_sub.id, 'RWF', v_sub.user_id, 'Subscription');
  v_price := public.subscription_plan_price(p_plan);
  v_balance := (public.finance_totals(a.id) ->> 'balance')::numeric;
  IF v_balance > 0 AND v_balance <> v_price THEN
    PERFORM public.finance_begin();
    PERFORM public.finance_post(a, 'waiver', -v_balance, 'manual', 'Subscription: plan changed',
      NULL, NULL, 'The customer chose another plan');
    v_balance := 0;
  END IF;
  IF v_balance <= 0 THEN
    PERFORM public.finance_post(a, 'charge', v_price, 'price',
      CASE p_plan WHEN 'week' THEN format('Subscription: 7 days (%s days of full access)', public.setting_number('subscription_first_period_days', 7))
                  WHEN 'seller' THEN 'Seller subscription: 1 month (full access and seller dashboard)'
                  ELSE 'Subscription: 1 month of full access' END);
  END IF;
  v_due := (public.finance_totals(a.id) ->> 'balance')::numeric;
  IF p_amount IS NOT NULL AND round(p_amount, 2) <> v_due THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('This payment is %s. Enter the amount you sent.', public.notification_money(v_due, 'RWF'));
  END IF;

  -- staff hear about it through PAYMENT_REPORTED; a screenshot-only report gets
  -- a reference of its own on the finance engine
  v_submission := public.finance_submit(a, v_due, 'momo',
    coalesce(v_key, 'SCREENSHOT-' || upper(left(replace(v_id::text, '-', ''), 12))), 'account');

  PERFORM public.subscription_internal(true);
  INSERT INTO public.subscription_payments (id, subscription_id, user_id, plan, amount, payer_name, reference, reference_key,
                                            proof_path, submission_id)
  VALUES (v_id, v_sub.id, v_sub.user_id, p_plan, v_due, v_name, v_ref, v_key, v_proof, v_submission)
  RETURNING * INTO r;
  UPDATE public.subscriptions SET payment_reference = coalesce(v_ref, 'screenshot'), payment_submitted_at = now() WHERE id = v_sub.id;
  PERFORM public.subscription_internal(false);

  PERFORM public.subscription_notify('SUBSCRIPTION_PAYMENT_PENDING', r.id::text, v_sub, jsonb_build_object(
    'amount', public.notification_money(r.amount, r.currency), 'reference', coalesce(r.reference, 'screenshot'),
    'period', CASE r.plan WHEN 'week' THEN '7 days' WHEN 'seller' THEN 'month of seller subscription' ELSE 'month' END));
  RETURN r;
END $$;

-- ============== WHAT THE ADMIN LIST SHOWS ==============
DROP FUNCTION IF EXISTS public.subscription_payments_list(text, integer);
CREATE FUNCTION public.subscription_payments_list(p_status text DEFAULT 'pending', p_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid, subscription_id uuid, user_id uuid, customer_name text, customer_email text,
  plan text, amount numeric, currency text, payer_name text, payer_phone text, reference text, proof_path text,
  paid_at timestamptz, status text, submitted_at timestamptz, confirmed_by_name text, confirmed_at timestamptz,
  rejected_by_name text, rejected_at timestamptz, rejection_reason text,
  period_starts_at timestamptz, period_ends_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can see subscription payments';
  END IF;
  RETURN QUERY
  SELECT p.id, p.subscription_id, p.user_id, pr.full_name, u.email::text,
         p.plan, p.amount, p.currency, p.payer_name, p.payer_phone, p.reference, p.proof_path,
         p.paid_at, p.status, p.submitted_at, cb.full_name, p.confirmed_at,
         rb.full_name, p.rejected_at, p.rejection_reason,
         p.period_starts_at, p.period_ends_at
  FROM public.subscription_payments p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  LEFT JOIN public.profiles cb ON cb.user_id = p.confirmed_by
  LEFT JOIN public.profiles rb ON rb.user_id = p.rejected_by
  WHERE p_status IS NULL OR p_status = 'all' OR p.status = p_status
  ORDER BY CASE WHEN p.status = 'pending' THEN p.submitted_at END ASC NULLS LAST, p.submitted_at DESC
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END $$;

-- ============== PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(text, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(text, text, text, text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_payments_list(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_payments_list(text, integer) TO authenticated;

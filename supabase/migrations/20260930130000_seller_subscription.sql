-- The final subscription rule (company decision, 2026-09-30)
--
--   Normal user / buyer: a 10-minute free trial, then, as they choose,
--     50 RWF for 7 days ('week') or 200 RWF for one calendar month ('monthly').
--   Seller: 1,500 RWF per calendar month ('seller'). It is the seller's whole
--     subscription: everything a normal user has, plus the existing seller
--     dashboard. A seller never also pays 50 or 200 RWF.
--
-- Registering as a seller, or choosing "Become a seller" as an existing user,
-- sends the existing seller application; from then on the only plan offered
-- is the seller plan. Paying works as for every subscription (MoMo to the
-- company code, the customer reports it, it stays pending): when an admin
-- confirms a first seller payment, the application is approved through the
-- existing approval (seller role, SELLER_APPROVED), so the existing seller
-- system opens as it always has. Every later month is a renewal of the same
-- plan; nothing renews by itself.
--
-- Also:
--   * A seller application can't be approved without a confirmed seller
--     payment (seller_approval_needs_payment), whichever button is used.
--   * Sending a seller application no longer needs a running trial or
--     subscription: the seller plan it leads to includes access.
--   * The subscription records the seller's payment status, period start,
--     expiry and renewal status (subscription_state: renewal_status).
--   * Sellers who were approved before this and still hold a 50/200 RWF period
--     keep it until it ends; their next payment is the seller plan.

-- ============== THE SELLER PLAN ==============
INSERT INTO public.platform_settings (key, value) VALUES ('seller_monthly_price', '1500')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_seller_price_setting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.key = 'seller_monthly_price' AND (btrim(NEW.value) !~ '^[0-9]+$' OR btrim(NEW.value)::int NOT BETWEEN 1 AND 10000000) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The seller monthly price is a whole number of RWF, at least 1';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_seller_price_setting BEFORE INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.check_seller_price_setting();

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('trial', 'week', 'monthly', 'seller'));
ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_plan_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_plan_check CHECK (plan IN ('week', 'monthly', 'seller'));

CREATE OR REPLACE FUNCTION public.subscription_plan_price(_plan text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _plan
    WHEN 'week' THEN public.setting_number('subscription_first_week_price', 50)
    WHEN 'seller' THEN public.setting_number('seller_monthly_price', 1500)
    ELSE public.setting_number('subscription_monthly_price', 200) END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_period_end(_plan text, _start timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _plan
    WHEN 'week' THEN _start + make_interval(days => public.setting_number('subscription_first_period_days', 7)::int)
    ELSE _start + make_interval(months => public.setting_number('subscription_period_months', 1)::int) END;
$$;

-- A seller, or someone whose seller application is waiting, pays the seller
-- plan; everyone else chooses the 7 days or the month.
CREATE OR REPLACE FUNCTION public.subscription_is_seller_path(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'seller')
      OR EXISTS (SELECT 1 FROM public.seller_applications WHERE user_id = _user AND status = 'pending');
$$;

CREATE OR REPLACE FUNCTION public.subscription_allowed_plans(_user uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.subscription_is_seller_path(_user) THEN ARRAY['seller'] ELSE ARRAY['week', 'monthly'] END;
$$;

-- The plan the page suggests: the seller plan on the seller path; otherwise 7
-- days until a period has been paid, then the month (either can be chosen)
CREATE OR REPLACE FUNCTION public.subscription_next_plan(_subscription uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.subscription_is_seller_path((SELECT user_id FROM public.subscriptions WHERE id = _subscription)) THEN 'seller'
    WHEN _subscription IS NOT NULL AND public.subscription_paid_before(_subscription) THEN 'monthly'
    ELSE 'week' END;
$$;

-- ============== SELLER APPLICATIONS ==============
-- Sending one needs no running access (the seller plan includes it)
DROP TRIGGER IF EXISTS require_active_access ON public.seller_applications;

-- Approved only with a confirmed seller payment
CREATE OR REPLACE FUNCTION public.seller_approval_needs_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT EXISTS (SELECT 1 FROM public.subscription_payments
                     WHERE user_id = NEW.user_id AND plan = 'seller' AND status = 'confirmed') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'A seller is approved by confirming their 1,500 RWF seller subscription payment (Users > Subscription payments)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seller_approval_needs_payment BEFORE UPDATE OF status ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.seller_approval_needs_payment();

-- ============== MESSAGES ==============
INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  ('SUBSCRIPTION_SELLER_ACTIVATED', 'The seller subscription payment was confirmed: a month of seller access started', ARRAY['in_app', 'email'], 'success'),
  ('SUBSCRIPTION_SELLER_ENDING', 'The seller subscription ends soon (24 hours, 1 hour)', ARRAY['in_app', 'email'], 'warning'),
  ('SUBSCRIPTION_SELLER_EXPIRED', 'The seller subscription ended', ARRAY['in_app', 'email'], 'warning')
ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('SUBSCRIPTION_SELLER_ACTIVATED', '*', '{{amount}} payment confirmed',
   '{{amount}} payment confirmed. Your seller subscription is active until {{until}}: full access to Isoko and your seller dashboard. {{link}}'),
  ('SUBSCRIPTION_SELLER_ENDING', '*', 'Your seller subscription expires in {{left}}',
   'Your seller subscription expires in {{left}} ({{until}}). It does not renew by itself: pay {{price}} to the Isoko Mobile Money code {{momo}} to keep selling. {{link}}'),
  ('SUBSCRIPTION_SELLER_EXPIRED', '*', 'Your seller subscription has expired',
   'Your seller subscription has expired. Pay {{price}} to the Isoko Mobile Money code {{momo}} for another month of seller access, then send us the transaction ID: {{link}}')
ON CONFLICT (event_type, channel) DO NOTHING;

-- ============== REPORTING A PAYMENT: THE CUSTOMER CHOOSES THE PLAN ==============
DROP FUNCTION IF EXISTS public.submit_subscription_payment(numeric, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.submit_subscription_payment(
  p_plan text, p_amount numeric, p_payer_phone text, p_reference text, p_paid_at timestamptz DEFAULT NULL
) RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  v_price numeric;
  v_balance numeric;
  v_due numeric;
  v_ref text := btrim(coalesce(p_reference, ''));
  v_key text := public.subscription_reference_key(p_reference);
  v_phone text := regexp_replace(coalesce(p_payer_phone, ''), '[\s\-().]', '', 'g');
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
  IF length(v_key) < 4 OR length(v_ref) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the transaction ID from your Mobile Money message';
  END IF;
  IF v_phone !~ '^\+?[0-9]{9,15}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the Mobile Money number you paid from';
  END IF;
  IF p_paid_at IS NOT NULL AND (p_paid_at > now() + interval '10 minutes' OR p_paid_at < now() - interval '30 days') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter when you paid (within the last 30 days)';
  END IF;
  PERFORM public.rate_limit('subscription_payment', 10, 3600, auth.uid()::text);

  -- someone who never signed in to start a trial (e.g. straight to the seller
  -- application) still has a subscription row to pay into
  PERFORM public.start_trial();
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.subscription_payments WHERE subscription_id = v_sub.id AND status = 'pending') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Your last payment is still being checked';
  END IF;
  -- the same transaction can't pay twice, here or anywhere else on Isoko
  IF EXISTS (SELECT 1 FROM public.subscription_payments WHERE reference_key = v_key AND status <> 'rejected')
     OR EXISTS (SELECT 1 FROM public.finance_payments
                WHERE public.subscription_reference_key(reference) = v_key AND status NOT IN ('voided', 'failed', 'cancelled'))
     OR EXISTS (SELECT 1 FROM public.finance_submissions
                WHERE public.subscription_reference_key(reference) = v_key AND status <> 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This transaction ID was already used for a payment';
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
  -- the price is the database's, not the browser's
  IF p_amount IS NULL OR round(p_amount, 2) <> v_due THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('This payment is %s. Enter the amount you sent.', public.notification_money(v_due, 'RWF'));
  END IF;

  -- staff hear about it through PAYMENT_REPORTED
  v_submission := public.finance_submit(a, v_due, 'momo', v_key, 'account');

  PERFORM public.subscription_internal(true);
  INSERT INTO public.subscription_payments (subscription_id, user_id, plan, amount, payer_phone, reference, reference_key, paid_at, submission_id)
  VALUES (v_sub.id, v_sub.user_id, p_plan, v_due, v_phone, v_ref, v_key, p_paid_at, v_submission)
  RETURNING * INTO r;
  UPDATE public.subscriptions SET payment_reference = v_ref, payment_submitted_at = now() WHERE id = v_sub.id;
  PERFORM public.subscription_internal(false);

  PERFORM public.subscription_notify('SUBSCRIPTION_PAYMENT_PENDING', r.id::text, v_sub, jsonb_build_object(
    'amount', public.notification_money(r.amount, r.currency), 'reference', r.reference,
    'period', CASE r.plan WHEN 'week' THEN '7 days' WHEN 'seller' THEN 'month of seller subscription' ELSE 'month' END));
  RETURN r;
END $$;

-- ============== CONFIRMING: A FIRST SELLER PAYMENT APPROVES THE SELLER ==============
CREATE OR REPLACE FUNCTION public.subscription_confirm_payment(p_payment_id uuid)
RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.subscription_payments;
  v_sub public.subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_finance_payment uuid;
  v_application uuid;
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can confirm subscription payments';
  END IF;
  SELECT * INTO r FROM public.subscription_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = r.subscription_id FOR UPDATE;
  SELECT * INTO r FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This payment was already ' || r.status;
  END IF;
  IF r.user_id = auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Someone else must confirm your own payment';
  END IF;
  -- a new seller: their waiting application is approved with this payment
  IF r.plan = 'seller' AND NOT public.has_role(r.user_id, 'seller') THEN
    SELECT id INTO v_application FROM public.seller_applications
    WHERE user_id = r.user_id AND status = 'pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_application IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This person has no seller application waiting: reject the payment, or ask them to apply first';
    END IF;
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An admin confirms a new seller''s first payment (it approves the seller)';
    END IF;
  END IF;
  PERFORM set_config('isoko.audit_reason', format('Subscription payment %s confirmed (%s RWF, %s)', r.reference, r.amount, r.plan), true);

  PERFORM public.subscription_internal(true);
  IF r.submission_id IS NOT NULL THEN
    v_finance_payment := public.finance_verify_submission(r.submission_id, NULL,
      format('Subscription %s: checked on the company MoMo account', r.plan));
  END IF;
  -- a paid period still running is finished first; otherwise it starts now
  v_start := CASE WHEN v_sub.status = 'active' AND v_sub.expires_at > now() THEN v_sub.expires_at ELSE now() END;
  v_end := public.subscription_period_end(r.plan, v_start);

  UPDATE public.subscription_payments
  SET status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = clock_timestamp(), payment_id = v_finance_payment,
      period_starts_at = v_start, period_ends_at = v_end
  WHERE id = r.id
  RETURNING * INTO r;
  UPDATE public.subscriptions
  SET status = 'active', plan = r.plan, amount = r.amount,
      starts_at = CASE WHEN v_start > now() THEN starts_at ELSE v_start END, expires_at = v_end,
      payment_reference = NULL, payment_submitted_at = NULL
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;
  PERFORM public.subscription_internal(false);

  -- the existing approval: seller role and the SELLER_APPROVED message
  IF v_application IS NOT NULL THEN
    PERFORM public.approve_seller_application(v_application);
  END IF;

  PERFORM public.subscription_notify(
    CASE r.plan WHEN 'week' THEN 'SUBSCRIPTION_WEEK_ACTIVATED' WHEN 'seller' THEN 'SUBSCRIPTION_SELLER_ACTIVATED'
                ELSE 'SUBSCRIPTION_MONTH_ACTIVATED' END, r.id::text, v_sub,
    jsonb_build_object('amount', public.notification_money(r.amount, r.currency),
                       'until', to_char(v_end AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY HH24:MI "(Kigali time)"')));
  RETURN r;
END $$;

-- ============== TIME PASSING: SELLER REMINDERS ==============
CREATE OR REPLACE FUNCTION public.subscription_advance(_sub public.subscriptions)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until text;
  v_kind text := CASE _sub.plan WHEN 'week' THEN 'WEEK' WHEN 'seller' THEN 'SELLER' ELSE 'MONTH' END;
  n integer := 0;
BEGIN
  IF _sub.status = 'trial' THEN
    IF _sub.trial_expires_at <= now() THEN
      PERFORM public.subscription_internal(true);
      UPDATE public.subscriptions SET status = 'expired' WHERE id = _sub.id AND status = 'trial';
      PERFORM public.subscription_internal(false);
      -- (one that ended long before this release is closed without a message)
      IF _sub.trial_expires_at > now() - interval '1 day' THEN
        PERFORM public.subscription_notify('TRIAL_EXPIRED', 'end', _sub);
      END IF;
      n := 1;
    ELSIF _sub.trial_expires_at <= now() + interval '150 seconds' THEN
      PERFORM public.subscription_notify('TRIAL_ENDING_SOON', 'soon', _sub);
      n := 1;
    END IF;
  ELSIF _sub.status = 'active' THEN
    v_until := to_char(_sub.expires_at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY HH24:MI "(Kigali time)"');
    IF _sub.expires_at <= now() THEN
      PERFORM public.subscription_internal(true);
      UPDATE public.subscriptions SET status = 'expired' WHERE id = _sub.id AND status = 'active';
      PERFORM public.subscription_internal(false);
      IF _sub.expires_at > now() - interval '1 day' THEN
        PERFORM public.subscription_notify('SUBSCRIPTION_' || v_kind || '_EXPIRED', 'end:' || _sub.expires_at, _sub);
      END IF;
      n := 1;
    ELSIF _sub.expires_at <= now() + interval '1 hour' THEN
      PERFORM public.subscription_notify('SUBSCRIPTION_' || v_kind || '_ENDING', '1h:' || _sub.expires_at, _sub,
        jsonb_build_object('left', '1 hour', 'until', v_until));
      n := 1;
    ELSIF _sub.expires_at <= now() + interval '24 hours' THEN
      PERFORM public.subscription_notify('SUBSCRIPTION_' || v_kind || '_ENDING', '24h:' || _sub.expires_at, _sub,
        jsonb_build_object('left', '24 hours', 'until', v_until));
      n := 1;
    END IF;
  END IF;
  RETURN n;
END $$;

-- ============== WHAT THE SITE SEES ==============
-- Adds the plans this person may choose (with prices and lengths), whether they
-- are on the seller path, and the renewal status:
--   'trial'           free trial running
--   'active'          paid period running, more than 3 days left
--   'due_soon'        3 days or less left, no renewal reported
--   'renewal_pending' a payment is waiting for confirmation
--   'expired'         access ended (or never paid)
CREATE OR REPLACE FUNCTION public.subscription_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_until timestamptz;
  v_status text;
  v_pending public.subscription_payments;
  v_last public.subscription_payments;
  v_last_confirmed public.subscription_payments;
  v_next_plan text := 'week';
  v_staff boolean := false;
  v_plans jsonb;
  v_prices jsonb := jsonb_build_object(
    'trial_minutes', public.setting_number('subscription_trial_minutes', 10),
    'week_price', public.setting_number('subscription_first_week_price', 50),
    'week_days', public.setting_number('subscription_first_period_days', 7),
    'monthly_price', public.setting_number('subscription_monthly_price', 200),
    'monthly_months', public.setting_number('subscription_period_months', 1),
    'seller_price', public.setting_number('seller_monthly_price', 1500),
    'momo_code', public.setting_text('company_momo_code', '*182*8*1*871951#'),
    'currency', 'RWF',
    -- older names
    'first_week_price', public.setting_number('subscription_first_week_price', 50),
    'first_period_days', public.setting_number('subscription_first_period_days', 7),
    'period_days', 30);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('signed_in', false) || v_prices;
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    PERFORM public.subscription_advance(v_sub);
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_sub.id;
    v_until := CASE WHEN v_sub.status = 'trial' THEN v_sub.trial_expires_at WHEN v_sub.status = 'active' THEN v_sub.expires_at END;
    v_status := CASE WHEN v_until IS NOT NULL AND v_until > now() THEN v_sub.status ELSE 'expired' END;
    SELECT * INTO v_pending FROM public.subscription_payments WHERE subscription_id = v_sub.id AND status = 'pending';
    SELECT * INTO v_last FROM public.subscription_payments WHERE subscription_id = v_sub.id ORDER BY submitted_at DESC LIMIT 1;
    SELECT * INTO v_last_confirmed FROM public.subscription_payments WHERE subscription_id = v_sub.id AND status = 'confirmed'
      ORDER BY confirmed_at DESC LIMIT 1;
    v_next_plan := public.subscription_next_plan(v_sub.id);
  ELSE
    v_next_plan := CASE WHEN public.subscription_is_seller_path(auth.uid()) THEN 'seller' ELSE 'week' END;
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
      'plan', p,
      'price', public.subscription_plan_price(p),
      'days', CASE p WHEN 'week' THEN public.setting_number('subscription_first_period_days', 7) END,
      'months', CASE WHEN p <> 'week' THEN public.setting_number('subscription_period_months', 1) END))
    INTO v_plans
  FROM unnest(public.subscription_allowed_plans(auth.uid())) p;
  v_staff := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
                     AND role::text IN ('finance', 'travel_staff', 'consultancy_staff', 'data_analyst', 'media_staff', 'driver'));
  RETURN jsonb_build_object(
    'signed_in', true,
    'exempt', public.is_admin(),
    'staff', v_staff,
    'is_seller', public.has_role(auth.uid(), 'seller'),
    'seller_path', public.subscription_is_seller_path(auth.uid()),
    'has_access', public.has_active_access(auth.uid()),
    'status', CASE WHEN v_sub.id IS NULL THEN 'none' ELSE v_status END,
    'plan', v_sub.plan,
    'trial_started_at', v_sub.trial_started_at,
    'trial_expires_at', v_sub.trial_expires_at,
    'period_started_at', CASE WHEN v_sub.status = 'active' THEN v_sub.starts_at END,
    'access_until', CASE WHEN v_status IN ('trial', 'active') THEN v_until END,
    'seconds_left', CASE WHEN v_status IN ('trial', 'active') THEN greatest(0, floor(extract(epoch FROM v_until - now()))) END,
    'ended', CASE WHEN v_status = 'expired' THEN v_sub.plan END,
    'payment_status', CASE WHEN v_pending.id IS NOT NULL THEN 'pending' ELSE v_last.status END,
    'last_confirmed_at', v_last_confirmed.confirmed_at,
    'renewal_status', CASE
      WHEN v_pending.id IS NOT NULL THEN 'renewal_pending'
      WHEN v_status = 'trial' THEN 'trial'
      WHEN v_status = 'active' AND v_until <= now() + interval '3 days' THEN 'due_soon'
      WHEN v_status = 'active' THEN 'active'
      ELSE 'expired' END,
    'payment_pending', v_pending.id IS NOT NULL,
    'pending_payment', CASE WHEN v_pending.id IS NOT NULL THEN jsonb_build_object(
      'id', v_pending.id, 'plan', v_pending.plan, 'amount', v_pending.amount, 'reference', v_pending.reference,
      'payer_phone', v_pending.payer_phone, 'paid_at', v_pending.paid_at, 'submitted_at', v_pending.submitted_at) END,
    'last_rejection', CASE WHEN v_last.status = 'rejected' THEN jsonb_build_object(
      'amount', v_last.amount, 'reference', v_last.reference, 'reason', v_last.rejection_reason,
      'rejected_at', v_last.rejected_at) END,
    'plans', coalesce(v_plans, '[]'::jsonb),
    'next_plan', v_next_plan,
    'next_is_first_week', v_next_plan = 'week',
    'next_price', public.subscription_plan_price(v_next_plan),
    'next_days', CASE WHEN v_next_plan = 'week' THEN public.setting_number('subscription_first_period_days', 7) END
  ) || v_prices;
END $$;

-- The website shows the seller price with the other public settings
CREATE OR REPLACE FUNCTION public.site_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(key,
    CASE WHEN key IN ('company_phones', 'social_links') THEN coalesce(value, '[]')::jsonb ELSE to_jsonb(value) END), '{}'::jsonb)
  FROM public.platform_settings
  WHERE key IN ('company_name', 'company_email', 'company_phones', 'company_address', 'company_map_query',
                'whatsapp_office', 'whatsapp_ict', 'company_momo_code', 'momo_account_name', 'momo_label',
                'bank_name', 'bank_account_number', 'bank_account_name', 'bank_swift', 'social_links',
                'marketplace_commission_percent', 'subscription_trial_minutes', 'subscription_first_week_price',
                'subscription_first_period_days', 'subscription_monthly_price', 'subscription_period_months',
                'seller_monthly_price');
$$;

-- ============== PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.check_seller_price_setting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seller_approval_needs_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_is_seller_path(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_allowed_plans(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(text, numeric, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(text, numeric, text, text, timestamptz) TO authenticated;

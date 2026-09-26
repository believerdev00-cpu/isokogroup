-- A 20-minute trial; the first paid period is a week, not a month
--
-- The free trial lasts 20 minutes. After it, 50 RWF buys the first WEEK (7 days). Every payment
-- after that is 200 RWF for a MONTH (30 days). The length of each paid period
-- is decided when finance confirms the payment (activate_subscription): the
-- account's first charge gets the first-period length, every later one the
-- monthly length.
--
-- Settings (platform_settings), replacing subscription_first_month_price:
--   subscription_first_week_price   50   price of the first paid period
--   subscription_first_period_days   7   its length
--   subscription_monthly_price     200   price of every later period
--   subscription_period_days        30   their length
--   subscription_trial_minutes      20   the free trial, from the first sign-in

-- ============== SETTINGS ==============
INSERT INTO public.platform_settings (key, value)
SELECT 'subscription_first_week_price',
       coalesce((SELECT value FROM public.platform_settings WHERE key = 'subscription_first_month_price'), '50')
ON CONFLICT (key) DO NOTHING;
DELETE FROM public.platform_settings WHERE key = 'subscription_first_month_price';
-- the free trial is 20 minutes
UPDATE public.platform_settings SET value = '20' WHERE key = 'subscription_trial_minutes';
ALTER TABLE public.subscriptions ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '20 minutes';
INSERT INTO public.platform_settings (key, value) VALUES
  ('subscription_first_period_days', '7'),
  ('subscription_period_days', '30')
ON CONFLICT (key) DO NOTHING;

-- How many paid periods this subscription has been charged for so far
CREATE OR REPLACE FUNCTION public.subscription_charges(_subscription uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
  WHERE a.entity_table = 'subscriptions' AND a.entity_id = _subscription AND l.kind = 'charge';
$$;

CREATE OR REPLACE FUNCTION public.subscription_next_price(_subscription uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.subscription_charges(_subscription) > 0
    THEN public.setting_number('subscription_monthly_price', 200)
    ELSE public.setting_number('subscription_first_week_price', 50) END;
$$;

-- ============== THE TRIAL ==============
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_minutes numeric := public.setting_number('subscription_trial_minutes', 20);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_sub;
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, amount, status, starts_at, trial_ends_at, expires_at)
  VALUES (auth.uid(), 'basic', public.setting_number('subscription_first_week_price', 50), 'trial', now(),
          now() + make_interval(secs => v_minutes * 60), now() + make_interval(secs => v_minutes * 60))
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

-- ============== PAYING ==============
CREATE OR REPLACE FUNCTION public.submit_subscription_payment(p_reference text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  t jsonb;
  v_first boolean;
BEGIN
  IF coalesce(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'Payment reference required';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sign in again to start your trial first';
  END IF;

  a := public.finance_open_account('subscriptions', v_sub.id, 'RWF', v_sub.user_id, 'Subscription ' || v_sub.plan);
  t := public.finance_totals(a.id);
  IF (t ->> 'pending')::numeric > 0 THEN
    RAISE EXCEPTION 'Your last payment is still being checked';
  END IF;
  -- One period at a time: charge it if nothing is owed yet, at its price
  IF (t ->> 'balance')::numeric <= 0 THEN
    v_first := public.subscription_charges(v_sub.id) = 0;
    PERFORM public.finance_post(a, 'charge',
      CASE WHEN v_first THEN public.setting_number('subscription_first_week_price', 50)
           ELSE public.setting_number('subscription_monthly_price', 200) END,
      'price',
      CASE WHEN v_first
           THEN format('Subscription: first week (%s days)', public.setting_number('subscription_first_period_days', 7))
           ELSE format('Subscription: monthly (%s days)', public.setting_number('subscription_period_days', 30)) END);
  END IF;
  -- staff hear about it through the PAYMENT_REPORTED event
  PERFORM public.finance_submit(a, (public.finance_totals(a.id) ->> 'balance')::numeric, 'momo', p_reference, 'account');

  -- amount: what this period costs, as charged
  UPDATE public.subscriptions
  SET payment_reference = trim(p_reference), payment_submitted_at = now(),
      amount = coalesce((SELECT amount FROM public.finance_ledger WHERE account_id = a.id AND kind = 'charge'
                         ORDER BY id DESC LIMIT 1), amount)
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

-- Finance confirms the payment: the period starts. The first paid period lasts
-- a week, every later one a month. As in 20260925130000_notification_engine.sql
-- otherwise (renewing early adds the period on top of the time left).
CREATE OR REPLACE FUNCTION public.activate_subscription(p_subscription_id uuid)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_submission uuid;
  v_days numeric;
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION 'Only admins can activate subscriptions' USING ERRCODE = '42501';
  END IF;
  -- the reported payment, if any, becomes a payment
  SELECT s.id INTO v_submission
  FROM public.finance_submissions s JOIN public.finance_accounts a ON a.id = s.account_id
  WHERE a.entity_table = 'subscriptions' AND a.entity_id = p_subscription_id AND s.status = 'pending'
  ORDER BY s.created_at LIMIT 1;
  IF v_submission IS NOT NULL THEN
    PERFORM public.finance_verify_submission(v_submission);
  END IF;

  -- the period being paid for: the first charge is the first week
  v_days := CASE WHEN public.subscription_charges(p_subscription_id) <= 1
                 THEN public.setting_number('subscription_first_period_days', 7)
                 ELSE public.setting_number('subscription_period_days', 30) END;

  -- the customer's message follows from the activation (SUBSCRIPTION_ACTIVATED)
  UPDATE public.subscriptions
  SET status = 'active',
      starts_at = now(),
      expires_at = CASE WHEN status = 'active' AND expires_at > now()
                        THEN expires_at ELSE now() END + make_interval(days => v_days::int),
      payment_submitted_at = NULL
  WHERE id = p_subscription_id
  RETURNING * INTO v_sub;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;
  RETURN v_sub;
END $$;

-- ============== WHAT THE SITE SEES ==============
CREATE OR REPLACE FUNCTION public.subscription_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_until timestamptz;
  v_status text;
  v_pending boolean := false;
  v_charges integer := 0;
  v_prices jsonb := jsonb_build_object(
    'trial_minutes', public.setting_number('subscription_trial_minutes', 20),
    'first_week_price', public.setting_number('subscription_first_week_price', 50),
    'first_period_days', public.setting_number('subscription_first_period_days', 7),
    'monthly_price', public.setting_number('subscription_monthly_price', 200),
    'period_days', public.setting_number('subscription_period_days', 30),
    'currency', 'RWF');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('signed_in', false) || v_prices;
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_until := CASE WHEN v_sub.status = 'trial' THEN v_sub.trial_ends_at WHEN v_sub.status = 'active' THEN v_sub.expires_at END;
    v_status := CASE WHEN v_until IS NOT NULL AND v_until > now() THEN v_sub.status ELSE 'expired' END;
    SELECT (public.finance_totals(a.id) ->> 'pending')::numeric > 0 INTO v_pending
    FROM public.finance_accounts a WHERE a.entity_table = 'subscriptions' AND a.entity_id = v_sub.id;
    v_charges := public.subscription_charges(v_sub.id);
  END IF;
  RETURN jsonb_build_object(
    'signed_in', true,
    'exempt', public.is_admin(),
    'has_access', public.has_active_subscription(),
    'status', CASE WHEN v_sub.id IS NULL THEN 'none' ELSE v_status END,
    'access_until', CASE WHEN v_status IN ('trial', 'active') THEN v_until END,
    'seconds_left', CASE WHEN v_status IN ('trial', 'active') THEN greatest(0, floor(extract(epoch FROM v_until - now()))) END,
    'payment_pending', coalesce(v_pending, false),
    -- the next period: the first week until one has been charged, then monthly
    'next_is_first_week', v_charges = 0,
    'next_price', CASE WHEN v_charges = 0 THEN public.setting_number('subscription_first_week_price', 50)
                       ELSE public.setting_number('subscription_monthly_price', 200) END,
    'next_days', CASE WHEN v_charges = 0 THEN public.setting_number('subscription_first_period_days', 7)
                      ELSE public.setting_number('subscription_period_days', 30) END
  ) || v_prices;
END $$;

-- ============== PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.subscription_charges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_next_price(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_state() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(text) TO authenticated;

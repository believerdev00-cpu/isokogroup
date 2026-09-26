-- Subscription pricing: a 5-minute trial, 50 RWF for the first month, then
-- 200 RWF a month
--
--   * A new account gets a 5-minute trial on its first sign-in (once per
--     account). When it ends, the member pages lock until a month is paid.
--   * The first paid month costs 50 RWF, every month after that 200 RWF. The
--     database decides the price from the account's own payment history, so a
--     browser can't choose it.
--   * The three numbers are platform settings (subscription_trial_minutes,
--     subscription_first_month_price, subscription_monthly_price): admins can
--     change them without a release; a change applies to the next charge.
--   * subscription_state() tells the site, in one answer from the server's
--     clock, whether this person may use the member pages, until when, and what
--     their next month costs. Admins always have access.
-- Paying stays as before: the customer pays by MoMo and reports the reference;
-- finance staff confirm it and the month starts (activate_subscription).

INSERT INTO public.platform_settings (key, value) VALUES
  ('subscription_trial_minutes', '5'),
  ('subscription_first_month_price', '50'),
  ('subscription_monthly_price', '200')
ON CONFLICT (key) DO NOTHING;

-- A number from platform_settings, or the given default when unset or not a number
CREATE OR REPLACE FUNCTION public.setting_number(_key text, _default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value::numeric FROM public.platform_settings
                   WHERE key = _key AND value ~ '^[0-9]+(\.[0-9]+)?$'), _default);
$$;

-- What a subscription's next month costs: the first-month price until one has
-- been charged, then the monthly price
CREATE OR REPLACE FUNCTION public.subscription_next_price(_subscription uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
      WHERE a.entity_table = 'subscriptions' AND a.entity_id = _subscription AND l.kind = 'charge')
    THEN public.setting_number('subscription_monthly_price', 200)
    ELSE public.setting_number('subscription_first_month_price', 50) END;
$$;

-- The table's own defaults follow the new trial (only start_trial creates rows)
ALTER TABLE public.subscriptions ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '5 minutes';
ALTER TABLE public.subscriptions ALTER COLUMN amount SET DEFAULT 50;

-- The trial starts on the first sign-in. Asking again returns the same
-- subscription (no second trial, no error), so the site can simply call it.
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_minutes numeric := public.setting_number('subscription_trial_minutes', 5);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_sub;
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, amount, status, starts_at, trial_ends_at, expires_at)
  VALUES (auth.uid(), 'basic', public.setting_number('subscription_first_month_price', 50), 'trial', now(),
          now() + make_interval(secs => v_minutes * 60), now() + make_interval(secs => v_minutes * 60))
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

-- The customer reports their MoMo payment. The month is charged at its price
-- (first month or monthly), decided here.
CREATE OR REPLACE FUNCTION public.submit_subscription_payment(p_reference text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  t jsonb;
  v_price numeric;
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
  -- One month at a time: charge it if nothing is owed yet, at its price
  IF (t ->> 'balance')::numeric <= 0 THEN
    v_first := NOT EXISTS (SELECT 1 FROM public.finance_ledger WHERE account_id = a.id AND kind = 'charge');
    v_price := CASE WHEN v_first THEN public.setting_number('subscription_first_month_price', 50)
                    ELSE public.setting_number('subscription_monthly_price', 200) END;
    PERFORM public.finance_post(a, 'charge', v_price, 'price',
      'Subscription: 30 days (' || CASE WHEN v_first THEN 'first month' ELSE 'monthly' END || ')');
  END IF;
  -- staff hear about it through the PAYMENT_REPORTED event
  PERFORM public.finance_submit(a, (public.finance_totals(a.id) ->> 'balance')::numeric, 'momo', p_reference, 'account');

  -- amount: what this month costs, as charged
  UPDATE public.subscriptions
  SET payment_reference = trim(p_reference), payment_submitted_at = now(),
      amount = coalesce((SELECT amount FROM public.finance_ledger WHERE account_id = a.id AND kind = 'charge'
                         ORDER BY id DESC LIMIT 1), amount)
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

-- Access to the member pages, from the server's clock, for the signed-in person
CREATE OR REPLACE FUNCTION public.subscription_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_until timestamptz;
  v_status text;
  v_pending boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('signed_in', false,
      'trial_minutes', public.setting_number('subscription_trial_minutes', 5),
      'first_month_price', public.setting_number('subscription_first_month_price', 50),
      'monthly_price', public.setting_number('subscription_monthly_price', 200));
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_until := CASE WHEN v_sub.status = 'trial' THEN v_sub.trial_ends_at WHEN v_sub.status = 'active' THEN v_sub.expires_at END;
    v_status := CASE WHEN v_until IS NOT NULL AND v_until > now() THEN v_sub.status ELSE 'expired' END;
    SELECT (public.finance_totals(a.id) ->> 'pending')::numeric > 0 INTO v_pending
    FROM public.finance_accounts a WHERE a.entity_table = 'subscriptions' AND a.entity_id = v_sub.id;
  END IF;
  RETURN jsonb_build_object(
    'signed_in', true,
    'exempt', public.is_admin(),
    'has_access', public.has_active_subscription(),
    'status', CASE WHEN v_sub.id IS NULL THEN 'none' ELSE v_status END,
    'access_until', CASE WHEN v_status IN ('trial', 'active') THEN v_until END,
    'seconds_left', CASE WHEN v_status IN ('trial', 'active') THEN greatest(0, floor(extract(epoch FROM v_until - now()))) END,
    'payment_pending', coalesce(v_pending, false),
    'next_price', CASE WHEN v_sub.id IS NULL THEN public.setting_number('subscription_first_month_price', 50)
                       ELSE public.subscription_next_price(v_sub.id) END,
    'trial_minutes', public.setting_number('subscription_trial_minutes', 5),
    'first_month_price', public.setting_number('subscription_first_month_price', 50),
    'monthly_price', public.setting_number('subscription_monthly_price', 200),
    'currency', 'RWF');
END $$;

-- ============== PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.setting_number(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_next_price(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_state() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(text) TO authenticated;

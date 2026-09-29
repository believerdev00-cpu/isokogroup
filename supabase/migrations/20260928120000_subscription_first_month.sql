-- Subscriptions (company decision, 2026-09-28): a 10-minute free trial from the
-- first sign-in, then 50 RWF for the first month (30 days), then 200 RWF a
-- month. Paid by MoMo to the company code and confirmed by finance, as before
-- (not through ItecPay). Only the settings change; the charge for the first
-- period is labelled after its length instead of always "first week".
UPDATE public.platform_settings SET value = '10' WHERE key = 'subscription_trial_minutes';
UPDATE public.platform_settings SET value = '30' WHERE key = 'subscription_first_period_days';
UPDATE public.platform_settings SET value = '50' WHERE key = 'subscription_first_week_price';

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
           THEN CASE public.setting_number('subscription_first_period_days', 30)
                  WHEN 30 THEN 'Subscription: first month (30 days)'
                  WHEN 7 THEN 'Subscription: first week (7 days)'
                  ELSE format('Subscription: first %s days', public.setting_number('subscription_first_period_days', 30)) END
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

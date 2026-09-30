-- Subscriptions paid by Mobile Money to the company, confirmed by hand
-- (company decision, 2026-09-30; replaces the 50 RWF / 30-day first period of
-- 20260928120000_subscription_first_month.sql)
--
--   sign in -> 10-minute free trial (full access)
--           -> 50 RWF for 7 days of full access   (plan 'week', the first paid period)
--           -> 200 RWF for 1 calendar month        (plan 'monthly', every period after)
--
-- The customer pays the company MoMo code directly, then reports the amount,
-- the number they paid from, the transaction ID and when they paid. The report
-- stays 'pending' and gives no access. An admin or finance officer checks the
-- company MoMo account and confirms (the period starts then) or rejects it
-- (with a reason; the customer may report again). There is no automatic
-- verification and no provider API.
--
-- What changed, and why:
--   * activate_subscription() granted a period whether or not anything was
--     paid, and stacked another one on every call. Periods now start only from
--     a confirmed payment report, once, and never from the customer's own.
--   * Admins could UPDATE subscriptions directly. Subscription dates and status
--     now change only inside these functions (subscription_guard).
--   * has_active_access(user) is the one answer to "may this person use the
--     member services"; database triggers on the member tables use it, so an
--     expired account can't call the APIs directly either.
--   * subscription_sweep() (run every minute by notifications-dispatch) marks
--     trials and periods expired and raises the reminders; e-mails go out
--     through the notification engine, so a failed e-mail never changes a
--     payment or a subscription.
--   * Monthly periods use Postgres calendar months: 31 Jan + 1 month = 28/29 Feb,
--     15 Mar + 1 month = 15 Apr. A payment confirmed while a paid period is
--     still running starts when that period ends (no paid days are lost).

-- ============== SETTINGS ==============
UPDATE public.platform_settings SET value = '10' WHERE key = 'subscription_trial_minutes';
UPDATE public.platform_settings SET value = '50' WHERE key = 'subscription_first_week_price';
UPDATE public.platform_settings SET value = '7' WHERE key = 'subscription_first_period_days';
UPDATE public.platform_settings SET value = '200' WHERE key = 'subscription_monthly_price';
DELETE FROM public.platform_settings WHERE key = 'subscription_period_days';
INSERT INTO public.platform_settings (key, value) VALUES
  ('subscription_trial_minutes', '10'),
  ('subscription_first_week_price', '50'),
  ('subscription_first_period_days', '7'),
  ('subscription_monthly_price', '200'),
  ('subscription_period_months', '1'),
  ('company_momo_code', '*182*8*1*871951#')
ON CONFLICT (key) DO NOTHING;

-- A text setting, or the default
CREATE OR REPLACE FUNCTION public.setting_text(_key text, _default text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nullif(btrim(value), '') FROM public.platform_settings WHERE key = _key), _default);
$$;

-- ============== THE SUBSCRIPTION ROW ==============
ALTER TABLE public.subscriptions RENAME COLUMN trial_ends_at TO trial_expires_at;
ALTER TABLE public.subscriptions ALTER COLUMN trial_expires_at DROP DEFAULT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
UPDATE public.subscriptions SET trial_started_at = created_at WHERE trial_started_at IS NULL AND trial_expires_at IS NOT NULL;

-- plan: what the current (or last) period is
UPDATE public.subscriptions s SET plan = CASE
    WHEN s.status = 'trial' OR NOT EXISTS (
      SELECT 1 FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id
      WHERE a.entity_table = 'subscriptions' AND a.entity_id = s.id AND p.status = 'successful') THEN 'trial'
    WHEN s.expires_at - s.starts_at <= interval '8 days' THEN 'week'
    ELSE 'monthly' END;
ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'trial';
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('trial', 'week', 'monthly'));

-- One subscription per person (start_trial also locks, for databases that
-- already hold duplicates)
DO $$
BEGIN
  IF NOT EXISTS (SELECT user_id FROM public.subscriptions GROUP BY user_id HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_uq ON public.subscriptions (user_id);
  ELSE
    RAISE WARNING 'subscriptions has more than one row for some users; subscriptions_user_uq not created';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS subscriptions_trial_due_idx ON public.subscriptions (trial_expires_at) WHERE status = 'trial';
CREATE INDEX IF NOT EXISTS subscriptions_active_due_idx ON public.subscriptions (expires_at) WHERE status = 'active';

-- Nobody edits subscriptions directly any more, admins included
DROP POLICY IF EXISTS "Admins update subscriptions" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;

-- ============== PAYMENT REPORTS ==============
-- One row per payment the customer reports. The money itself is also on the
-- finance engine (charge, submission, payment), which keeps the ledger.
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('week', 'monthly')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'RWF',
  payer_phone text CHECK (payer_phone ~ '^\+?[0-9]{9,15}$'),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 100),
  -- the reference as compared: letters and digits only, upper case
  reference_key text NOT NULL CHECK (reference_key ~ '^[A-Z0-9]{4,100}$'),
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submission_id uuid REFERENCES public.finance_submissions(id),
  payment_id uuid REFERENCES public.finance_payments(id),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejection_reason text,
  -- the period a confirmed payment bought
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'confirmed' OR (confirmed_at IS NOT NULL AND period_starts_at IS NOT NULL AND period_ends_at > period_starts_at)),
  CHECK (status <> 'rejected' OR (rejected_at IS NOT NULL AND length(btrim(coalesce(rejection_reason, ''))) >= 3))
);
-- A transaction ID pays for one period, once: it can't be reported again while
-- it's pending or after it's confirmed (only after a rejection)
CREATE UNIQUE INDEX subscription_payments_reference_uq ON public.subscription_payments (reference_key) WHERE status <> 'rejected';
-- one report waiting at a time
CREATE UNIQUE INDEX subscription_payments_one_pending_uq ON public.subscription_payments (subscription_id) WHERE status = 'pending';
CREATE INDEX subscription_payments_status_idx ON public.subscription_payments (status, submitted_at);
CREATE INDEX subscription_payments_user_idx ON public.subscription_payments (user_id, submitted_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own subscription payments" ON public.subscription_payments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Finance staff view subscription payments" ON public.subscription_payments
  FOR SELECT TO authenticated USING (public.finance_can_collect('subscriptions'));
REVOKE ALL ON public.subscription_payments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_payments TO authenticated, service_role;

CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ============== GUARDS ==============
-- Subscription dates, plan and status change only inside the functions below,
-- which switch isoko.subscription_internal on for their own transaction.
CREATE OR REPLACE FUNCTION public.subscription_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('isoko.subscription_internal', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Subscriptions are created by signing in (start_trial)';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.plan IS DISTINCT FROM OLD.plan OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Subscriptions change only through a confirmed payment (subscription_confirm_payment)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_guard BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_guard();

CREATE OR REPLACE FUNCTION public.subscription_payment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('isoko.subscription_internal', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Payment reports change only through their functions';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status <> 'pending' OR NEW.amount <> OLD.amount OR NEW.plan <> OLD.plan
      OR NEW.reference_key <> OLD.reference_key OR NEW.user_id <> OLD.user_id OR NEW.subscription_id <> OLD.subscription_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This payment was already ' || OLD.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_payment_guard BEFORE INSERT OR UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.subscription_payment_guard();

-- The generic finance screens (finance_verify_submission / _reject_submission)
-- must not settle a subscription report behind the subscription's back: those
-- go through subscription_confirm_payment / subscription_reject_payment.
CREATE OR REPLACE FUNCTION public.subscription_submission_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('isoko.subscription_internal', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM public.finance_accounts WHERE id = NEW.account_id AND entity_table = 'subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Confirm or reject subscription payments from the subscription payments list';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_submission_guard BEFORE UPDATE OF status ON public.finance_submissions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_submission_guard();

-- ============== WHO HAS ACCESS ==============
-- The one rule. Admins always; otherwise the person's subscription must be in
-- a running trial or a running paid period. Pending and rejected payment
-- reports give nothing.
CREATE OR REPLACE FUNCTION public.has_active_access(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (public.has_role(_user, 'admin') OR coalesce((
    SELECT (s.status = 'trial' AND s.trial_expires_at > now())
        OR (s.status = 'active' AND s.expires_at > now())
    FROM public.subscriptions s
    WHERE s.user_id = _user
    ORDER BY s.created_at DESC LIMIT 1
  ), false));
$$;
-- the signed-in person
CREATE OR REPLACE FUNCTION public.has_active_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_active_access(auth.uid());
$$;
-- the older name, used by the library and entertainment storage policy
CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_active_access(auth.uid());
$$;

-- Member tables refuse new rows (and product edits) from accounts without
-- access. Staff functions, drivers' updates and the service role are unaffected.
CREATE OR REPLACE FUNCTION public.require_active_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() IN ('anon', 'authenticated') AND NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Your access has ended. Pay for a subscription to continue.', HINT = 'subscription_required';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cart_items', 'orders', 'logistics_requests', 'packaging_requests',
                           'support_requests', 'seller_applications'] LOOP
    EXECUTE format('CREATE TRIGGER require_active_access BEFORE INSERT ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.require_active_access()', t);
  END LOOP;
END $$;
-- sellers list and edit their products only while their access runs (stock
-- moved by a buyer's order or cancellation is not the seller editing)
CREATE OR REPLACE FUNCTION public.require_seller_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() IN ('anon', 'authenticated') AND auth.uid() = NEW.seller_id
     AND NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Your access has ended. Pay for a subscription to continue selling.', HINT = 'subscription_required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_active_access BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.require_seller_access();
-- cart edits too
CREATE TRIGGER require_active_access_update BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.require_active_access();

-- ============== HELPERS ==============
CREATE OR REPLACE FUNCTION public.subscription_reference_key(_reference text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(regexp_replace(coalesce(_reference, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Has this subscription ever had a paid period? Then the next one is monthly.
CREATE OR REPLACE FUNCTION public.subscription_paid_before(_subscription uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscription_payments WHERE subscription_id = _subscription AND status = 'confirmed')
      OR EXISTS (SELECT 1 FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id
                 WHERE a.entity_table = 'subscriptions' AND a.entity_id = _subscription AND p.status = 'successful');
$$;

CREATE OR REPLACE FUNCTION public.subscription_next_plan(_subscription uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _subscription IS NOT NULL AND public.subscription_paid_before(_subscription) THEN 'monthly' ELSE 'week' END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_plan_price(_plan text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _plan WHEN 'week' THEN public.setting_number('subscription_first_week_price', 50)
                    ELSE public.setting_number('subscription_monthly_price', 200) END;
$$;

-- What the customer must pay now: what is still owed on the subscription (a
-- rejected report leaves its charge open), or else the next plan's price
CREATE OR REPLACE FUNCTION public.subscription_amount_due(_subscription uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN coalesce((public.finance_totals_for('subscriptions', _subscription) ->> 'balance')::numeric, 0) > 0
              THEN (public.finance_totals_for('subscriptions', _subscription) ->> 'balance')::numeric
              ELSE public.subscription_plan_price(public.subscription_next_plan(_subscription)) END;
$$;

-- The end of a period that starts at _start
CREATE OR REPLACE FUNCTION public.subscription_period_end(_plan text, _start timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _plan
    WHEN 'week' THEN _start + make_interval(days => public.setting_number('subscription_first_period_days', 7)::int)
    ELSE _start + make_interval(months => public.setting_number('subscription_period_months', 1)::int) END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_internal(_on boolean)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  SELECT set_config('isoko.subscription_internal', CASE WHEN _on THEN 'on' ELSE '' END, true);
$$;

-- ============== NOTIFICATIONS ==============
INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  ('TRIAL_STARTED', 'A new account''s free trial started', ARRAY['in_app', 'email'], 'info'),
  ('TRIAL_ENDING_SOON', 'The free trial ends in about 2 minutes', ARRAY['in_app', 'email'], 'warning'),
  ('TRIAL_EXPIRED', 'The free trial ended', ARRAY['in_app', 'email'], 'warning'),
  ('SUBSCRIPTION_PAYMENT_PENDING', 'A subscription payment was reported and awaits confirmation', ARRAY['in_app', 'email'], 'info'),
  ('SUBSCRIPTION_PAYMENT_REJECTED', 'A reported subscription payment was not confirmed', ARRAY['in_app', 'email'], 'error'),
  ('SUBSCRIPTION_WEEK_ACTIVATED', 'The 50 RWF payment was confirmed: 7-day access started', ARRAY['in_app', 'email'], 'success'),
  ('SUBSCRIPTION_WEEK_ENDING', 'The 7-day access ends soon (24 hours, 1 hour)', ARRAY['in_app', 'email'], 'warning'),
  ('SUBSCRIPTION_WEEK_EXPIRED', 'The 7-day access ended', ARRAY['in_app', 'email'], 'warning'),
  ('SUBSCRIPTION_MONTH_ACTIVATED', 'The monthly payment was confirmed: a month of access started', ARRAY['in_app', 'email'], 'success'),
  ('SUBSCRIPTION_MONTH_ENDING', 'The monthly subscription ends soon (24 hours, 1 hour)', ARRAY['in_app', 'email'], 'warning'),
  ('SUBSCRIPTION_MONTH_EXPIRED', 'The monthly subscription ended', ARRAY['in_app', 'email'], 'warning')
ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('TRIAL_STARTED', '*', 'Your free trial has started',
   'Hello {{name}}, your {{minutes}}-minute free trial of Isoko has started. You have full access until {{until}}. After that, 7 days of full access cost {{price}}. {{link}}'),
  ('TRIAL_ENDING_SOON', '*', 'Your free trial ends in 2 minutes',
   'Your free trial ends in 2 minutes. To keep full access, pay {{price}} to the Isoko Mobile Money code {{momo}} for 7 days, then send us the transaction ID: {{link}}'),
  ('TRIAL_EXPIRED', '*', 'Your free trial has ended',
   'Your free trial has ended. Pay {{price}} to the Isoko Mobile Money code {{momo}} for 7 days of full access, then send us the transaction ID here: {{link}}'),
  ('SUBSCRIPTION_PAYMENT_PENDING', '*', 'Your {{amount}} payment is awaiting confirmation',
   'Your {{amount}} payment is awaiting confirmation (transaction {{reference}}). An Isoko admin will check it against our Mobile Money account; your {{period}} of access starts once it is confirmed. {{link}}'),
  ('SUBSCRIPTION_PAYMENT_REJECTED', '*', 'Your {{amount}} payment was not confirmed',
   'We could not confirm your {{amount}} payment (transaction {{reference}}). Reason: {{reason}}. You can send corrected payment details here: {{link}}'),
  ('SUBSCRIPTION_WEEK_ACTIVATED', '*', '{{amount}} payment confirmed',
   '{{amount}} payment confirmed. Your 7-day full-access subscription is now active until {{until}}. {{link}}'),
  ('SUBSCRIPTION_WEEK_ENDING', '*', 'Your 7-day subscription expires in {{left}}',
   'Your 7-day subscription expires in {{left}} ({{until}}). After it, a month of full access costs {{price}}. {{link}}'),
  ('SUBSCRIPTION_WEEK_EXPIRED', '*', 'Your 7-day access has expired',
   'Your 7-day access has expired. Pay {{price}} to the Isoko Mobile Money code {{momo}} for your first monthly subscription, then send us the transaction ID: {{link}}'),
  ('SUBSCRIPTION_MONTH_ACTIVATED', '*', '{{amount}} payment confirmed',
   '{{amount}} payment confirmed. Your monthly full-access subscription is now active until {{until}}. {{link}}'),
  ('SUBSCRIPTION_MONTH_ENDING', '*', 'Your monthly subscription expires in {{left}}',
   'Your monthly subscription expires in {{left}} ({{until}}). It does not renew by itself: pay {{price}} to the Isoko Mobile Money code {{momo}} to continue. {{link}}'),
  ('SUBSCRIPTION_MONTH_EXPIRED', '*', 'Your subscription has expired',
   'Your subscription has expired. Pay {{price}} to the Isoko Mobile Money code {{momo}} to continue, then send us the transaction ID: {{link}}')
ON CONFLICT (event_type, channel) DO NOTHING;
-- replaced by the plan-specific activation messages
UPDATE public.notification_event_types SET is_active = false WHERE event_type = 'SUBSCRIPTION_ACTIVATED';
DROP TRIGGER IF EXISTS notify_changes ON public.subscriptions;

CREATE OR REPLACE FUNCTION public.subscription_notify(_type text, _key text, _sub public.subscriptions, _data jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(_type, _type || ':' || _sub.id || ':' || _key, 'subscriptions', _sub.id,
    public.notification_customer('subscriptions', _sub.id),
    jsonb_build_object('momo', public.setting_text('company_momo_code', '*182*8*1*871951#'),
                       'price', public.notification_money(public.subscription_amount_due(_sub.id), 'RWF')) || _data);
END $$;

-- The generic finance messages would repeat the subscription's own ones
CREATE OR REPLACE FUNCTION public.notify_payment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts;
  t jsonb;
  v_balance numeric;
  v_data jsonb;
BEGIN
  SELECT * INTO a FROM public.finance_accounts WHERE id = NEW.account_id;
  -- The payment row is written just before its ledger entry, so the balance
  -- comes from the payments themselves: price - discounts - money kept.
  t := public.finance_totals(a.id);
  v_balance := (t ->> 'charged')::numeric - (t ->> 'credits')::numeric - (t ->> 'paid')::numeric;
  v_data := jsonb_build_object('amount', public.notification_money(NEW.amount, NEW.currency), 'label', a.label,
    'balance', public.notification_money(v_balance, a.currency));
  IF NEW.status = 'successful' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'successful') THEN
    -- subscriptions: SUBSCRIPTION_WEEK/MONTH_ACTIVATED says it
    IF a.entity_table <> 'subscriptions' THEN
      PERFORM public.notify_event('PAYMENT_SUCCESSFUL', 'PAYMENT_SUCCESSFUL:' || NEW.id, a.entity_table, a.entity_id,
        public.notification_customer(a.entity_table, a.entity_id), v_data);
    END IF;
    IF a.entity_table = 'orders' AND v_balance <= 0 THEN
      PERFORM public.notify_event('ORDER_PAID', 'ORDER_PAID:' || a.entity_id, 'orders', a.entity_id,
        (SELECT jsonb_build_array(jsonb_build_object('user_id', seller_id, 'link', '/seller')) FROM public.orders WHERE id = a.entity_id),
        jsonb_build_object('amount', public.notification_money(NEW.amount, NEW.currency), 'order', left(a.entity_id::text, 8)));
    END IF;
  ELSIF NEW.status = 'failed' AND TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'failed' THEN
    PERFORM public.notify_event('PAYMENT_FAILED', 'PAYMENT_FAILED:' || NEW.id, a.entity_table, a.entity_id,
      public.notification_customer(a.entity_table, a.entity_id), v_data || jsonb_build_object('reason', coalesce(NEW.failure_reason, 'declined')));
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.refunded_amount > OLD.refunded_amount THEN
    PERFORM public.notify_event('PAYMENT_REFUNDED', 'PAYMENT_REFUNDED:' || NEW.id || ':' || NEW.refunded_amount, a.entity_table, a.entity_id,
      public.notification_customer(a.entity_table, a.entity_id),
      v_data || jsonb_build_object('amount', public.notification_money(NEW.refunded_amount - OLD.refunded_amount, NEW.currency)));
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.notify_submission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts;
  v_data jsonb;
BEGIN
  IF NEW.legacy THEN
    RETURN NULL;
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = NEW.account_id;
  v_data := jsonb_build_object('amount', public.notification_money(NEW.amount, NEW.currency), 'label', a.label, 'reference', NEW.reference);
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.notify_event('PAYMENT_REPORTED', 'PAYMENT_REPORTED:' || NEW.id, a.entity_table, a.entity_id,
      public.notification_staff(a.module, public.notification_staff_link(a.entity_table, a.entity_id)), v_data);
  -- subscriptions: SUBSCRIPTION_PAYMENT_REJECTED says it
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status = 'pending' AND a.entity_table <> 'subscriptions' THEN
    PERFORM public.notify_event('PAYMENT_REPORT_REJECTED', 'PAYMENT_REPORT_REJECTED:' || NEW.id, a.entity_table, a.entity_id,
      public.notification_customer(a.entity_table, a.entity_id), v_data || jsonb_build_object('reason', coalesce(NEW.review_note, '')));
  END IF;
  RETURN NULL;
END $$;

-- ============== THE TRIAL ==============
-- Starts on the first sign-in of a (confirmed) account, once.
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_minutes numeric := public.setting_number('subscription_trial_minutes', 10);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription:' || auth.uid()::text, 0));
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_sub;
  END IF;
  PERFORM public.subscription_internal(true);
  INSERT INTO public.subscriptions (user_id, plan, amount, status, starts_at, expires_at, trial_started_at, trial_expires_at)
  VALUES (auth.uid(), 'trial', 0, 'trial', now(), now() + make_interval(secs => v_minutes * 60),
          now(), now() + make_interval(secs => v_minutes * 60))
  RETURNING * INTO v_sub;
  PERFORM public.subscription_internal(false);
  PERFORM public.subscription_notify('TRIAL_STARTED', 'start', v_sub, jsonb_build_object(
    'minutes', v_minutes::text,
    'until', to_char(v_sub.trial_expires_at AT TIME ZONE 'Africa/Kigali', 'HH24:MI "(Kigali time)"')));
  RETURN v_sub;
END $$;

-- ============== REPORTING A PAYMENT ==============
DROP FUNCTION IF EXISTS public.submit_subscription_payment(text);
CREATE OR REPLACE FUNCTION public.submit_subscription_payment(
  p_amount numeric, p_payer_phone text, p_reference text, p_paid_at timestamptz DEFAULT NULL
) RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  v_plan text;
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

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sign in again to start your trial first';
  END IF;
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

  v_plan := public.subscription_next_plan(v_sub.id);
  a := public.finance_open_account('subscriptions', v_sub.id, 'RWF', v_sub.user_id, 'Subscription');
  -- One period at a time: charge it if nothing is owed yet, at its price
  IF (public.finance_totals(a.id) ->> 'balance')::numeric <= 0 THEN
    PERFORM public.finance_post(a, 'charge', public.subscription_plan_price(v_plan), 'price',
      CASE v_plan WHEN 'week' THEN format('Subscription: 7 days (%s days of full access)', public.setting_number('subscription_first_period_days', 7))
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
  VALUES (v_sub.id, v_sub.user_id, v_plan, v_due, v_phone, v_ref, v_key, p_paid_at, v_submission)
  RETURNING * INTO r;
  -- kept for older screens: "a payment is waiting"
  UPDATE public.subscriptions SET payment_reference = v_ref, payment_submitted_at = now() WHERE id = v_sub.id;
  PERFORM public.subscription_internal(false);

  PERFORM public.subscription_notify('SUBSCRIPTION_PAYMENT_PENDING', r.id::text, v_sub, jsonb_build_object(
    'amount', public.notification_money(r.amount, r.currency), 'reference', r.reference,
    'period', CASE r.plan WHEN 'week' THEN '7 days' ELSE 'month' END));
  RETURN r;
END $$;

-- ============== CONFIRMING AND REJECTING ==============
CREATE OR REPLACE FUNCTION public.subscription_confirm_payment(p_payment_id uuid)
RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.subscription_payments;
  v_sub public.subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_finance_payment uuid;
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can confirm subscription payments';
  END IF;
  SELECT * INTO r FROM public.subscription_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  -- subscription first, then the report: the same order as submitting
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = r.subscription_id FOR UPDATE;
  SELECT * INTO r FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This payment was already ' || r.status;
  END IF;
  IF r.user_id = auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Someone else must confirm your own payment';
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

  PERFORM public.subscription_notify(
    CASE r.plan WHEN 'week' THEN 'SUBSCRIPTION_WEEK_ACTIVATED' ELSE 'SUBSCRIPTION_MONTH_ACTIVATED' END, r.id::text, v_sub,
    jsonb_build_object('amount', public.notification_money(r.amount, r.currency),
                       'until', to_char(v_end AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY HH24:MI "(Kigali time)"')));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.subscription_reject_payment(p_payment_id uuid, p_reason text)
RETURNS public.subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.subscription_payments;
  v_sub public.subscriptions;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can reject subscription payments';
  END IF;
  IF length(v_reason) < 3 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Say why the payment is rejected';
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

  PERFORM public.subscription_internal(true);
  IF r.submission_id IS NOT NULL THEN
    PERFORM public.finance_reject_submission(r.submission_id, v_reason);
  END IF;
  UPDATE public.subscription_payments
  SET status = 'rejected', rejected_by = auth.uid(), rejected_at = clock_timestamp(), rejection_reason = v_reason
  WHERE id = r.id
  RETURNING * INTO r;
  UPDATE public.subscriptions SET payment_reference = NULL, payment_submitted_at = NULL WHERE id = v_sub.id;
  PERFORM public.subscription_internal(false);

  PERFORM public.subscription_notify('SUBSCRIPTION_PAYMENT_REJECTED', r.id::text, v_sub, jsonb_build_object(
    'amount', public.notification_money(r.amount, r.currency), 'reference', r.reference, 'reason', v_reason));
  RETURN r;
END $$;

-- The older admin button: confirms the subscription's waiting payment, if any.
-- It no longer grants time without one.
CREATE OR REPLACE FUNCTION public.activate_subscription(p_subscription_id uuid)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment uuid;
  v_sub public.subscriptions;
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can confirm subscription payments';
  END IF;
  SELECT id INTO v_payment FROM public.subscription_payments
  WHERE subscription_id = p_subscription_id AND status = 'pending';
  IF v_payment IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No payment is waiting for this subscription';
  END IF;
  PERFORM public.subscription_confirm_payment(v_payment);
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  RETURN v_sub;
END $$;

-- For the admin list: reports with the customer's name and e-mail
CREATE OR REPLACE FUNCTION public.subscription_payments_list(p_status text DEFAULT 'pending', p_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid, subscription_id uuid, user_id uuid, customer_name text, customer_email text,
  plan text, amount numeric, currency text, payer_phone text, reference text, paid_at timestamptz,
  status text, submitted_at timestamptz, confirmed_by_name text, confirmed_at timestamptz,
  rejected_by_name text, rejected_at timestamptz, rejection_reason text,
  period_starts_at timestamptz, period_ends_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only admins and finance staff can see subscription payments';
  END IF;
  RETURN QUERY
  SELECT p.id, p.subscription_id, p.user_id, pr.full_name, u.email::text,
         p.plan, p.amount, p.currency, p.payer_phone, p.reference, p.paid_at,
         p.status, p.submitted_at, cb.full_name, p.confirmed_at,
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

-- ============== TIME PASSING ==============
-- Moves one subscription along: reminders, then expiry. Safe to repeat: each
-- message has its own key, and expiry happens once.
CREATE OR REPLACE FUNCTION public.subscription_advance(_sub public.subscriptions)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until text;
  v_kind text := CASE _sub.plan WHEN 'week' THEN 'WEEK' ELSE 'MONTH' END;
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

-- Every minute, from notifications-dispatch (service role)
CREATE OR REPLACE FUNCTION public.subscription_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.subscriptions;
  n integer := 0;
BEGIN
  IF public.audit_actor_role() NOT IN ('service_role', 'system') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the server runs the subscription sweep';
  END IF;
  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE (status = 'trial' AND trial_expires_at <= now() + interval '150 seconds')
       OR (status = 'active' AND expires_at <= now() + interval '24 hours')
    ORDER BY coalesce(trial_expires_at, expires_at)
    LIMIT 1000
    FOR UPDATE SKIP LOCKED
  LOOP
    n := n + public.subscription_advance(s);
  END LOOP;
  RETURN n;
END $$;

-- ============== WHAT THE SITE SEES ==============
-- Also moves the signed-in person's own subscription along, so the in-app
-- messages and the expiry are there as soon as they look, even between sweeps.
DROP FUNCTION IF EXISTS public.subscription_state();
CREATE FUNCTION public.subscription_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_until timestamptz;
  v_status text;
  v_pending public.subscription_payments;
  v_last public.subscription_payments;
  v_next_plan text := 'week';
  v_staff boolean := false;
  v_prices jsonb := jsonb_build_object(
    'trial_minutes', public.setting_number('subscription_trial_minutes', 10),
    'week_price', public.setting_number('subscription_first_week_price', 50),
    'week_days', public.setting_number('subscription_first_period_days', 7),
    'monthly_price', public.setting_number('subscription_monthly_price', 200),
    'monthly_months', public.setting_number('subscription_period_months', 1),
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
    v_next_plan := public.subscription_next_plan(v_sub.id);
  END IF;
  v_staff := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
                     AND role::text IN ('finance', 'travel_staff', 'consultancy_staff', 'data_analyst', 'media_staff', 'driver'));
  RETURN jsonb_build_object(
    'signed_in', true,
    'exempt', public.is_admin(),
    'staff', v_staff,
    'has_access', public.has_active_access(auth.uid()),
    'status', CASE WHEN v_sub.id IS NULL THEN 'none' ELSE v_status END,
    'plan', v_sub.plan,
    'trial_started_at', v_sub.trial_started_at,
    'trial_expires_at', v_sub.trial_expires_at,
    'access_until', CASE WHEN v_status IN ('trial', 'active') THEN v_until END,
    'seconds_left', CASE WHEN v_status IN ('trial', 'active') THEN greatest(0, floor(extract(epoch FROM v_until - now()))) END,
    -- what ended last: 'trial', 'week' or 'monthly'
    'ended', CASE WHEN v_status = 'expired' THEN v_sub.plan END,
    'payment_pending', v_pending.id IS NOT NULL,
    'pending_payment', CASE WHEN v_pending.id IS NOT NULL THEN jsonb_build_object(
      'id', v_pending.id, 'plan', v_pending.plan, 'amount', v_pending.amount, 'reference', v_pending.reference,
      'payer_phone', v_pending.payer_phone, 'paid_at', v_pending.paid_at, 'submitted_at', v_pending.submitted_at) END,
    'last_rejection', CASE WHEN v_last.status = 'rejected' THEN jsonb_build_object(
      'amount', v_last.amount, 'reference', v_last.reference, 'reason', v_last.rejection_reason,
      'rejected_at', v_last.rejected_at) END,
    'next_plan', v_next_plan,
    'next_is_first_week', v_next_plan = 'week',
    'next_price', CASE WHEN v_sub.id IS NULL THEN public.subscription_plan_price('week')
                       ELSE public.subscription_amount_due(v_sub.id) END,
    'next_days', CASE WHEN v_next_plan = 'week' THEN public.setting_number('subscription_first_period_days', 7) END
  ) || v_prices;
END $$;

-- ============== REPORTS FILED BEFORE THIS RELEASE ==============
-- Pending subscription reports from the old form become payment reports the
-- admin list shows (payer number and time unknown).
DO $$
BEGIN
  PERFORM public.subscription_internal(true);
  INSERT INTO public.subscription_payments (subscription_id, user_id, plan, amount, currency, reference, reference_key,
                                            submitted_at, submission_id)
  SELECT sub.id, sub.user_id, public.subscription_next_plan(sub.id), s.amount, s.currency,
         left(s.reference, 100), public.subscription_reference_key(s.reference), s.created_at, s.id
  FROM public.finance_submissions s
  JOIN public.finance_accounts a ON a.id = s.account_id AND a.entity_table = 'subscriptions'
  JOIN public.subscriptions sub ON sub.id = a.entity_id
  WHERE s.status = 'pending' AND NOT s.legacy
    AND length(public.subscription_reference_key(s.reference)) >= 4
  ON CONFLICT DO NOTHING;
  PERFORM public.subscription_internal(false);
END $$;

-- ============== PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.setting_text(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_payment_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_submission_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.require_active_access() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.require_seller_access() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_access() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_reference_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_paid_before(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_next_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_plan_price(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_amount_due(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_period_end(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_internal(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_notify(text, text, public.subscriptions, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_advance(public.subscriptions) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_sweep() TO service_role;
REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(numeric, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(numeric, text, text, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_confirm_payment(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_reject_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_reject_payment(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_payments_list(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_payments_list(text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_state() TO anon, authenticated;

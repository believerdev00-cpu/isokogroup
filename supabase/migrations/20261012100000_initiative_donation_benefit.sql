-- A month of Premium for somebody who gives to the Global Initiative.
--
-- The giving already worked: a donor pays the company directly, submits the
-- transaction reference, and an admin checks it against the real statement.
-- Only a confirmed row is money. What was missing is what the donor gets,
-- and being told anything at all along the way.
--
-- Nothing here collects money, and no payment gateway is enabled. The
-- benefit is granted by the same hand that was already verifying the
-- payment, in the same transaction, so a confirmed donation and its
-- entitlement cannot disagree.
--
-- "$1 One Project" stays the campaign's name. Amounts remain whole Rwandan
-- francs and nothing converts between currencies, because nothing here
-- knows an exchange rate and inventing one would quietly misstate what
-- somebody gave.

-- ============== WHAT THE DONOR WANTED TO SAY ==============
-- Kept for the office, not for the website. A remark can carry a name, a
-- grievance or a phone number, and the public pages show no donor detail at
-- all; this changes nothing about that.
ALTER TABLE public.initiative_donations
  ADD COLUMN donor_note text CHECK (donor_note IS NULL OR length(donor_note) <= 2000);

COMMENT ON COLUMN public.initiative_donations.donor_note IS
  'The donor''s own comment or recommendation. Office-only: never shown publicly.';

-- ============== A PLAN THAT IS A GIFT, NOT A PURCHASE ==============
-- The smallest change that can represent this: one more value in the check.
--
-- Reusing 'monthly' was the alternative and is worse, because then nothing
-- distinguishes a gift from a purchase -- not the row, not the receipt, not
-- the audit log. Keeping it separate is also what stops the benefit turning
-- into a renewing paid subscription by accident: nothing renews it, and the
-- donor's next real payment sets the plan back through
-- subscription_confirm_payment, which writes plan = the payment's plan.
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_plan_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('trial', 'week', 'monthly', 'seller', 'donation'));

-- ============== THE ENTITLEMENT ITSELF ==============
-- One benefit per donation, which is the idempotency: a second confirmation,
-- a retry or a duplicate callback all collide on donation_id and write
-- nothing. The row is the record of where a month of access came from.
CREATE TABLE public.initiative_donation_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL UNIQUE REFERENCES public.initiative_donations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX initiative_benefits_user ON public.initiative_donation_benefits (user_id, expires_at DESC);
CREATE INDEX initiative_benefits_expiry ON public.initiative_donation_benefits (expires_at) WHERE status = 'active';

ALTER TABLE public.initiative_donation_benefits ENABLE ROW LEVEL SECURITY;

-- A donor may see what their own gift earned them; the office sees all of
-- them. Nobody writes one from outside: the only INSERT is in the trigger
-- below, which runs as its owner.
CREATE POLICY "Donors read their own benefit" ON public.initiative_donation_benefits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.initiative_donation_benefits FROM anon, authenticated;

-- ============== HOW LONG, AND FROM WHEN ==============
/** Thirty days, after whatever the donor has already paid for. */
CREATE OR REPLACE FUNCTION public.initiative_benefit_days() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

-- ============== GRANTING IT ==============
-- Fires in the same transaction as the confirmation, so the two cannot end
-- up disagreeing: if the grant raises, the confirmation rolls back with it.
--
-- Only pending -> confirmed reaches here. A rejection changes the status to
-- 'rejected' and is ignored, and initiative_guard_donation_review() already
-- refuses to review anything twice, so a second confirmation never gets this
-- far -- the ON CONFLICT below is the second lock on the same door.
CREATE OR REPLACE FUNCTION public.initiative_donation_benefit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_benefit public.initiative_donation_benefits;
  v_email text;
  v_name text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = NEW.user_id FOR UPDATE;

  -- A paid period still running is finished first, exactly as a purchased
  -- renewal is: a gift must never shorten access somebody already bought.
  v_start := CASE
    WHEN v_sub.id IS NOT NULL AND v_sub.status = 'active' AND v_sub.expires_at > now() THEN v_sub.expires_at
    ELSE now()
  END;
  v_end := v_start + make_interval(days => public.initiative_benefit_days());

  INSERT INTO public.initiative_donation_benefits (donation_id, user_id, starts_at, expires_at)
  VALUES (NEW.id, NEW.user_id, v_start, v_end)
  ON CONFLICT (donation_id) DO NOTHING
  RETURNING * INTO v_benefit;

  IF v_benefit.id IS NULL THEN
    RETURN NEW;  -- already granted: a retry earns no second month
  END IF;

  PERFORM set_config('isoko.audit_reason',
    format('Global Initiative donation %s confirmed: %s days of access', NEW.id, public.initiative_benefit_days()), true);

  PERFORM public.subscription_internal(true);
  IF v_sub.id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, plan, amount, status, starts_at, expires_at)
    VALUES (NEW.user_id, 'donation', 0, 'active', v_start, v_end);
  ELSE
    UPDATE public.subscriptions
       SET status = 'active',
           -- A paid plan keeps its name while its own period is still
           -- running; the gift only extends it. Otherwise this is a gift.
           plan = CASE WHEN v_sub.status = 'active' AND v_sub.expires_at > now() THEN v_sub.plan ELSE 'donation' END,
           starts_at = LEAST(coalesce(v_sub.starts_at, v_start), v_start),
           expires_at = v_end
     WHERE id = v_sub.id;
  END IF;
  PERFORM public.subscription_internal(false);

  SELECT lower(u.email::text), nullif(p.full_name, '')
    INTO v_email, v_name
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
   WHERE u.id = NEW.user_id;

  PERFORM public.notify_event(
    'INITIATIVE_DONATION_CONFIRMED',
    'initiative-donation-confirmed-' || NEW.id::text,
    'initiative_donations', NEW.id,
    jsonb_build_array(jsonb_build_object(
      'user_id', NEW.user_id,
      'email', coalesce(nullif(NEW.donor_email, ''), v_email),
      'name', coalesce(nullif(NEW.donor_name, ''), v_name),
      'link', '/global-initiative')),
    jsonb_build_object(
      'amount', public.notification_money(NEW.amount, 'RWF'),
      'days', public.initiative_benefit_days()::text,
      'starts', to_char(v_start AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY'),
      'expires', to_char(v_end AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY'),
      'renewal', public.notification_money(
        (SELECT coalesce((value)::numeric, 200) FROM public.platform_settings WHERE key = 'subscription_monthly_price'), 'RWF')));

  RETURN NEW;
END $$;

CREATE TRIGGER initiative_donation_benefit
  AFTER UPDATE OF status ON public.initiative_donations
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.initiative_donation_benefit();

-- ============== TELLING THE DONOR IT ARRIVED ==============
-- Raised when the claim is submitted, and careful about its tense: a
-- donation nobody has checked yet has not been received, and saying so
-- would be the site confirming its own payments.
CREATE OR REPLACE FUNCTION public.initiative_donation_received()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_name text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT lower(u.email::text), nullif(p.full_name, '')
    INTO v_email, v_name
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id WHERE u.id = NEW.user_id;

  PERFORM public.notify_event(
    'INITIATIVE_DONATION_RECEIVED',
    'initiative-donation-received-' || NEW.id::text,
    'initiative_donations', NEW.id,
    jsonb_build_array(jsonb_build_object(
      'user_id', NEW.user_id,
      'email', coalesce(nullif(NEW.donor_email, ''), v_email),
      'name', coalesce(nullif(NEW.donor_name, ''), v_name),
      'link', '/global-initiative')),
    jsonb_build_object(
      'amount', public.notification_money(NEW.amount, 'RWF'),
      'days', public.initiative_benefit_days()::text));
  RETURN NEW;
END $$;

CREATE TRIGGER initiative_donation_received
  AFTER INSERT ON public.initiative_donations
  FOR EACH ROW EXECUTE FUNCTION public.initiative_donation_received();

-- ============== BEFORE IT ENDS, AND WHEN IT HAS ==============
-- Run by pg_cron. Both events key on the benefit, and event_key is unique,
-- so each one can be raised exactly once however often this runs -- which is
-- also what makes the hourly schedule safe.
--
-- Times are absolute and the dates in the message are written in Kigali
-- time, so a donor reading in another time zone sees the same date Isoko
-- means rather than one shifted by their own clock.
CREATE OR REPLACE FUNCTION public.initiative_benefit_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; n integer := 0; v_renewal text;
BEGIN
  SELECT public.notification_money(
    (SELECT coalesce((value)::numeric, 200) FROM public.platform_settings WHERE key = 'subscription_monthly_price'), 'RWF')
  INTO v_renewal;

  -- Ending within three days, and not already over.
  FOR b IN
    SELECT * FROM public.initiative_donation_benefits
     WHERE status = 'active' AND expires_at > now() AND expires_at <= now() + interval '3 days'
  LOOP
    PERFORM public.notify_event(
      'INITIATIVE_BENEFIT_ENDING', 'initiative-benefit-ending-' || b.id::text,
      'initiative_donation_benefits', b.id,
      jsonb_build_array(jsonb_build_object('user_id', b.user_id, 'link', '/subscription')),
      jsonb_build_object('expires', to_char(b.expires_at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY'), 'renewal', v_renewal));
    n := n + 1;
  END LOOP;

  -- Over. The row is closed here, which is also why this cannot loop.
  FOR b IN
    SELECT * FROM public.initiative_donation_benefits WHERE status = 'active' AND expires_at <= now()
  LOOP
    UPDATE public.initiative_donation_benefits SET status = 'expired' WHERE id = b.id;
    PERFORM public.notify_event(
      'INITIATIVE_BENEFIT_ENDED', 'initiative-benefit-ended-' || b.id::text,
      'initiative_donation_benefits', b.id,
      jsonb_build_array(jsonb_build_object('user_id', b.user_id, 'link', '/subscription')),
      jsonb_build_object('renewal', v_renewal));
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.initiative_benefit_reminders() FROM PUBLIC, anon, authenticated;

-- Scheduled only where pg_cron exists. Production has it (it already runs
-- notifications-dispatch every minute); staging does not, and a migration
-- that only applies to one of them is a migration that has not been tested.
-- Where there is no cron the function is still there and still correct --
-- it simply waits for something to call it.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('initiative-benefit-reminders')
      FROM cron.job WHERE jobname = 'initiative-benefit-reminders';
    PERFORM cron.schedule('initiative-benefit-reminders', '7 * * * *',
      'SELECT public.initiative_benefit_reminders()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: initiative_benefit_reminders() is not scheduled';
  END IF;
END
$cron$;

-- ============== WHAT THE MESSAGES SAY ==============
INSERT INTO public.notification_event_types (event_type, description, channels, tone, is_active) VALUES
  ('INITIATIVE_DONATION_RECEIVED',  'A donation claim was submitted and is awaiting verification', ARRAY['email','in_app'], 'success', true),
  ('INITIATIVE_DONATION_CONFIRMED', 'A donation was verified and the month of access granted',     ARRAY['email','in_app'], 'success', true),
  ('INITIATIVE_BENEFIT_ENDING',     'A donation-funded month is about to end',                     ARRAY['email','in_app'], 'warning', true),
  ('INITIATIVE_BENEFIT_ENDED',      'A donation-funded month has ended',                           ARRAY['email','in_app'], 'warning', true);

INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('INITIATIVE_DONATION_RECEIVED', '*',
   'We have your donation of {{amount}}',
   'Hello {{name}}, thank you for supporting the ISOKO Global Initiative. ' ||
   'We have received your request to donate {{amount}} and it is waiting for Isoko to check the payment against our records. ' ||
   'This is not yet a confirmation that the money has reached us. ' ||
   'Once it is verified, your {{days}} days of Premium access begin and we will write to you again. {{link}}'),

  ('INITIATIVE_DONATION_CONFIRMED', '*',
   'Your donation is confirmed, and your Premium month has started',
   'Hello {{name}}, your donation of {{amount}} to the ISOKO Global Initiative has been verified by Isoko. Thank you. ' ||
   'Your {{days}} days of Premium access run from {{starts}} to {{expires}} (Kigali time). ' ||
   'After {{expires}} the benefit simply ends -- nothing renews on its own and nothing is charged. ' ||
   'To carry on, subscribe for {{renewal}} a month in the usual way. {{link}}'),

  ('INITIATIVE_BENEFIT_ENDING', '*',
   'Your Premium month ends on {{expires}}',
   'Hello {{name}}, the Premium access that came with your donation to the ISOKO Global Initiative ends on {{expires}} (Kigali time). ' ||
   'Nothing will be charged and nothing renews automatically. ' ||
   'To keep your access, subscribe for {{renewal}} a month. {{link}}'),

  ('INITIATIVE_BENEFIT_ENDED', '*',
   'Your donation-funded Premium month has ended',
   'Hello {{name}}, the Premium access that came with your donation to the ISOKO Global Initiative has now ended. ' ||
   'Thank you again for supporting the initiative. ' ||
   'To continue, subscribe for {{renewal}} a month in the usual way. {{link}}');

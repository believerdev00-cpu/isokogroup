-- One notification engine for the whole platform
--
-- Before: messages were inserted inline by five database functions and four
-- screens (the screens' messages to other people were silently refused by
-- row-level security, so drivers' and sellers' updates never reached
-- customers), there was only in-app delivery, and customers who use a private
-- link (Travel, Consultancy, Data Analysis) heard nothing at all.
--
-- Now business events are raised in one place, by database triggers on the
-- records themselves, so they fire whichever screen or function made the
-- change:
--
--   business event --notify_event()--> notification_events (once per event key)
--        --> in-app: public.notifications (shown in the bell, realtime)
--        --> email / WhatsApp / SMS: notification_deliveries, sent by the
--            notifications-dispatch Edge Function with retries
--
-- An event key (e.g. PAYMENT_SUCCESSFUL:<payment id>) can only be raised once,
-- and each recipient gets each channel once, so an event processed twice never
-- sends twice. Templates live in notification_templates; which channels an
-- event uses lives in notification_event_types. People can switch channels off
-- (notification_preferences); link customers can be opted out by address.
-- Email, WhatsApp and SMS are only sent when a provider is configured for the
-- Edge Function; otherwise deliveries are marked skipped, never "sent".

-- ============== SETTINGS ==============
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,60}$'),
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- The public address of the website, used for links in emails and messages,
-- e.g. https://isokogroup.com (no trailing slash). Set it after deploying.
INSERT INTO public.platform_settings (key, value) VALUES ('site_url', '');

-- ============== EVENT TYPES AND TEMPLATES ==============
CREATE TABLE public.notification_event_types (
  event_type text PRIMARY KEY CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  description text NOT NULL,
  channels text[] NOT NULL CHECK (channels <@ ARRAY['in_app', 'email', 'whatsapp', 'sms']),
  tone text NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'success', 'warning', 'error')),
  is_active boolean NOT NULL DEFAULT true
);

-- channel '*' is the default; a channel-specific row (e.g. a short 'sms') wins
CREATE TABLE public.notification_templates (
  event_type text NOT NULL REFERENCES public.notification_event_types(event_type) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT '*' CHECK (channel IN ('*', 'in_app', 'email', 'whatsapp', 'sms')),
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_type, channel)
);

ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage event types" ON public.notification_event_types FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage templates" ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  -- payments (customers)
  ('PAYMENT_SUCCESSFUL', 'A payment was received', ARRAY['in_app', 'email', 'whatsapp', 'sms'], 'success'),
  ('PAYMENT_FAILED', 'A provider payment failed', ARRAY['in_app', 'email', 'whatsapp'], 'error'),
  ('PAYMENT_REFUNDED', 'Money was refunded', ARRAY['in_app', 'email', 'whatsapp'], 'info'),
  ('PAYMENT_REPORT_REJECTED', 'A reported payment could not be found', ARRAY['in_app', 'email', 'whatsapp'], 'warning'),
  -- staff
  ('PAYMENT_REPORTED', 'Staff: a customer reported a payment to check', ARRAY['in_app'], 'warning'),
  ('NEW_REQUEST', 'Staff: a new customer request', ARRAY['in_app'], 'info'),
  ('DOCUMENT_UPLOADED', 'Staff: a customer uploaded a document', ARRAY['in_app'], 'info'),
  ('CHANGES_REQUESTED', 'Staff: a customer asked for changes', ARRAY['in_app'], 'warning'),
  ('PROPOSAL_ACCEPTED', 'Staff: a customer accepted a proposal or quote', ARRAY['in_app'], 'success'),
  ('SUPPORT_REQUEST_CREATED', 'Staff: a business client asked for help', ARRAY['in_app'], 'warning'),
  -- travel
  ('TRIP_REQUESTED', 'Trip request received', ARRAY['in_app', 'email', 'whatsapp'], 'info'),
  ('TRIP_QUOTE_READY', 'The trip quote is ready', ARRAY['in_app', 'email', 'whatsapp', 'sms'], 'info'),
  ('TRIP_CONFIRMED', 'The trip is confirmed', ARRAY['in_app', 'email', 'whatsapp'], 'success'),
  ('TRIP_CHANGED', 'The price of a confirmed trip changed', ARRAY['in_app', 'email', 'whatsapp'], 'warning'),
  ('TRIP_CANCELLED', 'The trip was cancelled', ARRAY['in_app', 'email', 'whatsapp'], 'warning'),
  -- consultancy and data analysis
  ('CONSULTANCY_REQUEST_CREATED', 'Consultancy request received', ARRAY['in_app', 'email', 'whatsapp'], 'info'),
  ('CONSULTANCY_PROPOSAL_READY', 'The consultancy proposal is ready', ARRAY['in_app', 'email', 'whatsapp', 'sms'], 'info'),
  ('DATA_ANALYSIS_REQUEST_CREATED', 'Data analysis request received', ARRAY['in_app', 'email', 'whatsapp'], 'info'),
  ('DATA_ANALYSIS_READY', 'Data analysis results are ready for review', ARRAY['in_app', 'email', 'whatsapp', 'sms'], 'success'),
  -- marketplace
  ('ORDER_PLACED', 'Order placed (buyer)', ARRAY['in_app', 'email'], 'info'),
  ('ORDER_RECEIVED', 'New order (seller)', ARRAY['in_app', 'email'], 'info'),
  ('ORDER_PAID', 'Order paid, ready to ship (seller)', ARRAY['in_app', 'email', 'whatsapp'], 'success'),
  ('ORDER_SHIPPED', 'Order shipped (buyer)', ARRAY['in_app', 'email', 'whatsapp', 'sms'], 'info'),
  ('ORDER_DELIVERED', 'Buyer confirmed delivery (seller)', ARRAY['in_app', 'email'], 'success'),
  ('ORDER_CANCELLED', 'Order cancelled (buyer)', ARRAY['in_app', 'email'], 'warning'),
  ('SHIPMENT_UPDATED', 'Shipment tracking update (buyer)', ARRAY['in_app'], 'info'),
  ('PAYOUT_PAID', 'Payout sent (seller)', ARRAY['in_app', 'email', 'whatsapp'], 'success'),
  ('PAYOUT_REJECTED', 'Payout request rejected (seller)', ARRAY['in_app', 'email'], 'warning'),
  ('SELLER_APPROVED', 'Seller application approved', ARRAY['in_app', 'email'], 'success'),
  ('SELLER_REJECTED', 'Seller application rejected', ARRAY['in_app', 'email'], 'warning'),
  -- logistics
  ('DELIVERY_DRIVER_ASSIGNED', 'A driver was assigned (customer)', ARRAY['in_app', 'email', 'whatsapp'], 'info'),
  ('DELIVERY_JOB_ASSIGNED', 'A delivery was assigned (driver)', ARRAY['in_app', 'whatsapp'], 'info'),
  ('DELIVERY_UPDATED', 'Delivery status changed (customer)', ARRAY['in_app'], 'info'),
  ('DELIVERY_COMPLETED', 'Delivery completed (customer)', ARRAY['in_app', 'email', 'whatsapp'], 'success'),
  ('PACKAGING_UPDATED', 'Packaging request status changed (customer)', ARRAY['in_app', 'email'], 'info'),
  -- subscriptions and insights
  ('SUBSCRIPTION_ACTIVATED', 'Subscription active', ARRAY['in_app', 'email'], 'success'),
  ('INSIGHT_READY', 'A business insight report is ready', ARRAY['in_app', 'email'], 'info'),
  ('RECOMMENDATION_READY', 'A new business recommendation', ARRAY['in_app'], 'success');

INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('PAYMENT_SUCCESSFUL', '*', 'Payment received: {{amount}}', 'Hello {{name}}, we received your payment of {{amount}} for {{label}}. Balance: {{balance}}. {{link}}'),
  ('PAYMENT_SUCCESSFUL', 'sms', 'Payment received', 'Isoko: payment of {{amount}} received for {{label}}. Balance {{balance}}.'),
  ('PAYMENT_FAILED', '*', 'Payment failed', 'Hello {{name}}, your payment of {{amount}} for {{label}} did not go through ({{reason}}). Please try again. {{link}}'),
  ('PAYMENT_REFUNDED', '*', 'Refund: {{amount}}', 'Hello {{name}}, Isoko refunded {{amount}} for {{label}}. {{link}}'),
  ('PAYMENT_REPORT_REJECTED', '*', 'We could not find your payment', 'Hello {{name}}, we could not confirm the payment you reported ({{reference}}, {{amount}}) for {{label}}: {{reason}}. Please check it or contact us. {{link}}'),
  ('PAYMENT_REPORTED', '*', 'Payment to check: {{amount}}', '{{label}} reported a payment of {{amount}} (ref {{reference}}). Confirm it once the money has arrived.'),
  ('NEW_REQUEST', '*', 'New {{service}} request', '{{label}}'),
  ('DOCUMENT_UPLOADED', '*', 'Document received', '{{label}}: {{document}}'),
  ('CHANGES_REQUESTED', '*', 'Changes requested', '{{label}}: {{message}}'),
  ('PROPOSAL_ACCEPTED', '*', 'Accepted: {{label}}', 'The customer accepted. You can start.'),
  ('SUPPORT_REQUEST_CREATED', '*', 'New support request', 'A business client asked for {{kind}} help.'),
  ('TRIP_REQUESTED', '*', 'We received your trip request ({{reference}})', 'Hello {{name}}, thank you! We are planning your trip and will send you a quote. Follow it here: {{link}}'),
  ('TRIP_QUOTE_READY', '*', 'Your trip quote is ready ({{reference}})', 'Hello {{name}}, your trip plan and quote ({{amount}}) are ready. Review and accept it here: {{link}}'),
  ('TRIP_QUOTE_READY', 'sms', 'Trip quote ready', 'Isoko: your trip quote ({{amount}}) is ready: {{link}}'),
  ('TRIP_CONFIRMED', '*', 'Your trip is confirmed ({{reference}})', 'Hello {{name}}, your trip is confirmed. Total {{amount}}. Details and payment: {{link}}'),
  ('TRIP_CHANGED', '*', 'Your trip price changed ({{reference}})', 'Hello {{name}}, the total for your trip is now {{amount}}. Details: {{link}}'),
  ('TRIP_CANCELLED', '*', 'Your trip was cancelled ({{reference}})', 'Hello {{name}}, your trip {{reference}} was cancelled. Contact us with any questions. {{link}}'),
  ('CONSULTANCY_REQUEST_CREATED', '*', 'We received your request ({{reference}})', 'Hello {{name}}, thank you for your {{service}} request. A consultant will contact you. Follow it here: {{link}}'),
  ('CONSULTANCY_PROPOSAL_READY', '*', 'Your proposal is ready ({{reference}})', 'Hello {{name}}, your proposal ({{amount}}) is ready. Review it here: {{link}}'),
  ('CONSULTANCY_PROPOSAL_READY', 'sms', 'Proposal ready', 'Isoko: your proposal ({{amount}}) is ready: {{link}}'),
  ('DATA_ANALYSIS_REQUEST_CREATED', '*', 'We received your project ({{reference}})', 'Hello {{name}}, thank you for your {{service}} request. Upload your data and follow the project here: {{link}}'),
  ('DATA_ANALYSIS_READY', '*', 'Your results are ready ({{reference}})', 'Hello {{name}}, your results are ready for your review: {{link}}'),
  ('DATA_ANALYSIS_READY', 'sms', 'Results ready', 'Isoko: your data analysis results are ready: {{link}}'),
  ('ORDER_PLACED', '*', 'Order placed: {{amount}}', 'Your order of {{amount}} was submitted. We will confirm your payment shortly. {{link}}'),
  ('ORDER_RECEIVED', '*', 'New order: {{amount}}', 'You have a new order (#{{order}}) of {{amount}}. Wait for Isoko to confirm the payment before shipping. {{link}}'),
  ('ORDER_PAID', '*', 'Order #{{order}} paid: please ship', 'The buyer''s payment of {{amount}} for order #{{order}} is confirmed. Please prepare and ship it. {{link}}'),
  ('ORDER_SHIPPED', '*', 'Your order is on its way', 'Order #{{order}} has shipped. Confirm delivery when it arrives: {{link}}'),
  ('ORDER_SHIPPED', 'sms', 'Order shipped', 'Isoko: order #{{order}} has shipped.'),
  ('ORDER_DELIVERED', '*', 'Delivery confirmed: #{{order}}', 'The buyer confirmed delivery of order #{{order}}. You can now request your payout. {{link}}'),
  ('ORDER_CANCELLED', '*', 'Order #{{order}} cancelled', 'Your order #{{order}} was cancelled. {{link}}'),
  ('SHIPMENT_UPDATED', '*', 'Order #{{order}}: {{status}}', 'Tracking {{tracking}}'),
  ('PAYOUT_PAID', '*', 'Payout sent: {{amount}}', 'Your payout of {{amount}} was sent to your {{method}}. {{link}}'),
  ('PAYOUT_REJECTED', '*', 'Payout request rejected', 'Your payout request was rejected. {{note}} {{link}}'),
  ('SELLER_APPROVED', '*', 'Seller account approved', 'You can now list products on the Isoko marketplace. {{link}}'),
  ('SELLER_REJECTED', '*', 'Seller application not approved', 'Your seller application was not approved. {{note}} {{link}}'),
  ('DELIVERY_DRIVER_ASSIGNED', '*', 'Driver assigned', 'A driver has been assigned to your delivery to {{dropoff}}. {{link}}'),
  ('DELIVERY_JOB_ASSIGNED', '*', 'New delivery assigned', 'Pickup: {{pickup}} → {{dropoff}}. {{link}}'),
  ('DELIVERY_UPDATED', '*', 'Delivery {{status}}', 'Your request to {{dropoff}} has been updated. {{link}}'),
  ('DELIVERY_COMPLETED', '*', 'Your delivery is completed', 'Your delivery to {{dropoff}} was completed. {{link}}'),
  ('PACKAGING_UPDATED', '*', 'Packaging request {{status}}', 'Your packaging request ({{item}}) is now {{status}}. {{link}}'),
  ('SUBSCRIPTION_ACTIVATED', '*', 'Subscription active', 'Your payment was confirmed. You have full access until {{until}}. {{link}}'),
  ('INSIGHT_READY', '*', 'New business insight', '{{title}} {{link}}'),
  ('RECOMMENDATION_READY', '*', 'New recommendation', '{{title}} {{link}}');

-- ============== EVENTS, DELIVERIES, PREFERENCES ==============
CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL REFERENCES public.notification_event_types(event_type),
  -- one event per key: raising it again does nothing
  event_key text NOT NULL UNIQUE,
  entity_table text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_events_entity_idx ON public.notification_events (entity_table, entity_id);

CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.notification_events(id),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_address text,
  -- the user id or the address: each recipient gets each channel once per event
  recipient_key text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, channel, recipient_key)
);
CREATE INDEX notification_deliveries_due_idx ON public.notification_deliveries (next_attempt_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX notification_deliveries_provider_idx ON public.notification_deliveries (provider, provider_message_id);
CREATE TRIGGER notification_deliveries_updated_at BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A signed-in person switches a channel off (in-app stays on)
CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);
-- Link customers (no account) who asked not to be contacted on a channel
CREATE TABLE public.notification_opt_outs (
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, address)
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view events" ON public.notification_events FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins view deliveries" ON public.notification_deliveries FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "People manage their preferences" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage opt-outs" ON public.notification_opt_outs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.notification_events, public.notification_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.notification_events, public.notification_deliveries TO authenticated, service_role;
REVOKE ALL ON public.notification_preferences, public.notification_opt_outs, public.platform_settings,
  public.notification_event_types, public.notification_templates FROM anon;

-- ============== IN-APP NOTIFICATIONS ==============
-- The existing bell keeps working; each row now says which event and record it
-- is about. Only the engine writes them; people only mark them read.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.notification_events(id),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS entity_table text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;
CREATE UNIQUE INDEX notifications_event_user_uq ON public.notifications (event_id, user_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications (user_id) WHERE NOT read;

DROP POLICY IF EXISTS "Self or admin create notifications" ON public.notifications;
CREATE TRIGGER notifications_editable_columns
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns('read');

-- ============== RAISING EVENTS ==============
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
  -- placeholders without a value disappear, then tidy the spacing
  out := regexp_replace(out, '\{\{[a-z_]+\}\}', '', 'g');
  RETURN btrim(regexp_replace(out, '\s{2,}', ' ', 'g'));
END $$;

CREATE OR REPLACE FUNCTION public.notification_money(_amount numeric, _currency text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _amount IS NULL THEN '' ELSE
    regexp_replace(to_char(_amount, 'FM999,999,999,990.00'), '\.00$', '') || ' ' || coalesce(_currency, '') END;
$$;

CREATE OR REPLACE FUNCTION public.site_link(_path text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _path IS NULL OR _path = '' THEN ''
    ELSE coalesce(nullif((SELECT value FROM public.platform_settings WHERE key = 'site_url'), ''), '') || _path END;
$$;

-- Raises a business event. p_recipients: [{user_id?, email?, phone?, name?, link?}]
-- (link is a site path; it is shown in the bell and turned into a full address
-- for email and messages). Returns the event id, or NULL if the key was raised before.
CREATE OR REPLACE FUNCTION public.notify_event(
  p_type text, p_key text, p_entity_table text, p_entity_id uuid, p_recipients jsonb, p_data jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  et public.notification_event_types;
  v_event uuid;
  r jsonb;
  ch text;
  v_user uuid;
  v_email text;
  v_phone text;
  v_name text;
  v_path text;
  v_data jsonb;
  v_subject text;
  v_body text;
  v_address text;
  v_status text;
  v_error text;
  tpl public.notification_templates;
BEGIN
  SELECT * INTO et FROM public.notification_event_types WHERE event_type = p_type AND is_active;
  IF NOT FOUND OR p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' OR jsonb_array_length(p_recipients) = 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notification_events (event_type, event_key, entity_table, entity_id, payload)
  VALUES (p_type, p_key, p_entity_table, p_entity_id, coalesce(p_data, '{}'))
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_event;
  IF v_event IS NULL THEN
    RETURN NULL; -- raised before: nothing is sent twice
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_recipients) LOOP
    v_user := nullif(r ->> 'user_id', '')::uuid;
    v_email := lower(nullif(btrim(coalesce(r ->> 'email', '')), ''));
    v_phone := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
    v_name := nullif(btrim(coalesce(r ->> 'name', '')), '');
    IF v_user IS NOT NULL THEN
      SELECT coalesce(v_email, lower(u.email::text)), coalesce(v_phone, nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g'), '')),
             coalesce(v_name, nullif(p.full_name, ''))
      INTO v_email, v_phone, v_name
      FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id WHERE u.id = v_user;
    END IF;
    v_path := nullif(r ->> 'link', '');
    v_data := coalesce(p_data, '{}') || jsonb_build_object('name', coalesce(v_name, 'there'), 'link', public.site_link(v_path));

    FOREACH ch IN ARRAY et.channels LOOP
      SELECT * INTO tpl FROM public.notification_templates
      WHERE event_type = p_type AND channel IN (ch, '*') ORDER BY channel = '*' LIMIT 1;
      CONTINUE WHEN NOT FOUND;
      v_subject := public.notification_render(tpl.subject, v_data);
      v_body := public.notification_render(tpl.body, v_data);

      IF ch = 'in_app' THEN
        CONTINUE WHEN v_user IS NULL;
        -- in the bell the link is the page itself, not the full address
        v_body := public.notification_render(tpl.body, v_data || jsonb_build_object('link', ''));
        INSERT INTO public.notifications (user_id, title, body, type, link, event_id, event_type, entity_table, entity_id)
        VALUES (v_user, left(v_subject, 200), left(v_body, 1000), et.tone, v_path, v_event, p_type, p_entity_table, p_entity_id)
        ON CONFLICT DO NOTHING;
        INSERT INTO public.notification_deliveries (event_id, channel, recipient_user_id, recipient_key, recipient_name,
          subject, body, status, provider, attempts, sent_at)
        VALUES (v_event, ch, v_user, v_user::text, v_name, v_subject, v_body, 'sent', 'in_app', 1, now())
        ON CONFLICT DO NOTHING;
        CONTINUE;
      END IF;

      v_address := CASE ch WHEN 'email' THEN v_email ELSE v_phone END;
      CONTINUE WHEN v_address IS NULL;
      v_status := 'pending';
      v_error := NULL;
      IF (v_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_user AND channel = ch AND NOT enabled))
         OR EXISTS (SELECT 1 FROM public.notification_opt_outs WHERE channel = ch AND address = v_address) THEN
        v_status := 'skipped';
        v_error := 'Turned off by the recipient';
      ELSIF v_path IS NOT NULL AND public.site_link(v_path) NOT LIKE 'http%' THEN
        -- a message with a link needs the site address (platform_settings.site_url)
        v_status := 'skipped';
        v_error := 'site_url is not set';
      END IF;
      INSERT INTO public.notification_deliveries (event_id, channel, recipient_user_id, recipient_address, recipient_key,
        recipient_name, subject, body, status, error)
      VALUES (v_event, ch, v_user, v_address, coalesce(v_user::text, v_address), v_name, v_subject, v_body, v_status, v_error)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN v_event;
END $$;

-- The customer of a billable or requested record, as a notify_event recipient
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
    ELSE r := NULL;
  END CASE;
  RETURN CASE WHEN r IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_strip_nulls(r)) END;
END $$;

-- The staff who handle a service (admins when nobody has the role yet)
CREATE OR REPLACE FUNCTION public.notification_staff(_service text, _link text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH roles AS (
    SELECT CASE _service
      WHEN 'travel' THEN ARRAY['travel_staff']
      WHEN 'consultancy' THEN ARRAY['consultancy_staff']
      WHEN 'data' THEN ARRAY['data_analyst']
      ELSE ARRAY['finance', 'admin'] END AS names
  ), people AS (
    SELECT DISTINCT r.user_id FROM public.user_roles r, roles WHERE r.role::text = ANY (roles.names)
  ), everyone AS (
    SELECT user_id FROM people
    UNION
    SELECT user_id FROM public.user_roles WHERE role = 'admin' AND NOT EXISTS (SELECT 1 FROM people)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'link', _link)), '[]'::jsonb) FROM everyone;
$$;

CREATE OR REPLACE FUNCTION public.notification_staff_link(_table text, _id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _table
    WHEN 'travel_trips' THEN '/staff/travel/trip/' || _id
    WHEN 'consult_requests' THEN '/staff/consultancy'
    WHEN 'data_requests' THEN '/staff/data'
    ELSE '/admin' END;
$$;

-- ============== PAYMENTS ==============
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
    PERFORM public.notify_event('PAYMENT_SUCCESSFUL', 'PAYMENT_SUCCESSFUL:' || NEW.id, a.entity_table, a.entity_id,
      public.notification_customer(a.entity_table, a.entity_id), v_data);
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
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status, refunded_amount ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_change();

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
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    PERFORM public.notify_event('PAYMENT_REPORT_REJECTED', 'PAYMENT_REPORT_REJECTED:' || NEW.id, a.entity_table, a.entity_id,
      public.notification_customer(a.entity_table, a.entity_id), v_data || jsonb_build_object('reason', coalesce(NEW.review_note, '')));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status ON public.finance_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_submission_change();

-- ============== TRAVEL ==============
CREATE OR REPLACE FUNCTION public.notify_trip_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer jsonb := public.notification_customer('travel_trips', NEW.id);
  v_data jsonb := jsonb_build_object('reference', NEW.reference, 'label', NEW.reference || ' · ' || NEW.customer_name,
    'amount', public.notification_money(NEW.quote_total, NEW.currency));
  v_staff jsonb := public.notification_staff('travel', '/staff/travel/trip/' || NEW.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_event('TRIP_REQUESTED', 'TRIP_REQUESTED:' || NEW.id, 'travel_trips', NEW.id, v_customer, v_data);
    PERFORM public.notify_event('NEW_REQUEST', 'NEW_REQUEST:' || NEW.id, 'travel_trips', NEW.id, v_staff,
      v_data || jsonb_build_object('service', 'trip'));
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'quoted' THEN
        PERFORM public.notify_event('TRIP_QUOTE_READY', 'TRIP_QUOTE_READY:' || NEW.id || ':' || coalesce(NEW.quote_sent_at, now()),
          'travel_trips', NEW.id, v_customer, v_data);
      WHEN 'confirmed' THEN
        PERFORM public.notify_event('TRIP_CONFIRMED', 'TRIP_CONFIRMED:' || NEW.id || ':' || coalesce(NEW.accepted_at, now()),
          'travel_trips', NEW.id, v_customer, v_data);
        PERFORM public.notify_event('PROPOSAL_ACCEPTED', 'PROPOSAL_ACCEPTED:' || NEW.id || ':' || coalesce(NEW.accepted_at, now()),
          'travel_trips', NEW.id, v_staff, v_data);
      WHEN 'changes_requested' THEN
        PERFORM public.notify_event('CHANGES_REQUESTED', 'CHANGES_REQUESTED:' || NEW.id || ':' || coalesce(NEW.change_requested_at, now()),
          'travel_trips', NEW.id, v_staff, v_data || jsonb_build_object('message', left(coalesce(NEW.change_request, ''), 300)));
      WHEN 'cancelled' THEN
        PERFORM public.notify_event('TRIP_CANCELLED', 'TRIP_CANCELLED:' || NEW.id, 'travel_trips', NEW.id, v_customer, v_data);
      ELSE NULL;
    END CASE;
  ELSIF NEW.status = 'confirmed' AND NEW.quote_total IS DISTINCT FROM OLD.quote_total THEN
    PERFORM public.notify_event('TRIP_CHANGED', 'TRIP_CHANGED:' || NEW.id || ':' || coalesce(NEW.quote_total, 0) || ':' || now(),
      'travel_trips', NEW.id, v_customer, v_data);
  ELSIF NEW.change_requested_at IS DISTINCT FROM OLD.change_requested_at AND NEW.change_request IS NOT NULL THEN
    PERFORM public.notify_event('CHANGES_REQUESTED', 'CHANGES_REQUESTED:' || NEW.id || ':' || NEW.change_requested_at,
      'travel_trips', NEW.id, v_staff, v_data || jsonb_build_object('message', left(NEW.change_request, 300)));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status, quote_total, change_requested_at ON public.travel_trips
  FOR EACH ROW EXECUTE FUNCTION public.notify_trip_change();

CREATE OR REPLACE FUNCTION public.notify_travel_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips;
BEGIN
  IF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received' THEN
    SELECT * INTO t FROM public.travel_trips WHERE id = NEW.trip_id;
    PERFORM public.notify_event('DOCUMENT_UPLOADED', 'DOCUMENT_UPLOADED:' || NEW.id || ':' || coalesce(NEW.uploaded_at, now()),
      'travel_trips', t.id, public.notification_staff('travel', '/staff/travel/trip/' || t.id),
      jsonb_build_object('label', t.reference || ' · ' || t.customer_name, 'document', NEW.label));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status ON public.travel_documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_travel_document();

-- ============== CONSULTANCY ==============
CREATE OR REPLACE FUNCTION public.notify_consult_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb := jsonb_build_object('reference', NEW.reference, 'service', NEW.service_name,
    'label', NEW.reference || ' · ' || NEW.client_name);
  v_staff jsonb := public.notification_staff('consultancy', '/staff/consultancy');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_event('CONSULTANCY_REQUEST_CREATED', 'CONSULTANCY_REQUEST_CREATED:' || NEW.id, 'consult_requests', NEW.id,
      public.notification_customer('consult_requests', NEW.id), v_data);
    PERFORM public.notify_event('NEW_REQUEST', 'NEW_REQUEST:' || NEW.id, 'consult_requests', NEW.id, v_staff,
      v_data || jsonb_build_object('service', 'consultancy'));
  ELSIF NEW.change_requested_at IS DISTINCT FROM OLD.change_requested_at AND NEW.change_request IS NOT NULL THEN
    PERFORM public.notify_event('CHANGES_REQUESTED', 'CHANGES_REQUESTED:' || NEW.id || ':' || NEW.change_requested_at,
      'consult_requests', NEW.id, v_staff, v_data || jsonb_build_object('message', left(NEW.change_request, 300)));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF change_requested_at ON public.consult_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_consult_request();

CREATE OR REPLACE FUNCTION public.notify_consult_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.consult_requests;
  v_data jsonb;
BEGIN
  SELECT * INTO r FROM public.consult_requests WHERE id = NEW.request_id;
  v_data := jsonb_build_object('reference', r.reference, 'label', r.reference || ' · ' || r.client_name,
    'amount', public.notification_money(NEW.fee, NEW.currency));
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM public.notify_event('CONSULTANCY_PROPOSAL_READY', 'CONSULTANCY_PROPOSAL_READY:' || NEW.id, 'consult_requests', r.id,
      public.notification_customer('consult_requests', r.id), v_data);
  ELSIF NEW.status = 'accepted' AND TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM public.notify_event('PROPOSAL_ACCEPTED', 'PROPOSAL_ACCEPTED:' || NEW.id, 'consult_requests', r.id,
      public.notification_staff('consultancy', '/staff/consultancy'), v_data);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status ON public.consult_proposals
  FOR EACH ROW EXECUTE FUNCTION public.notify_consult_proposal();

CREATE OR REPLACE FUNCTION public.notify_client_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref text;
  v_client text;
  v_service text := CASE TG_TABLE_NAME WHEN 'consult_files' THEN 'consultancy' ELSE 'data' END;
  v_table text := CASE TG_TABLE_NAME WHEN 'consult_files' THEN 'consult_requests' ELSE 'data_requests' END;
BEGIN
  -- (read through jsonb: the two tables have different columns)
  IF (TG_TABLE_NAME = 'consult_files' AND to_jsonb(NEW) ->> 'kind' <> 'client')
     OR (TG_TABLE_NAME = 'data_files' AND NOT (to_jsonb(NEW) ->> 'from_client')::boolean) THEN
    RETURN NULL;
  END IF;
  IF v_table = 'consult_requests' THEN
    SELECT reference, client_name INTO v_ref, v_client FROM public.consult_requests WHERE id = NEW.request_id;
  ELSE
    SELECT reference, client_name INTO v_ref, v_client FROM public.data_requests WHERE id = NEW.request_id;
  END IF;
  PERFORM public.notify_event('DOCUMENT_UPLOADED', 'DOCUMENT_UPLOADED:' || NEW.id, v_table, NEW.request_id,
    public.notification_staff(v_service, public.notification_staff_link(v_table, NEW.request_id)),
    jsonb_build_object('label', v_ref || ' · ' || v_client, 'document', NEW.name));
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT ON public.consult_files
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_file();
CREATE TRIGGER notify_changes AFTER INSERT ON public.data_files
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_file();

-- ============== DATA ANALYSIS ==============
CREATE OR REPLACE FUNCTION public.notify_data_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb := jsonb_build_object('reference', NEW.reference, 'service', NEW.service_name,
    'label', NEW.reference || ' · ' || NEW.client_name);
  v_customer jsonb := public.notification_customer('data_requests', NEW.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_event('DATA_ANALYSIS_REQUEST_CREATED', 'DATA_ANALYSIS_REQUEST_CREATED:' || NEW.id, 'data_requests', NEW.id,
      v_customer, v_data);
    PERFORM public.notify_event('NEW_REQUEST', 'NEW_REQUEST:' || NEW.id, 'data_requests', NEW.id,
      public.notification_staff('data', '/staff/data'), v_data || jsonb_build_object('service', 'data analysis'));
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'client_review' THEN
    PERFORM public.notify_event('DATA_ANALYSIS_READY', 'DATA_ANALYSIS_READY:' || NEW.id || ':' || now(), 'data_requests', NEW.id,
      v_customer, v_data);
  ELSIF NEW.client_feedback_at IS DISTINCT FROM OLD.client_feedback_at AND NEW.status = 'analysis' THEN
    PERFORM public.notify_event('CHANGES_REQUESTED', 'CHANGES_REQUESTED:' || NEW.id || ':' || NEW.client_feedback_at, 'data_requests', NEW.id,
      public.notification_staff('data', '/staff/data'), v_data || jsonb_build_object('message', left(coalesce(NEW.client_feedback, ''), 300)));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status, client_feedback_at ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_data_request();

-- ============== MARKETPLACE ==============
CREATE OR REPLACE FUNCTION public.notify_order_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb := jsonb_build_object('order', left(NEW.id::text, 8), 'amount', public.notification_money(NEW.total_amount, 'RWF'));
  v_buyer jsonb := jsonb_build_array(jsonb_build_object('user_id', NEW.buyer_id, 'link', '/my-orders'));
  v_seller jsonb := jsonb_build_array(jsonb_build_object('user_id', NEW.seller_id, 'link', '/seller'));
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_event('ORDER_PLACED', 'ORDER_PLACED:' || NEW.id, 'orders', NEW.id, v_buyer, v_data);
    PERFORM public.notify_event('ORDER_RECEIVED', 'ORDER_RECEIVED:' || NEW.id, 'orders', NEW.id, v_seller, v_data);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'shipped' THEN PERFORM public.notify_event('ORDER_SHIPPED', 'ORDER_SHIPPED:' || NEW.id, 'orders', NEW.id, v_buyer, v_data);
      WHEN 'delivered' THEN PERFORM public.notify_event('ORDER_DELIVERED', 'ORDER_DELIVERED:' || NEW.id, 'orders', NEW.id, v_seller, v_data);
      WHEN 'cancelled' THEN PERFORM public.notify_event('ORDER_CANCELLED', 'ORDER_CANCELLED:' || NEW.id, 'orders', NEW.id, v_buyer, v_data);
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_change();

CREATE OR REPLACE FUNCTION public.notify_shipment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    PERFORM public.notify_event('SHIPMENT_UPDATED', 'SHIPMENT_UPDATED:' || NEW.id || ':' || NEW.status, 'orders', o.id,
      jsonb_build_array(jsonb_build_object('user_id', o.buyer_id, 'link', '/track/' || NEW.tracking_number)),
      jsonb_build_object('order', left(o.id::text, 8), 'status', replace(NEW.status, '_', ' '), 'tracking', NEW.tracking_number));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER INSERT OR UPDATE OF status ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.notify_shipment_change();

CREATE OR REPLACE FUNCTION public.notify_payout_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seller jsonb := jsonb_build_array(jsonb_build_object('user_id', NEW.seller_id, 'link', '/seller'));
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid', 'rejected') THEN
    PERFORM public.notify_event(CASE NEW.status WHEN 'paid' THEN 'PAYOUT_PAID' ELSE 'PAYOUT_REJECTED' END,
      'PAYOUT_' || upper(NEW.status) || ':' || NEW.id, 'payout_requests', NEW.id, v_seller,
      jsonb_build_object('amount', public.notification_money(NEW.net_amount, 'RWF'), 'method', upper(NEW.payout_method),
                         'note', coalesce(NEW.admin_note, '')));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_change();

CREATE OR REPLACE FUNCTION public.notify_seller_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify_event(CASE NEW.status WHEN 'approved' THEN 'SELLER_APPROVED' ELSE 'SELLER_REJECTED' END,
      'SELLER_' || upper(NEW.status) || ':' || NEW.id || ':' || now(), 'seller_applications', NEW.id,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('user_id', NEW.user_id, 'email', NEW.email, 'phone', NEW.phone,
        'name', NEW.full_name, 'link', CASE NEW.status WHEN 'approved' THEN '/seller' ELSE '/become-seller' END))),
      jsonb_build_object('note', coalesce(NEW.rejection_reason, '')));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_seller_application();

-- ============== LOGISTICS ==============
CREATE OR REPLACE FUNCTION public.notify_delivery_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer jsonb := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('user_id', NEW.user_id, 'phone', NEW.phone,
    'name', NEW.full_name, 'link', '/logistics/history')));
  v_data jsonb := jsonb_build_object('pickup', NEW.pickup, 'dropoff', NEW.dropoff, 'status', replace(NEW.status, '_', ' '));
BEGIN
  IF NEW.assigned_driver_id IS NOT NULL AND NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    PERFORM public.notify_event('DELIVERY_DRIVER_ASSIGNED', 'DELIVERY_DRIVER_ASSIGNED:' || NEW.id || ':' || NEW.assigned_driver_id,
      'logistics_requests', NEW.id, v_customer, v_data);
    PERFORM public.notify_event('DELIVERY_JOB_ASSIGNED', 'DELIVERY_JOB_ASSIGNED:' || NEW.id || ':' || NEW.assigned_driver_id,
      'logistics_requests', NEW.id, jsonb_build_array(jsonb_build_object('user_id', NEW.assigned_driver_id, 'link', '/driver')), v_data);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('pending', 'assigned') THEN
    PERFORM public.notify_event(CASE WHEN NEW.status = 'delivered' THEN 'DELIVERY_COMPLETED' ELSE 'DELIVERY_UPDATED' END,
      'DELIVERY:' || NEW.id || ':' || NEW.status, 'logistics_requests', NEW.id, v_customer, v_data);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status, assigned_driver_id ON public.logistics_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_change();

CREATE OR REPLACE FUNCTION public.notify_packaging_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_event('PACKAGING_UPDATED', 'PACKAGING_UPDATED:' || NEW.id || ':' || NEW.status, 'packaging_requests', NEW.id,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('user_id', NEW.user_id, 'phone', NEW.phone, 'name', NEW.full_name,
        'link', '/logistics/history'))),
      jsonb_build_object('item', left(NEW.item_description, 80), 'status', replace(NEW.status, '_', ' ')));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status ON public.packaging_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_packaging_change();

-- ============== SUBSCRIPTIONS AND INSIGHTS ==============
CREATE OR REPLACE FUNCTION public.notify_subscription_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active' OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    PERFORM public.notify_event('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_ACTIVATED:' || NEW.id || ':' || NEW.expires_at,
      'subscriptions', NEW.id, public.notification_customer('subscriptions', NEW.id),
      jsonb_build_object('until', to_char(NEW.expires_at, 'DD Mon YYYY')));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_changes AFTER UPDATE OF status, expires_at ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_change();

CREATE OR REPLACE FUNCTION public.notify_insight_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notify_event('INSIGHT_READY', 'INSIGHT_READY:' || NEW.id, 'business_insights', NEW.id,
      jsonb_build_array(jsonb_build_object('user_id', NEW.business_id, 'link', '/insights')),
      jsonb_build_object('title', coalesce(NEW.title, 'Your business analysis report is ready')));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_recommendation_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notify_event('RECOMMENDATION_READY', 'RECOMMENDATION_READY:' || NEW.id, 'recommendations', NEW.id,
      jsonb_build_array(jsonb_build_object('user_id', NEW.business_id, 'link', '/insights')),
      jsonb_build_object('title', NEW.title));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_support_request_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event('SUPPORT_REQUEST_CREATED', 'SUPPORT_REQUEST_CREATED:' || NEW.id, 'support_requests', NEW.id,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'link', '/admin')), '[]'::jsonb)
     FROM public.user_roles WHERE role = 'admin'),
    jsonb_build_object('kind', NEW.type));
  RETURN NEW;
END $$;

-- ============== FUNCTIONS THAT WROTE MESSAGES INLINE ==============
-- Unchanged except that the message now comes from the event triggers above.
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_shipping_address text,
  p_payment_method text,
  p_payment_reference text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rate numeric := 0.07; -- keep in sync with COMMISSION_RATE in src/lib/company.ts
  v_seller uuid;
  v_total integer;
  v_order_id uuid;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to place an order' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF coalesce(trim(p_shipping_address), '') = '' THEN
    RAISE EXCEPTION 'Shipping address required';
  END IF;
  IF p_payment_method NOT IN ('momo', 'bank') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF coalesce(trim(p_payment_reference), '') = '' THEN
    RAISE EXCEPTION 'Payment reference required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
    LEFT JOIN public.products p ON p.id = i.product_id AND p.status = 'active'
    WHERE p.id IS NULL OR i.quantity IS NULL OR i.quantity < 1 OR i.quantity > 10000
  ) THEN
    RAISE EXCEPTION 'Some items in your cart are no longer available';
  END IF;

  -- One order per seller, as before
  FOR v_seller IN
    SELECT DISTINCT p.seller_id
    FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
    JOIN public.products p ON p.id = i.product_id
  LOOP
    SELECT sum(p.price * i.quantity) INTO v_total
    FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
    JOIN public.products p ON p.id = i.product_id
    WHERE p.seller_id = v_seller;

    INSERT INTO public.orders (
      buyer_id, seller_id, total_amount, shipping_address, status,
      payment_status, payment_method, payment_reference
    ) VALUES (
      v_uid, v_seller, v_total, trim(p_shipping_address), 'pending',
      'awaiting_confirmation', p_payment_method, trim(p_payment_reference)
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, i.quantity, p.price
    FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
    JOIN public.products p ON p.id = i.product_id
    WHERE p.seller_id = v_seller;

    INSERT INTO public.commissions (
      order_id, seller_id, sale_amount, commission_rate, commission_amount, status
    ) VALUES (
      v_order_id, v_seller, v_total, v_rate * 100, round(v_total * v_rate), 'pending'
    );

    v_result := v_result || jsonb_build_object(
      'id', v_order_id, 'seller_id', v_seller, 'total_amount', v_total
    );
  END LOOP;

  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_delivery(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id AND buyer_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled';
  END IF;

  UPDATE public.orders
  SET status = 'delivered', delivered_confirmed_at = now()
  WHERE id = p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_seller_application(p_application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.seller_applications;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve sellers' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.seller_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  -- the seller role and the seller's message follow from the approval
  UPDATE public.seller_applications
  SET status = 'approved', rejection_reason = NULL
  WHERE id = v_app.id;
  UPDATE public.profiles SET business_name = v_app.business_name WHERE user_id = v_app.user_id;
END $$;

CREATE OR REPLACE FUNCTION public.submit_subscription_payment(p_reference text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  t jsonb;
BEGIN
  IF coalesce(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'Payment reference required';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Start your free trial first';
  END IF;

  a := public.finance_open_account('subscriptions', v_sub.id, 'RWF', v_sub.user_id, 'Subscription ' || v_sub.plan);
  t := public.finance_totals(a.id);
  IF (t ->> 'pending')::numeric > 0 THEN
    RAISE EXCEPTION 'Your last payment is still being checked';
  END IF;
  -- One period at a time: charge it if nothing is owed yet
  IF (t ->> 'balance')::numeric <= 0 THEN
    PERFORM public.finance_post(a, 'charge', v_sub.amount, 'price', 'Subscription: 30 days (' || v_sub.plan || ')');
  END IF;
  -- staff hear about it through the PAYMENT_REPORTED event
  PERFORM public.finance_submit(a, (public.finance_totals(a.id) ->> 'balance')::numeric, 'momo', p_reference, 'account');

  UPDATE public.subscriptions
  SET payment_reference = trim(p_reference), payment_submitted_at = now()
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

CREATE OR REPLACE FUNCTION public.activate_subscription(p_subscription_id uuid)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_submission uuid;
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

  -- the customer's message follows from the activation (SUBSCRIPTION_ACTIVATED)
  UPDATE public.subscriptions
  SET status = 'active',
      starts_at = now(),
      -- renewing early adds 30 days on top of the time left
      expires_at = CASE WHEN status = 'active' AND expires_at > now()
                        THEN expires_at ELSE now() END + interval '30 days',
      payment_submitted_at = NULL
  WHERE id = p_subscription_id
  RETURNING * INTO v_sub;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;
  RETURN v_sub;
END $$;

-- ============== DISPATCH (notifications-dispatch Edge Function) ==============
-- Claims due email/WhatsApp/SMS deliveries. A claimed delivery is locked for
-- two minutes; if the sender dies it becomes due again (the provider gets the
-- delivery id as its idempotency key, so a resend is recognised).
CREATE OR REPLACE FUNCTION public.notification_claim(p_limit integer DEFAULT 25)
RETURNS SETOF public.notification_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET status = 'sending', attempts = d.attempts + 1, locked_until = now() + interval '2 minutes'
  WHERE d.id IN (
    SELECT id FROM public.notification_deliveries
    WHERE channel <> 'in_app'
      AND ((status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now()))
      AND attempts < max_attempts
    ORDER BY next_attempt_at
    LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END $$;

-- The sender's result. Failures are retried after 1, 2, 4, 8 minutes...;
-- p_retry = false (e.g. an invalid address, or no provider) stops at once.
CREATE OR REPLACE FUNCTION public.notification_result(
  p_delivery_id uuid, p_ok boolean, p_provider text, p_message_id text, p_error text, p_retry boolean DEFAULT true
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.notification_deliveries;
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
    RETURN 'sent';
  ELSIF NOT p_retry AND p_provider IS NULL THEN
    UPDATE public.notification_deliveries
    SET status = 'skipped', error = left(p_error, 500), locked_until = NULL WHERE id = d.id;
    RETURN 'skipped';
  ELSIF NOT p_retry OR d.attempts >= d.max_attempts THEN
    UPDATE public.notification_deliveries
    SET status = 'failed', failed_at = now(), provider = p_provider, error = left(p_error, 500), locked_until = NULL
    WHERE id = d.id;
    RETURN 'failed';
  END IF;
  UPDATE public.notification_deliveries
  SET status = 'pending', provider = p_provider, error = left(p_error, 500), locked_until = NULL,
      next_attempt_at = now() + make_interval(mins => power(2, d.attempts - 1)::int)
  WHERE id = d.id;
  RETURN 'retry';
END $$;

-- Delivery receipts from providers that send them
CREATE OR REPLACE FUNCTION public.notification_delivered(p_provider text, p_message_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  UPDATE public.notification_deliveries SET status = 'delivered', delivered_at = now()
  WHERE provider = p_provider AND provider_message_id = p_message_id AND status = 'sent';
END $$;

-- ============== FUNCTION PERMISSIONS ==============
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'notify_event(text, text, text, uuid, jsonb, jsonb)', 'notification_render(text, jsonb)',
    'notification_money(numeric, text)', 'site_link(text)', 'notification_customer(text, uuid)',
    'notification_staff(text, text)', 'notification_staff_link(text, uuid)',
    'notify_payment_change()', 'notify_submission_change()', 'notify_trip_change()', 'notify_travel_document()',
    'notify_consult_request()', 'notify_consult_proposal()', 'notify_client_file()', 'notify_data_request()',
    'notify_order_change()', 'notify_shipment_change()', 'notify_payout_change()', 'notify_seller_application()',
    'notify_delivery_change()', 'notify_packaging_change()', 'notify_subscription_change()',
    'notify_insight_sent()', 'notify_recommendation_sent()', 'notify_support_request_created()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'notification_claim(integer)', 'notification_result(uuid, boolean, text, text, text, boolean)',
    'notification_delivered(text, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

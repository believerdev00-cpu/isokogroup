-- Real providers for WhatsApp and SMS (Twilio), and what they report back
--
-- WhatsApp only lets a business start a conversation with a template WhatsApp
-- has approved; free text works only within 24 hours of the customer's last
-- message (and in Twilio's sandbox). So:
--   * each email / WhatsApp / SMS delivery keeps the values it was written
--     from (data: name, amount, link, ... and the event type), so a sender can
--     fill an approved template's numbered variables;
--   * notification_templates says, for a channel, which approved template to
--     use (provider_template, e.g. Twilio's content SID "HX...") and which
--     values go into {{1}}, {{2}}, ... (provider_variables). Without one, the
--     text is sent as it is;
--   * notification_provider_status records what the provider reports later:
--     delivered, read, or failed after all (e.g. no approved template).
-- notify_event is as in 20260925130000_notification_engine.sql, except that it
-- stores data on email / WhatsApp / SMS deliveries.

ALTER TABLE public.notification_deliveries ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS provider_template text,
  ADD COLUMN IF NOT EXISTS provider_variables text[];
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_provider_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_provider_check CHECK (
  (provider_template IS NULL AND provider_variables IS NULL)
  OR (channel IN ('whatsapp', 'sms') AND provider_template ~ '^[A-Za-z0-9_-]{2,80}$'
      AND coalesce(array_length(provider_variables, 1), 0) <= 10));

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
        recipient_name, subject, body, status, error, data)
      VALUES (v_event, ch, v_user, v_address, coalesce(v_user::text, v_address), v_name, v_subject, v_body, v_status, v_error,
        v_data || jsonb_build_object('event_type', p_type))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN v_event;
END $$;

-- What the provider reports after accepting a message (service role: the
-- notifications-status Edge Function, after checking the provider's signature)
CREATE OR REPLACE FUNCTION public.notification_provider_status(
  p_provider text, p_message_id text, p_status text, p_error text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.notification_deliveries;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  SELECT * INTO d FROM public.notification_deliveries
  WHERE provider = p_provider AND provider_message_id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  IF p_status = 'delivered' AND d.status = 'sent' THEN
    UPDATE public.notification_deliveries SET status = 'delivered', delivered_at = now() WHERE id = d.id;
    RETURN 'delivered';
  ELSIF p_status = 'failed' AND d.status IN ('sent', 'delivered') THEN
    -- accepted, then not delivered (a wrong number, no approved template...)
    UPDATE public.notification_deliveries
    SET status = 'failed', failed_at = now(), error = left(coalesce(p_error, 'Not delivered'), 500)
    WHERE id = d.id;
    RETURN 'failed';
  END IF;
  RETURN 'ignored';
END $$;

REVOKE EXECUTE ON FUNCTION public.notification_provider_status(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_provider_status(text, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.notify_event(text, text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

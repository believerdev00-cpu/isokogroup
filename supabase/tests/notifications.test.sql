-- Regression test for the notification engine (20260925130000_notification_engine.sql),
-- run against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/notifications.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'nt-buyer@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'nt-seller@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e3', 'nt-driver@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e4', 'nt-travel@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e5', 'nt-admin@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000e2', 'seller'),
  ('00000000-0000-4000-8000-0000000000e3', 'driver'),
  ('00000000-0000-4000-8000-0000000000e4', 'travel_staff'),
  ('00000000-0000-4000-8000-0000000000e5', 'admin');
UPDATE public.profiles SET phone = '0788 000 111', full_name = 'Nia Buyer' WHERE user_id = '00000000-0000-4000-8000-0000000000e1';

CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

CREATE FUNCTION pg_temp.inbox(p_user uuid, p_type text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications WHERE user_id = p_user AND event_type = p_type;
$$;

\set buyer '''00000000-0000-4000-8000-0000000000e1'''
\set seller '''00000000-0000-4000-8000-0000000000e2'''
\set driver '''00000000-0000-4000-8000-0000000000e3'''
\set travel '''00000000-0000-4000-8000-0000000000e4'''
\set admin '''00000000-0000-4000-8000-0000000000e5'''

-- ---------- In-app notifications are the engine's ----------
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.notifications (user_id, title) VALUES (auth.uid(), 'Fake: your order is free') $$),
  'nobody writes notifications from the browser (not even to themselves)');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.notifications (user_id, title) VALUES ('00000000-0000-4000-8000-0000000000e2', 'Phishing') $$),
  'nor to someone else');

-- ---------- Marketplace: one order, one message each ----------
SELECT pg_temp.refused(:seller, $$INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'NT-W', 1500, 'x', 5)$$);
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$SELECT public.place_order(jsonb_build_array(jsonb_build_object(
  'product_id', (SELECT id FROM public.products WHERE name = 'NT-W'), 'quantity', 2)), 'Kigali', 'momo', 'MP-NT-1')$$),
  'buyer places an order');
SELECT pg_temp.expect(pg_temp.inbox(:buyer, 'ORDER_PLACED') = 1 AND pg_temp.inbox(:seller, 'ORDER_RECEIVED') = 1,
  'buyer and seller each get one message');
SELECT pg_temp.expect((SELECT count(*) FROM public.notifications WHERE user_id = :buyer AND title = 'Order placed') = 0,
  'the old inline message is gone (no duplicate)');
SELECT pg_temp.expect(pg_temp.inbox(:admin, 'PAYMENT_REPORTED') = 1, 'Isoko is told a payment reference needs checking');
SELECT pg_temp.expect((SELECT body FROM public.notifications WHERE user_id = :buyer AND event_type = 'ORDER_PLACED')
  = 'Your order of 3,000 RWF was submitted. We will confirm your payment shortly.', 'the template is filled in');
SELECT pg_temp.expect((SELECT link FROM public.notifications WHERE user_id = :buyer AND event_type = 'ORDER_PLACED') = '/my-orders'
  AND (SELECT entity_table FROM public.notifications WHERE user_id = :buyer AND event_type = 'ORDER_PLACED') = 'orders',
  'the message links to the order page and names the record');

SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$SELECT public.confirm_order_payment((SELECT id FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000e1'))$$),
  'admin confirms the payment');
SELECT pg_temp.expect(pg_temp.inbox(:buyer, 'PAYMENT_SUCCESSFUL') = 1 AND pg_temp.inbox(:seller, 'ORDER_PAID') = 1,
  'buyer hears the payment arrived, the seller is told to ship');
SELECT pg_temp.expect((SELECT body FROM public.notifications WHERE user_id = :buyer AND event_type = 'PAYMENT_SUCCESSFUL') LIKE '%Balance: 0 RWF%',
  'the message shows the balance after the payment');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'shipped')$$)
  AND pg_temp.inbox(:buyer, 'ORDER_SHIPPED') = 1,
  'shipping tells the buyer (this message used to be refused)');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$SELECT public.confirm_delivery((SELECT id FROM public.orders WHERE buyer_id = auth.uid()))$$)
  AND pg_temp.inbox(:seller, 'ORDER_DELIVERED') = 1, 'confirming delivery tells the seller');

-- ---------- The same event twice is sent once ----------
SELECT public.notify_event('ORDER_SHIPPED', 'ORDER_SHIPPED:' || id, 'orders', id,
  jsonb_build_array(jsonb_build_object('user_id', buyer_id)), '{}') FROM public.orders WHERE buyer_id = :buyer;
SELECT pg_temp.expect(pg_temp.inbox(:buyer, 'ORDER_SHIPPED') = 1, 'raising an event again sends nothing');
SELECT pg_temp.expect((SELECT count(*) FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'ORDER_SHIPPED' AND d.recipient_user_id = :buyer AND d.channel = 'email') = 1,
  'and each channel has one delivery');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$SELECT public.notify_event('ORDER_SHIPPED', 'x', NULL, NULL, '[{}]', '{}')$$),
  'the website can''t raise events');

-- ---------- Marking read ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$UPDATE public.notifications SET read = true WHERE user_id = auth.uid()$$),
  'people mark their notifications read');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$UPDATE public.notifications SET title = 'edited' WHERE user_id = auth.uid()$$),
  'but can''t change what they say');
SELECT pg_temp.expect(pg_temp.visible(:seller, $$SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000000e1'$$) = 0,
  'nobody reads someone else''s notifications');

-- ---------- Email / WhatsApp / SMS deliveries ----------
SELECT pg_temp.expect((SELECT status || ' / ' || error FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'ORDER_SHIPPED' AND d.channel = 'email' AND d.recipient_user_id = :buyer) = 'skipped / site_url is not set',
  'without the site address, messages with a link are skipped, not sent broken');
UPDATE public.platform_settings SET value = 'https://isoko.test' WHERE key = 'site_url';

SELECT pg_temp.refused(NULL, $$SELECT public.travel_request_trip('{"arrival_date":"2030-04-01","departure_date":"2030-04-04",
  "travelers":2,"needs":["hotel"],"name":"Tina Traveller","phone":"+250 788 222 333","email":"Tina@Example.com"}'::jsonb)$$);
SELECT pg_temp.expect((SELECT count(*) FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'TRIP_REQUESTED' AND e.entity_id = (SELECT id FROM public.travel_trips WHERE customer_name = 'Tina Traveller') AND d.status = 'pending'
    AND ((d.channel = 'email' AND d.recipient_address = 'tina@example.com') OR (d.channel = 'whatsapp' AND d.recipient_address = '+250788222333'))) = 2,
  'a link customer (no account) gets email and WhatsApp');
SELECT pg_temp.expect((SELECT body FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'TRIP_REQUESTED' AND e.entity_id = (SELECT id FROM public.travel_trips WHERE customer_name = 'Tina Traveller') AND d.channel = 'email')
  LIKE 'Hello Tina Traveller, thank you! % https://isoko.test/travel/trip/' || (SELECT access_token FROM public.travel_trips WHERE customer_name = 'Tina Traveller'),
  'with their private link as a full address');
SELECT pg_temp.expect(pg_temp.inbox(:travel, 'NEW_REQUEST') = 1, 'travel staff see the new request in the app');
SELECT pg_temp.expect(pg_temp.inbox(:admin, 'NEW_REQUEST') = 0, 'admins aren''t copied when the service has staff');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.notification_events WHERE payload::text LIKE '%' ||
  (SELECT access_token FROM public.travel_trips WHERE customer_name = 'Tina Traveller') || '%'),
  'the private link is not stored in the event record');

INSERT INTO public.notification_opt_outs (channel, address) VALUES ('whatsapp', '+250788222333');
UPDATE public.travel_trips SET status = 'quoted', quote_total = 900, quote_sent_at = now() WHERE customer_name = 'Tina Traveller';
SELECT pg_temp.expect((SELECT string_agg(d.channel || ':' || d.status, ',' ORDER BY d.channel) FROM public.notification_deliveries d
  JOIN public.notification_events e ON e.id = d.event_id WHERE e.event_type = 'TRIP_QUOTE_READY' AND e.entity_id = (SELECT id FROM public.travel_trips WHERE customer_name = 'Tina Traveller')) = 'email:pending,sms:pending,whatsapp:skipped',
  'an opted-out WhatsApp number is skipped; email and SMS go out');
SELECT pg_temp.expect((SELECT body FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'TRIP_QUOTE_READY' AND e.entity_id = (SELECT id FROM public.travel_trips WHERE customer_name = 'Tina Traveller') AND d.channel = 'sms') LIKE 'Isoko: your trip quote (900 USD) is ready: https://isoko.test/travel/trip/%',
  'SMS uses its short template');

SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$INSERT INTO public.notification_preferences (user_id, channel, enabled) VALUES (auth.uid(), 'email', false)$$),
  'a customer turns email off');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$INSERT INTO public.notification_preferences (user_id, channel, enabled) VALUES ('00000000-0000-4000-8000-0000000000e2', 'email', false)$$),
  'but not for someone else');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff, full_name, phone)
  VALUES (auth.uid(), 'Remera', 'Nyamirambo', 'Nia Buyer', '0788 000 111')$$), 'buyer requests a delivery');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.logistics_requests SET assigned_driver_id = '00000000-0000-4000-8000-0000000000e3', status = 'assigned'
  WHERE user_id = '00000000-0000-4000-8000-0000000000e1'$$), 'admin assigns a driver');
SELECT pg_temp.expect(pg_temp.inbox(:buyer, 'DELIVERY_DRIVER_ASSIGNED') = 1 AND pg_temp.inbox(:driver, 'DELIVERY_JOB_ASSIGNED') = 1,
  'customer and driver are both told');
SELECT pg_temp.expect(NOT pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'delivered', delivered_at = now()
  WHERE assigned_driver_id = auth.uid()$$), 'driver completes the delivery');
SELECT pg_temp.expect(pg_temp.inbox(:buyer, 'DELIVERY_COMPLETED') = 1, 'the customer is told (this message used to be refused)');
SELECT pg_temp.expect((SELECT string_agg(d.channel || ':' || d.status, ',' ORDER BY d.channel) FROM public.notification_deliveries d
  JOIN public.notification_events e ON e.id = d.event_id WHERE e.event_type = 'DELIVERY_COMPLETED' AND e.entity_id IN (SELECT id FROM public.logistics_requests WHERE user_id = :buyer))
  = 'email:skipped,in_app:sent,whatsapp:pending', 'WhatsApp goes out; email is skipped because they turned it off');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_deliveries d JOIN public.notification_events e ON e.id = d.event_id
  WHERE e.event_type = 'DELIVERY_COMPLETED' AND e.entity_id IN (SELECT id FROM public.logistics_requests WHERE user_id = :buyer) AND d.channel = 'whatsapp' AND d.recipient_address = '0788000111'),
  'the phone number is cleaned up');

-- ---------- Sending, retries ----------
SELECT pg_temp.expect(pg_temp.refused(:admin, $$SELECT * FROM public.notification_claim(10)$$), 'only the sender (service role) claims deliveries');
CREATE TEMP TABLE claimed AS SELECT id, channel, attempts FROM public.notification_deliveries WHERE false;
GRANT ALL ON claimed TO service_role;
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, channel, attempts FROM public.notification_claim(100)$$);
SELECT pg_temp.expect((SELECT count(*) FROM claimed) = (SELECT count(*) FROM public.notification_deliveries WHERE status = 'sending')
  AND (SELECT count(*) FROM claimed c JOIN public.notification_deliveries d ON d.id = c.id JOIN public.notification_events e ON e.id = d.event_id
       WHERE e.entity_id = (SELECT id FROM public.travel_trips WHERE customer_name = 'Tina Traveller')) = 4 AND NOT EXISTS (SELECT 1 FROM claimed WHERE channel = 'in_app'),
  'the sender claims the due email/WhatsApp/SMS deliveries (never in-app)');
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, channel, attempts FROM public.notification_claim(100)$$);
SELECT pg_temp.expect((SELECT count(*) FROM claimed) = (SELECT count(DISTINCT id) FROM claimed),
  'a second sender gets none of them (no double sending)');

CREATE TEMP TABLE one AS SELECT id FROM claimed ORDER BY id LIMIT 4;
GRANT ALL ON one TO service_role;
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id LIMIT 1), true, 'mock', 'msg-1', NULL)$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id OFFSET 1 LIMIT 1), false, 'mock', NULL, 'Timeout')$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id OFFSET 2 LIMIT 1), false, NULL, NULL, 'No sms provider configured', false)$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id OFFSET 3 LIMIT 1), false, 'mock', NULL, 'Invalid number', false)$$);
SELECT pg_temp.expect((SELECT string_agg(status, ',' ORDER BY id) FROM public.notification_deliveries WHERE id IN (SELECT id FROM one))
  = 'sent,pending,skipped,failed', 'sent / retry later / no provider: skipped / permanent error: failed');
SELECT pg_temp.expect((SELECT next_attempt_at > now() AND error = 'Timeout' FROM public.notification_deliveries WHERE id = (SELECT id FROM one ORDER BY id OFFSET 1 LIMIT 1)),
  'a failed attempt is retried later, not straight away');
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id LIMIT 1), true, 'mock', 'msg-dup', NULL)$$);
SELECT pg_temp.expect((SELECT provider_message_id FROM public.notification_deliveries WHERE id = (SELECT id FROM one ORDER BY id LIMIT 1)) = 'msg-1',
  'a late second result for a sent message is ignored');
SELECT pg_temp.refused('service', $$SELECT public.notification_delivered('mock', 'msg-1')$$);
SELECT pg_temp.expect((SELECT status FROM public.notification_deliveries WHERE id = (SELECT id FROM one ORDER BY id LIMIT 1)) = 'delivered',
  'a delivery receipt marks it delivered');

UPDATE public.notification_deliveries SET locked_until = now() - interval '1 minute'
WHERE id = (SELECT id FROM claimed ORDER BY id OFFSET 4 LIMIT 1);
TRUNCATE claimed;
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, channel, attempts FROM public.notification_claim(100)$$);
SELECT pg_temp.expect((SELECT count(*) FROM claimed) = 1 AND (SELECT attempts FROM claimed) = 2,
  'a delivery whose sender died is picked up again once its lock expires');
UPDATE public.notification_deliveries SET attempts = max_attempts - 1, status = 'pending', next_attempt_at = now()
WHERE id = (SELECT id FROM one ORDER BY id OFFSET 1 LIMIT 1);
TRUNCATE claimed;
SELECT pg_temp.refused('service', $$INSERT INTO claimed SELECT id, channel, attempts FROM public.notification_claim(100)$$);
SELECT pg_temp.refused('service', $$SELECT public.notification_result((SELECT id FROM one ORDER BY id OFFSET 1 LIMIT 1), false, 'mock', NULL, 'Timeout again')$$);
SELECT pg_temp.expect((SELECT status FROM public.notification_deliveries WHERE id = (SELECT id FROM one ORDER BY id OFFSET 1 LIMIT 1)) = 'failed',
  'after the last attempt it is marked failed');

-- ---------- Who sees the machinery ----------
SELECT pg_temp.expect(pg_temp.visible(:buyer, 'SELECT 1 FROM public.notification_deliveries') = 0
  AND pg_temp.visible(:buyer, 'SELECT 1 FROM public.notification_events') = 0, 'customers can''t see deliveries or events');
SELECT pg_temp.expect(pg_temp.visible(:admin, 'SELECT 1 FROM public.notification_deliveries') > 0, 'admins can');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$UPDATE public.platform_settings SET value = 'https://evil.test' WHERE key = 'site_url' RETURNING 1/0$$)
  OR (SELECT value FROM public.platform_settings WHERE key = 'site_url') = 'https://isoko.test', 'only admins change the site address');

ROLLBACK;

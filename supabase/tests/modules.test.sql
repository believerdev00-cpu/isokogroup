-- Regression test for 20260925150000_module_fixes.sql (marketplace stock and
-- states, payouts, logistics, packaging, library access, account deletion),
-- run against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/modules.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'md-seller@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'md-buyer@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'md-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c4', 'md-driver@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c5', 'md-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c6', 'md-staff@test.local', 'authenticated', 'authenticated');
-- The member services need a running trial or paid period
-- (20260930100000_subscription_manual_momo.sql): the test users are in their trial
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at)
SELECT id, 'trial', 'trial', now(), now() + interval '1 day' FROM auth.users u
WHERE email LIKE '%@test.local' AND email <> 'md-other@test.local' AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id);
SELECT set_config('isoko.subscription_internal', '', true);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'seller'),
  ('00000000-0000-4000-8000-0000000000c3', 'admin'),
  ('00000000-0000-4000-8000-0000000000c4', 'driver'),
  ('00000000-0000-4000-8000-0000000000c6', 'travel_staff');

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

\set seller '''00000000-0000-4000-8000-0000000000c1'''
\set buyer '''00000000-0000-4000-8000-0000000000c2'''
\set admin '''00000000-0000-4000-8000-0000000000c3'''
\set driver '''00000000-0000-4000-8000-0000000000c4'''
\set other '''00000000-0000-4000-8000-0000000000c5'''
\set staff '''00000000-0000-4000-8000-0000000000c6'''

-- ---------- Marketplace stock ----------
SELECT pg_temp.refused(:seller, $$INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'MD-Lamp', 1000, 'x', 3)$$);
CREATE TEMP TABLE p AS SELECT id FROM public.products WHERE name = 'MD-Lamp';
GRANT SELECT ON p TO authenticated;
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$SELECT public.place_order(jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 50)),
  'Kigali', 'momo', 'MP-MD-1')$$) AND current_setting('isoko.last_error') = 'Only 3 of MD-Lamp left',
  'ordering 50 of an item with 3 in stock is refused, saying how many are left');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$SELECT public.place_order(jsonb_build_array(
  jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 2), jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 2)),
  'Kigali', 'momo', 'MP-MD-2')$$), 'the same item twice in a cart adds up (2 + 2 > 3)');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$SELECT public.place_order(jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 1)),
  'Kigali', 'momo', 'MP-MD-3')$$), 'sellers can''t buy their own products');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$SELECT public.place_order(jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 3)),
  'Kigali', 'momo', 'MP-MD-4')$$), 'buying the last 3 works');
SELECT pg_temp.expect((SELECT stock FROM public.products WHERE id = (SELECT id FROM p)) = 0, 'stock goes down to 0');
SELECT pg_temp.expect(pg_temp.refused(:other, $$SELECT public.place_order(jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM p), 'quantity', 1)),
  'Kigali', 'momo', 'MP-MD-5')$$) AND current_setting('isoko.last_error') = 'MD-Lamp is out of stock', 'the next buyer is told it is out of stock');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000c2'), 'cancelled')$$),
  'the seller cancels the (unpaid) order');
SELECT pg_temp.expect((SELECT stock FROM public.products WHERE id = (SELECT id FROM p)) = 3, 'cancelling puts the 3 back in stock');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.orders SET status = 'processing' WHERE buyer_id = '00000000-0000-4000-8000-0000000000c2'$$),
  'a cancelled order can''t be reopened, even by an admin');

-- ---------- Products: an admin's takedown sticks ----------
SELECT pg_temp.refused(:admin, $$UPDATE public.products SET status = 'inactive' WHERE name = 'MD-Lamp'$$);
SELECT pg_temp.expect(pg_temp.refused(:seller, $$UPDATE public.products SET status = 'active' WHERE name = 'MD-Lamp'$$),
  'a seller can''t put back a product an admin took down');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$UPDATE public.products SET price = 1200, stock = 10 WHERE name = 'MD-Lamp'$$),
  'but edits its price and stock');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$UPDATE public.products SET stock = -1 WHERE name = 'MD-Lamp'$$), 'stock can''t go negative');

-- ---------- Payouts: decided once ----------
INSERT INTO public.payout_requests (seller_id, gross_amount, commission_amount, net_amount, payout_destination)
VALUES (:seller, 10000, 700, 9300, '0788000000');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.payout_requests SET net_amount = 99999 WHERE seller_id = '00000000-0000-4000-8000-0000000000c1'$$),
  'a payout''s amount can''t be changed');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.payout_requests SET status = 'paid', admin_note = 'Sent by MoMo' WHERE seller_id = '00000000-0000-4000-8000-0000000000c1'$$),
  'admin marks it paid');
SELECT pg_temp.expect((SELECT paid_at IS NOT NULL FROM public.payout_requests WHERE seller_id = :seller), 'the payment date is recorded');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.payout_requests SET status = 'rejected' WHERE seller_id = '00000000-0000-4000-8000-0000000000c1'$$),
  'a paid payout can''t be turned into a rejected one');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.payout_requests SET status = 'pending' WHERE seller_id = '00000000-0000-4000-8000-0000000000c1'$$),
  'or back to pending');

-- ---------- Logistics: drivers move forward only; history kept ----------
SELECT pg_temp.refused(:buyer, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'Kimironko', 'Kacyiru')$$);
UPDATE public.logistics_requests SET assigned_driver_id = :driver, status = 'assigned' WHERE user_id = :buyer;
SELECT pg_temp.expect(pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'pending' WHERE assigned_driver_id = auth.uid()$$),
  'a driver can''t move a delivery backwards');
SELECT pg_temp.expect(pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'delivered' WHERE assigned_driver_id = auth.uid()$$)
  AND current_setting('isoko.last_error') LIKE '%proof%', 'or mark it delivered without a proof photo');
SELECT pg_temp.expect(pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'cancelled' WHERE assigned_driver_id = auth.uid()$$),
  'or cancel it');
SELECT pg_temp.expect(NOT pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'in_progress', picked_up_at = now() WHERE assigned_driver_id = auth.uid()$$),
  'the driver picks it up');
SELECT pg_temp.expect(NOT pg_temp.refused(:driver, $$UPDATE public.logistics_requests SET status = 'delivered', delivered_at = now(),
  proof_url = auth.uid() || '/proof.jpg' WHERE assigned_driver_id = auth.uid()$$), 'and delivers it with a proof photo');
SELECT pg_temp.expect((SELECT string_agg(h.status, ' > ' ORDER BY h.id) FROM public.request_status_history h
  JOIN public.logistics_requests r ON r.id = h.request_id WHERE r.user_id = :buyer) = 'pending > assigned > in_progress > delivered',
  'every step is kept in the history');
SELECT pg_temp.expect(pg_temp.visible(:buyer, $$SELECT 1 FROM public.request_status_history$$) = 4
  AND pg_temp.visible(:driver, $$SELECT 1 FROM public.request_status_history h JOIN public.logistics_requests r ON r.id = h.request_id
                                  WHERE r.user_id = '00000000-0000-4000-8000-0000000000c2'$$) = 4
  AND pg_temp.visible(:other, $$SELECT 1 FROM public.request_status_history h WHERE h.request_id IN
                                  (SELECT id FROM public.logistics_requests WHERE user_id = '00000000-0000-4000-8000-0000000000c2')$$) = 0,
  'the customer and driver see it; nobody else');
SELECT pg_temp.expect(pg_temp.refused('service', $$DELETE FROM public.request_status_history$$)
  AND pg_temp.refused(:admin, $$UPDATE public.request_status_history SET status = 'x'$$), 'the history can''t be edited or deleted');
INSERT INTO public.orders (id, buyer_id, seller_id, total_amount) VALUES ('00000000-0000-4000-8000-0000000000cf', :buyer, :seller, 1);
INSERT INTO public.shipments (order_id) VALUES ('00000000-0000-4000-8000-0000000000cf');
SELECT pg_temp.refused(:admin, $$DELETE FROM public.tracking_logs WHERE shipment_id IN (SELECT id FROM public.shipments
  WHERE order_id = '00000000-0000-4000-8000-0000000000cf')$$);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.tracking_logs l JOIN public.shipments s ON s.id = l.shipment_id
  WHERE s.order_id = '00000000-0000-4000-8000-0000000000cf'), 'shipment tracking entries can''t be deleted, even by an admin');

-- ---------- Packaging ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$INSERT INTO public.packaging_requests (user_id, item_description, quantity, packaging_type, full_name, phone)
  VALUES (auth.uid(), 'Coffee bags', 200, 'Kraft pouches', 'Buyer', '0788')$$), 'the packaging form''s request (with its packaging type) is accepted');

-- ---------- E-Library and Entertainment: subscribers only ----------
INSERT INTO storage.objects (bucket_id, name) VALUES ('books', 'content/md-book.pdf'), ('entertainment', 'media/md-film.mp4');
SELECT pg_temp.expect((SELECT bool_and(NOT public) FROM storage.buckets WHERE id IN ('books', 'entertainment')), 'the library buckets are private');
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT 1 FROM storage.objects WHERE name IN ('content/md-book.pdf', 'media/md-film.mp4')$$) = 0,
  'no subscription: no library files');
-- (the dates are moved as the database owner, past the subscription guard)
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, trial_expires_at) VALUES (:other, 'trial', now() + interval '3 days');
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT 1 FROM storage.objects WHERE name IN ('content/md-book.pdf', 'media/md-film.mp4')$$) = 2,
  'a running trial opens them');
UPDATE public.subscriptions SET trial_expires_at = now() - interval '1 day' WHERE user_id = :other;
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT 1 FROM storage.objects WHERE name = 'content/md-book.pdf'$$) = 0, 'an ended trial doesn''t');
UPDATE public.subscriptions SET status = 'active', plan = 'monthly', expires_at = now() + interval '20 days' WHERE user_id = :other;
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT 1 FROM storage.objects WHERE name = 'content/md-book.pdf'$$) = 1, 'an active plan does');
UPDATE public.subscriptions SET expires_at = now() - interval '1 minute' WHERE user_id = :other;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT 1 FROM storage.objects WHERE name = 'content/md-book.pdf'$$) = 0, 'an expired plan doesn''t');
SELECT pg_temp.expect(pg_temp.visible(:admin, $$SELECT 1 FROM storage.objects WHERE name = 'content/md-book.pdf'$$) = 1, 'admins always can');

-- ---------- Deleting an account that touched payments ----------
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
CREATE TEMP TABLE tok AS SELECT public.travel_request_trip('{"arrival_date":"2030-06-01","departure_date":"2030-06-02",
  "travelers":1,"needs":["hotel"],"name":"Del","phone":"1","email":"del@example.com"}'::jsonb) ->> 'token' AS t;
UPDATE public.travel_trips SET status = 'confirmed', quote_total = 100 WHERE access_token = (SELECT t FROM tok);
SELECT public.travel_submit_payment((SELECT t FROM tok), 50, 'momo', 'MP-MD-DEL');
GRANT SELECT ON tok TO authenticated;
SELECT pg_temp.refused(:staff, $$SELECT public.finance_verify_submission((SELECT id FROM public.finance_submissions WHERE reference = 'MP-MD-DEL'))$$);
SELECT pg_temp.expect((SELECT reviewed_by FROM public.finance_submissions WHERE reference = 'MP-MD-DEL') = :staff, 'staff confirmed a payment');
SELECT pg_temp.expect(pg_temp.refused('service', $$UPDATE public.finance_submissions SET reviewed_by = NULL WHERE reference = 'MP-MD-DEL'$$),
  'nobody can blank out who confirmed it directly');
DELETE FROM auth.users WHERE id = :staff;
SELECT pg_temp.expect((SELECT reviewed_by IS NULL AND status = 'verified' FROM public.finance_submissions WHERE reference = 'MP-MD-DEL'),
  'but their account can be deleted: the payment stays, without their id');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'finance_submissions' AND actor_id = :staff
  AND new_data ->> 'status' = 'verified'), 'and the audit log still says who confirmed it');

ROLLBACK;

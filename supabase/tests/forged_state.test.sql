-- Regression test for 20260925100000_block_forged_state.sql, run against the
-- local Supabase database as the real 'anon' / 'authenticated' roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/forged_state.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'fs-seller@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'fs-buyer@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'fs-admin@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000000c', 'admin');
-- The member services need a running trial or paid period
-- (20260930100000_subscription_manual_momo.sql): the test users are in their trial
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at)
SELECT id, 'trial', 'trial', now(), now() + interval '1 day' FROM auth.users u
WHERE email LIKE '%@test.local' AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id);
SELECT set_config('isoko.subscription_internal', '', true);

-- Checks after a call are separate statements on purpose: an uncorrelated
-- subquery in the same SELECT as pg_temp.refused() is evaluated before the call.
-- Runs the statement as the given user (NULL = anonymous) and reports whether it was refused.
CREATE FUNCTION pg_temp.refused(p_user uuid, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
         ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', p_what; END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

\set seller '''00000000-0000-4000-8000-00000000000a'''
\set buyer '''00000000-0000-4000-8000-00000000000b'''
\set admin '''00000000-0000-4000-8000-00000000000c'''

-- ---------- Seller applications ----------
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number, status,
    country, tin, business_address, payment_provider, payment_account, payment_account_name, agreement_version)
  VALUES (auth.uid(), 'S', 'Shop', '1', '1', 'approved',
    'Rwanda', '123456789', 'Kigali', 'MTN MoMo', '0788000000', 'S Seller', public.seller_agreement_version()) $$),
  'user cannot insert an already approved seller application');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$
  INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number, email,
    country, tin, business_address, payment_provider, payment_account, payment_account_name, agreement_version)
  VALUES (auth.uid(), 'S', 'Shop', '1', '1', 's@x.co',
    'Rwanda', '123456789', 'Kigali', 'MTN MoMo', '0788000000', 'S Seller', public.seller_agreement_version()) $$),
  'user can apply to become a seller');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'W', 1000, 'x', 5) $$),
  'pending applicant cannot list products');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.approve_seller_application((SELECT id FROM public.seller_applications WHERE user_id = auth.uid())) $$),
  'non-admin cannot approve a seller application');
-- (a seller is approved with a confirmed 1,500 RWF seller subscription payment: 20260930130000)
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscription_payments (subscription_id, user_id, plan, amount, reference, reference_key, status, confirmed_at, period_starts_at, period_ends_at)
SELECT id, user_id, 'seller', 1500, 'FS-SELLER-1', 'FSSELLER1', 'confirmed', now(), now(), now() + interval '1 month'
FROM public.subscriptions WHERE user_id = :seller;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$
  SELECT public.approve_seller_application((SELECT id FROM public.seller_applications
    WHERE user_id = '00000000-0000-4000-8000-00000000000a')) $$), 'admin approves the application');
SELECT pg_temp.expect((SELECT role FROM public.profiles WHERE user_id = :seller) = 'seller'
  AND (SELECT status FROM public.seller_applications WHERE user_id = :seller) = 'approved'
  AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = :seller AND title = 'Seller account approved'),
  'approval sets the application, the seller role and notifies the seller');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$
  INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'Widget-fs', 1000, 'x', 5) $$),
  'approved seller lists a product');

-- ---------- Orders and payouts ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  SELECT public.place_order(jsonb_build_array(jsonb_build_object(
    'product_id', (SELECT id FROM public.products WHERE name = 'Widget-fs'), 'quantity', 2)), 'Kigali', 'momo', 'MP123') $$),
  'buyer places an order');
SELECT pg_temp.refused(:seller, $$UPDATE public.orders SET status = 'delivered' WHERE seller_id = auth.uid()$$);
SELECT pg_temp.expect((SELECT status FROM public.orders WHERE seller_id = :seller) = 'pending',
  'seller cannot update the order row directly');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$
  SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'packed') $$),
  'seller moves an order forward ("packed")');
SELECT pg_temp.expect((SELECT status FROM public.orders WHERE seller_id = :seller) = 'processing',
  '"packed" is stored as processing');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'shipped') $$),
  'seller cannot ship before payment is confirmed');
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$
  SELECT public.confirm_order_payment((SELECT id FROM public.orders WHERE seller_id = '00000000-0000-4000-8000-00000000000a')) $$),
  'admin confirms the buyer''s payment');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$
  SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'delivered') $$),
  'seller marks the shipment delivered');
SELECT pg_temp.expect((SELECT status FROM public.orders WHERE seller_id = :seller) = 'shipped',
  'a seller''s "delivered" leaves the order shipped until the buyer confirms');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'cancelled') $$),
  'seller cannot cancel a paid order');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.request_payout((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'momo', '0788000000') $$),
  'no payout before the buyer confirms delivery');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  SELECT public.seller_set_order_status((SELECT id FROM public.orders WHERE buyer_id = auth.uid()), 'processing') $$),
  'buyer cannot use the seller status function');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  SELECT public.confirm_delivery((SELECT id FROM public.orders WHERE buyer_id = auth.uid())) $$),
  'buyer confirms delivery');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.request_payout((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'paypal', '0788000000') $$),
  'unknown payout method refused');
SELECT pg_temp.expect(NOT pg_temp.refused(:seller, $$
  SELECT public.request_payout((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'momo', '0788000000') $$),
  'seller requests the payout after confirmed delivery');
SELECT pg_temp.expect(pg_temp.refused(:seller, $$
  SELECT public.request_payout((SELECT id FROM public.orders WHERE seller_id = auth.uid()), 'momo', '0788000000') $$),
  'second payout request for the same order refused');
SELECT pg_temp.expect((SELECT net_amount FROM public.payout_requests WHERE seller_id = :seller) = 2000 - 140,
  'payout amount computed on the server (2000 - 7%)');

-- ---------- Forged state on new requests ----------
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.software_bookings (user_id, full_name, email, phone, service_type, project_description, deposit_paid, final_paid)
  VALUES (auth.uid(), 'B', 'b@x.co', '1', 'web', 'x', true, true) $$), 'software booking cannot be created as paid');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.software_bookings (user_id, full_name, email, phone, service_type, project_description, status, agreed_price)
  VALUES (auth.uid(), 'B', 'b@x.co', '1', 'web', 'x', 'completed', 1) $$), 'software booking cannot set its own status or price');
-- a booking needs an account (20261002120000_requests_require_account.sql)
SELECT pg_temp.expect(pg_temp.refused(NULL, $$
  INSERT INTO public.software_bookings (user_id, full_name, email, phone, service_type, project_description)
  VALUES (NULL, 'Guest', 'g@x.co', '1', 'web', 'x') $$), 'a visitor without an account cannot book a software project');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  INSERT INTO public.software_bookings (user_id, full_name, email, phone, service_type, project_description)
  VALUES (auth.uid(), 'Buyer', 'b@x.co', '1', 'web', 'x') $$), 'a signed-in person books a software project');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.logistics_requests (user_id, pickup, dropoff, status) VALUES (auth.uid(), 'a', 'b', 'delivered') $$),
  'delivery request cannot be created as delivered');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.logistics_requests (user_id, pickup, dropoff, assigned_driver_id) VALUES (auth.uid(), 'a', 'b', auth.uid()) $$),
  'customer cannot assign a driver');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  INSERT INTO public.logistics_requests (user_id, pickup, dropoff, weight, full_name, phone, item_type)
  VALUES (auth.uid(), 'a', 'b', 2, 'B', '1', 'parcel') $$), 'customer requests a delivery');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.packaging_requests (user_id, item_description, status) VALUES (auth.uid(), 'x', 'delivered') $$),
  'packaging request cannot be created as delivered');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  INSERT INTO public.packaging_requests (user_id, item_description, quantity) VALUES (auth.uid(), 'x', 3) $$),
  'customer requests packaging');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.course_registrations (user_id, full_name, email, course_title, status)
  VALUES (auth.uid(), 'B', 'b@x.co', 'Web', 'approved') $$), 'course registration cannot be created as approved');
SELECT pg_temp.expect(pg_temp.refused(:buyer, $$
  INSERT INTO public.support_requests (business_id, message, status, admin_feedback)
  VALUES (auth.uid(), 'help', 'resolved', 'done') $$), 'support request cannot be created as resolved');
SELECT pg_temp.expect(NOT pg_temp.refused(:buyer, $$
  INSERT INTO public.support_requests (business_id, type, message) VALUES (auth.uid(), 'analysis', 'help') $$),
  'customer sends a support request');

ROLLBACK;

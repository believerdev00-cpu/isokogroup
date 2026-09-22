-- Security hardening
--
-- Until now many rules checked only *who* was writing a row, not *what* they wrote,
-- so a signed-in user could skip the app's screens and set prices, payment status,
-- payout amounts or their own subscription directly. Money-related writes now go
-- through SECURITY DEFINER functions that compute amounts on the server, and the
-- remaining direct updates are limited to the columns each role actually edits.

-- ============== HELPER: column allow-list for non-admin updates ==============
-- Trigger arguments are the columns a non-admin may change. Admins, the service
-- role and SECURITY DEFINER functions (which run as their owner) are not limited.
CREATE OR REPLACE FUNCTION public.enforce_editable_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'You are not allowed to change these fields on %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ============== ORDERS, ORDER ITEMS, COMMISSIONS ==============
-- Orders are created only by place_order(), which reads prices from products.
DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Sellers can insert own commissions" ON public.commissions;

-- Sellers may move an order through its statuses, nothing else
-- (not the amount, the payment status or the delivery confirmation).
CREATE TRIGGER orders_editable_columns
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns('status', 'updated_at');

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

    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      v_uid, 'Order placed',
      'Your order of ' || to_char(v_total, 'FM999,999,999,990') || ' RWF was submitted. We will confirm payment shortly.',
      'info', '/my-orders'
    );

    v_result := v_result || jsonb_build_object(
      'id', v_order_id, 'seller_id', v_seller, 'total_amount', v_total
    );
  END LOOP;

  RETURN v_result;
END $$;

-- The buyer confirms they received their order.
-- There was no buyer update policy, so this silently did nothing before.
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

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    v_order.seller_id, 'Buyer confirmed delivery',
    'Order #' || left(v_order.id::text, 8) || ' delivered. You can now request payout from the company.',
    'success', '/seller'
  );
END $$;

-- ============== PAYOUTS ==============
DROP POLICY IF EXISTS "Sellers create own payouts" ON public.payout_requests;

-- Amounts come from the order and its recorded commission, never from the browser.
CREATE OR REPLACE FUNCTION public.request_payout(
  p_order_id uuid,
  p_payout_method text,
  p_payout_destination text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders;
  v_commission integer;
  v_payout_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id AND seller_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'The buyer''s payment has not been confirmed yet';
  END IF;
  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'Only delivered orders can be paid out';
  END IF;
  IF coalesce(trim(p_payout_destination), '') = '' THEN
    RAISE EXCEPTION 'Payout destination required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE order_id = p_order_id AND status <> 'rejected'
  ) THEN
    RAISE EXCEPTION 'A payout has already been requested for this order';
  END IF;

  SELECT commission_amount INTO v_commission
  FROM public.commissions WHERE order_id = p_order_id
  ORDER BY created_at LIMIT 1;
  v_commission := coalesce(v_commission, round(v_order.total_amount * 0.07));

  INSERT INTO public.payout_requests (
    seller_id, order_id, gross_amount, commission_amount, net_amount,
    payout_method, payout_destination, status
  ) VALUES (
    v_order.seller_id, v_order.id, v_order.total_amount, v_commission,
    v_order.total_amount - v_commission,
    coalesce(p_payout_method, 'momo'), trim(p_payout_destination), 'pending'
  ) RETURNING id INTO v_payout_id;

  RETURN jsonb_build_object(
    'id', v_payout_id, 'net_amount', v_order.total_amount - v_commission
  );
END $$;

-- ============== SUBSCRIPTIONS ==============
-- Users could insert or update their own row, i.e. activate themselves for free.
-- Now they can start one trial and submit a payment reference; an admin activates.
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;

CREATE POLICY "Admins update subscriptions" ON public.subscriptions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz;

CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already used your free trial';
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, amount, status)
  VALUES (auth.uid(), 'basic', 200, 'trial')
  RETURNING * INTO v_sub;
  RETURN v_sub;
END $$;

CREATE OR REPLACE FUNCTION public.submit_subscription_payment(p_reference text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_admin record;
BEGIN
  IF coalesce(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'Payment reference required';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Start your free trial first';
  END IF;

  UPDATE public.subscriptions
  SET payment_reference = trim(p_reference), payment_submitted_at = now()
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;

  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      v_admin.user_id, 'Subscription payment submitted',
      'Reference: ' || trim(p_reference), 'warning', '/admin'
    );
  END LOOP;
  RETURN v_sub;
END $$;

CREATE OR REPLACE FUNCTION public.activate_subscription(p_subscription_id uuid)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can activate subscriptions' USING ERRCODE = '42501';
  END IF;
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

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    v_sub.user_id, 'Subscription active',
    'Your payment was confirmed. You have 30 days of full access.',
    'success', '/subscription'
  );
  RETURN v_sub;
END $$;

-- ============== PROFILES ==============
-- Profiles (with phone numbers) were readable by anyone, even signed out.
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users view own profile, admins view all" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'buyer');

-- Seller approval sets profiles.role, but admins had no update policy here,
-- so that write silently changed nothing.
CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Only admins change role (seller approval)
CREATE TRIGGER profiles_editable_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns(
    'full_name', 'avatar_url', 'phone', 'business_name', 'updated_at'
  );

-- ============== PRODUCTS ==============
-- Seller approval was only checked in the screen
DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
CREATE POLICY "Approved sellers can insert own products" ON public.products
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND EXISTS (
      SELECT 1 FROM public.seller_applications
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- Product images: sellers upload into their own folder (<user_id>/...)
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own product images" ON storage.objects;

CREATE POLICY "Users upload product images to own folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'product-images'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );
CREATE POLICY "Users update own product images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'product-images'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );
CREATE POLICY "Users delete own product images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'product-images'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

-- ============== SHIPMENTS & TRACKING ==============
-- "view by tracking number" actually allowed listing every shipment, with
-- addresses and driver phones. Now only the order's buyer/seller and admins read
-- rows; anyone with a tracking number gets the public fields via track_shipment().
DROP POLICY IF EXISTS "Public can view shipment by tracking number" ON public.shipments;
CREATE POLICY "Order parties and admins view shipments" ON public.shipments
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipments.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Public can view tracking logs" ON public.tracking_logs;
CREATE POLICY "Order parties and admins view tracking logs" ON public.tracking_logs
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.orders o ON o.id = s.order_id
      WHERE s.id = tracking_logs.shipment_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.track_shipment(p_tracking_number text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'shipment', jsonb_build_object(
      'id', s.id,
      'tracking_number', s.tracking_number,
      'status', s.status,
      'courier', s.courier,
      'estimated_delivery', s.estimated_delivery,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ),
    'logs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'status', l.status, 'location', l.location,
        'note', l.note, 'created_at', l.created_at
      ) ORDER BY l.created_at)
      FROM public.tracking_logs l WHERE l.shipment_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.shipments s
  WHERE s.tracking_number = upper(trim(p_tracking_number));
$$;

-- ============== DRIVER DELIVERIES ==============
-- Drivers may update progress on their assigned jobs, not prices or assignment.
CREATE TRIGGER logistics_requests_editable_columns
  BEFORE UPDATE ON public.logistics_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns(
    'status', 'driver_note', 'proof_url', 'picked_up_at', 'delivered_at', 'updated_at'
  );

CREATE TRIGGER packaging_requests_editable_columns
  BEFORE UPDATE ON public.packaging_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns(
    'status', 'driver_note', 'proof_url', 'delivered_at', 'updated_at'
  );

-- Delivery proofs were readable by every signed-in user. Drivers now upload into
-- their own folder and read only their own; admins read all. Customers keep
-- seeing proofs through the signed link stored on the request.
DROP POLICY IF EXISTS "Drivers upload proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated view proofs" ON storage.objects;

CREATE POLICY "Drivers upload proofs to own folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (public.has_role(auth.uid(), 'driver') OR public.is_admin())
  );
CREATE POLICY "Drivers view own proofs, admins view all" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'delivery-proofs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

-- ============== FUNCTION PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_delivery(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_payout(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_subscription_payment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_shipment(text) TO anon, authenticated;

-- Block forged approvals, deliveries and payment flags
--
-- The column guards added in 20260922090000 only run on UPDATE. On INSERT a
-- signed-in user could still write the fields staff own, e.g. a seller
-- application that is already 'approved' (and then list products), a software
-- booking with deposit_paid/final_paid set, or a delivery request that is
-- already 'delivered' with themselves as the driver. Sellers could also mark
-- their own orders 'delivered', skipping the buyer's confirmation, and then
-- request a payout.

-- ============== NEW ROWS START IN THEIR INITIAL STATE ==============
DROP POLICY IF EXISTS "Users create application" ON public.seller_applications;
CREATE POLICY "Users create application" ON public.seller_applications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND status = 'pending' AND rejection_reason IS NULL
  );

DROP POLICY IF EXISTS "Users create software bookings" ON public.software_bookings;
CREATE POLICY "Users create software bookings" ON public.software_bookings
  FOR INSERT WITH CHECK (
    (auth.uid() = user_id OR user_id IS NULL)
    AND status = 'pending' AND agreed_price IS NULL
    AND NOT deposit_paid AND deposit_paid_at IS NULL
    AND NOT final_paid AND final_paid_at IS NULL
    AND admin_note IS NULL
  );

DROP POLICY IF EXISTS "Users create own registrations" ON public.course_registrations;
CREATE POLICY "Users create own registrations" ON public.course_registrations
  FOR INSERT WITH CHECK ((auth.uid() = user_id OR user_id IS NULL) AND status = 'pending');

DROP POLICY IF EXISTS "Users create logistics" ON public.logistics_requests;
CREATE POLICY "Users create logistics" ON public.logistics_requests
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND status = 'pending'
    AND assigned_driver_id IS NULL AND picked_up_at IS NULL AND delivered_at IS NULL
    AND proof_url IS NULL AND driver_note IS NULL AND coalesce(estimated_price, 0) = 0
  );

DROP POLICY IF EXISTS "Users create packaging" ON public.packaging_requests;
CREATE POLICY "Users create packaging" ON public.packaging_requests
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND status = 'pending'
    AND assigned_driver_id IS NULL AND delivered_at IS NULL
    AND proof_url IS NULL AND driver_note IS NULL
  );

DROP POLICY IF EXISTS "Owner creates support" ON public.support_requests;
CREATE POLICY "Owner creates support" ON public.support_requests
  FOR INSERT WITH CHECK (auth.uid() = business_id AND status = 'open' AND admin_feedback IS NULL);

-- ============== SELLER APPROVAL ==============
-- One step on the server: the application, the seller role and the notice
-- change together (they were two unchecked writes from the browser).
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

  UPDATE public.seller_applications
  SET status = 'approved', rejection_reason = NULL
  WHERE id = v_app.id;
  UPDATE public.profiles
  SET role = 'seller', business_name = v_app.business_name
  WHERE user_id = v_app.user_id;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (v_app.user_id, 'Seller account approved',
          'You can now list products on the Isoko marketplace.', 'success', '/seller');
END $$;

-- ============== ORDER STATUS ==============
-- Sellers no longer update orders directly. They move an order forward with
-- seller_set_order_status(); only the buyer (confirm_delivery) or an admin can
-- mark it delivered, which is what payouts depend on.
DROP POLICY IF EXISTS "Sellers can update order status" ON public.orders;

-- Accepts the shipment steps sellers use and maps them onto the order statuses:
--   packed → processing; in_transit, out_for_delivery, delivered → shipped
-- (a seller's "delivered" stays "shipped" until the buyer confirms).
CREATE OR REPLACE FUNCTION public.seller_set_order_status(p_order_id uuid, p_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders;
  v_target text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR (v_order.seller_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501';
  END IF;

  v_target := CASE p_status
    WHEN 'processing' THEN 'processing'
    WHEN 'packed' THEN 'processing'
    WHEN 'shipped' THEN 'shipped'
    WHEN 'in_transit' THEN 'shipped'
    WHEN 'out_for_delivery' THEN 'shipped'
    WHEN 'delivered' THEN 'shipped'
    WHEN 'cancelled' THEN 'cancelled'
  END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Unknown order status' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    IF v_order.status = v_target THEN RETURN v_target; END IF;
    RAISE EXCEPTION 'This order is % and can no longer be changed', v_order.status USING ERRCODE = '22023';
  END IF;
  IF v_target = 'shipped' AND v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Ship the order once Isoko has confirmed the buyer''s payment' USING ERRCODE = '22023';
  END IF;
  IF v_target = 'cancelled' AND v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This order is paid. Contact Isoko to cancel and refund it' USING ERRCODE = '22023';
  END IF;
  IF v_target = 'processing' AND v_order.status = 'shipped' THEN
    RETURN v_order.status; -- never move backwards
  END IF;

  IF v_order.status IS DISTINCT FROM v_target THEN
    UPDATE public.orders SET status = v_target WHERE id = v_order.id;
  END IF;
  RETURN v_target;
END $$;

-- ============== PAYOUTS ==============
-- Same as before (only the buyer or an admin can now set 'delivered'), plus a
-- row lock against double requests and a checked payout method.
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
  WHERE id = p_order_id AND seller_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'The buyer''s payment has not been confirmed yet';
  END IF;
  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'Only delivered orders can be paid out';
  END IF;
  IF coalesce(p_payout_method, 'momo') NOT IN ('momo', 'bank') THEN
    RAISE EXCEPTION 'Unsupported payout method';
  END IF;
  IF coalesce(trim(p_payout_destination), '') = '' OR length(trim(p_payout_destination)) > 200 THEN
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
  -- Orders from before place_order() may have no commission row
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

-- ============== FUNCTION PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.approve_seller_application(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seller_set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_seller_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_set_order_status(uuid, text) TO authenticated;

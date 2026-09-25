-- Module fixes: marketplace stock and states, payouts, logistics, packaging,
-- and subscription-only E-Library and Entertainment content
--
-- MARKETPLACE. Orders never checked or reduced stock (50 of an item with 1 in
-- stock went through), a buyer could buy their own product, sellers could put
-- back a product an admin took down, and a cancelled order could be reopened.
-- PAYOUTS. A paid or rejected payout could be edited again, amounts included.
-- LOGISTICS. Drivers could set any status (e.g. back to pending, or delivered
-- without proof), and history was only the current status; shipment tracking
-- entries could be deleted.
-- PACKAGING. The request form sent a packaging type the table didn't have, so
-- every request failed.
-- LIBRARY. E-Library and Entertainment are for subscribers, but the files were
-- in public buckets: anyone with (or guessing) a link could download them.

-- ============== MARKETPLACE: STOCK ==============
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_not_negative CHECK (stock >= 0) NOT VALID,
  ADD CONSTRAINT products_price_not_negative CHECK (price >= 0) NOT VALID;

-- As before, plus: items are reserved from stock under a lock (two buyers
-- can't both get the last one), and sellers can't buy their own products.
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
  v_short record;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to place an order' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;
  IF coalesce(trim(p_shipping_address), '') = '' OR length(p_shipping_address) > 500 THEN
    RAISE EXCEPTION 'Shipping address required';
  END IF;
  IF p_payment_method NOT IN ('momo', 'bank') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF length(coalesce(trim(p_payment_reference), '')) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Enter the payment reference or transaction ID';
  END IF;

  -- One line per product (the same product twice adds up)
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.cart (product_id uuid PRIMARY KEY, quantity integer) ON COMMIT DROP;
  DELETE FROM pg_temp.cart;
  INSERT INTO pg_temp.cart
  SELECT i.product_id, sum(i.quantity)
  FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
  GROUP BY i.product_id;
  IF EXISTS (SELECT 1 FROM pg_temp.cart WHERE product_id IS NULL OR quantity IS NULL OR quantity < 1 OR quantity > 10000) THEN
    RAISE EXCEPTION 'Some items in your cart are no longer available';
  END IF;

  -- Lock the products in a fixed order, then check them
  PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM pg_temp.cart) ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM pg_temp.cart c LEFT JOIN public.products p ON p.id = c.product_id AND p.status = 'active'
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some items in your cart are no longer available';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.cart c JOIN public.products p ON p.id = c.product_id WHERE p.seller_id = v_uid) THEN
    RAISE EXCEPTION 'You can''t buy your own products';
  END IF;
  SELECT p.name, p.stock INTO v_short
  FROM pg_temp.cart c JOIN public.products p ON p.id = c.product_id
  WHERE c.quantity > p.stock ORDER BY p.name LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '%', CASE WHEN v_short.stock = 0 THEN v_short.name || ' is out of stock'
                              ELSE 'Only ' || v_short.stock || ' of ' || v_short.name || ' left' END;
  END IF;

  UPDATE public.products p SET stock = p.stock - c.quantity
  FROM pg_temp.cart c WHERE p.id = c.product_id;

  -- One order per seller, as before
  FOR v_seller IN
    SELECT DISTINCT p.seller_id FROM pg_temp.cart c JOIN public.products p ON p.id = c.product_id
  LOOP
    SELECT sum(p.price * c.quantity) INTO v_total
    FROM pg_temp.cart c JOIN public.products p ON p.id = c.product_id
    WHERE p.seller_id = v_seller;

    INSERT INTO public.orders (
      buyer_id, seller_id, total_amount, shipping_address, status,
      payment_status, payment_method, payment_reference
    ) VALUES (
      v_uid, v_seller, v_total, trim(p_shipping_address), 'pending',
      'awaiting_confirmation', p_payment_method, trim(p_payment_reference)
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    SELECT v_order_id, p.id, c.quantity, p.price
    FROM pg_temp.cart c JOIN public.products p ON p.id = c.product_id
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

-- A cancelled order gives its items back to stock, and can't be reopened
-- (that would sell the items twice); place a new order instead.
CREATE OR REPLACE FUNCTION public.order_cancel_restock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled order can''t be reopened. Place a new order instead.' USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p SET stock = p.stock + oi.quantity
    FROM public.order_items oi WHERE oi.order_id = NEW.id AND p.id = oi.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_cancel_restock BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_cancel_restock();

-- Admins couldn't read other sellers' inactive products, so taking a product
-- down failed ("new row violates row-level security") and hidden products
-- vanished from the admin list
CREATE POLICY "Admins view all products" ON public.products
  FOR SELECT TO authenticated USING (public.is_admin());

-- Sellers edit their listing; its status (an admin taking it down) is not theirs
CREATE TRIGGER products_editable_columns
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns(
    'name', 'description', 'price', 'category', 'image_url', 'stock', 'updated_at'
  );

-- ============== PAYOUTS ==============
-- A payout request is decided once: pending -> paid or rejected. The amounts,
-- seller, order and destination never change after the request.
CREATE OR REPLACE FUNCTION public.payout_decision_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.seller_id, NEW.order_id, NEW.gross_amount, NEW.commission_amount, NEW.net_amount, NEW.payout_method, NEW.payout_destination)
     IS DISTINCT FROM
     (OLD.seller_id, OLD.order_id, OLD.gross_amount, OLD.commission_amount, OLD.net_amount, OLD.payout_method, OLD.payout_destination) THEN
    RAISE EXCEPTION 'A payout''s amounts and destination can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This payout was already %', OLD.status USING ERRCODE = '22023';
    END IF;
    IF NEW.status NOT IN ('paid', 'rejected') THEN
      RAISE EXCEPTION 'A payout is either paid or rejected' USING ERRCODE = '22023';
    END IF;
    IF NEW.status = 'paid' THEN
      NEW.paid_at := coalesce(NEW.paid_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payout_decision_guard BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.payout_decision_guard();

-- ============== LOGISTICS ==============
-- Drivers move a job forward only: assigned -> in_progress (picked up) ->
-- delivered, and delivered needs a proof photo. Admins may set any status.
CREATE OR REPLACE FUNCTION public.driver_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) NOT IN (('assigned', 'in_progress'), ('in_progress', 'delivered'), ('assigned', 'delivered')) THEN
    RAISE EXCEPTION 'A delivery can''t go from % to %', OLD.status, NEW.status USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'delivered' AND coalesce(NEW.proof_url, '') = '' THEN
    RAISE EXCEPTION 'Add a proof of delivery photo first' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER driver_status_guard BEFORE UPDATE OF status ON public.logistics_requests
  FOR EACH ROW EXECUTE FUNCTION public.driver_status_guard();
CREATE TRIGGER driver_status_guard BEFORE UPDATE OF status ON public.packaging_requests
  FOR EACH ROW EXECUTE FUNCTION public.driver_status_guard();

-- Every status a delivery or packaging request goes through, never rewritten.
-- The customer, the assigned driver and admins can read it.
CREATE TABLE public.request_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_table text NOT NULL CHECK (request_table IN ('logistics_requests', 'packaging_requests')),
  request_id uuid NOT NULL,
  status text NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_status_history_request_idx ON public.request_status_history (request_table, request_id, id);
ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customer, driver and admins read the history" ON public.request_status_history
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR (request_table = 'logistics_requests' AND EXISTS (SELECT 1 FROM public.logistics_requests r
        WHERE r.id = request_id AND (r.user_id = auth.uid() OR r.assigned_driver_id = auth.uid())))
    OR (request_table = 'packaging_requests' AND EXISTS (SELECT 1 FROM public.packaging_requests r
        WHERE r.id = request_id AND (r.user_id = auth.uid() OR r.assigned_driver_id = auth.uid())))
  );
REVOKE ALL ON public.request_status_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.request_status_history TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_request_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.request_status_history (request_table, request_id, status, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER record_status AFTER INSERT OR UPDATE OF status ON public.logistics_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_request_status();
CREATE TRIGGER record_status AFTER INSERT OR UPDATE OF status ON public.packaging_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_request_status();

-- Existing requests start their history with where they are now
INSERT INTO public.request_status_history (request_table, request_id, status, created_at)
SELECT 'logistics_requests', id, status, updated_at FROM public.logistics_requests;
INSERT INTO public.request_status_history (request_table, request_id, status, created_at)
SELECT 'packaging_requests', id, status, updated_at FROM public.packaging_requests;

-- The history can't be edited or deleted, nor can shipment tracking entries
CREATE OR REPLACE FUNCTION public.append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is a history: entries can''t be changed or deleted', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.request_status_history
  FOR EACH ROW EXECUTE FUNCTION public.append_only();
DROP POLICY IF EXISTS "Admin delete tracking logs" ON public.tracking_logs;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.tracking_logs
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- ============== PACKAGING ==============
ALTER TABLE public.packaging_requests
  ADD COLUMN IF NOT EXISTS packaging_type text CHECK (length(packaging_type) <= 100);

-- ============== E-LIBRARY AND ENTERTAINMENT: SUBSCRIBERS ONLY ==============
-- The same rule as the website: the latest subscription is a trial still
-- running or an active plan not yet expired. Admins always.
CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR coalesce((
    SELECT (s.status = 'trial' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now()))
        OR (s.status = 'active' AND s.expires_at > now())
    FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
    ORDER BY s.created_at DESC LIMIT 1
  ), false);
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;

UPDATE storage.buckets SET public = false WHERE id IN ('books', 'entertainment');
DROP POLICY IF EXISTS "Books public read" ON storage.objects;
DROP POLICY IF EXISTS "Entertainment public read" ON storage.objects;
CREATE POLICY "Subscribers read library files" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id IN ('books', 'entertainment') AND public.has_active_subscription()
  );

-- The tables kept public addresses of the files; keep just the paths, the
-- website asks for short-lived links
UPDATE public.books
SET cover_url = regexp_replace(cover_url, '^.*/storage/v1/object/public/books/', '')
WHERE cover_url LIKE '%/storage/v1/object/public/books/%';
UPDATE public.books
SET content_url = regexp_replace(content_url, '^.*/storage/v1/object/public/books/', '')
WHERE content_url LIKE '%/storage/v1/object/public/books/%';
UPDATE public.entertainment
SET cover_url = regexp_replace(cover_url, '^.*/storage/v1/object/public/entertainment/', '')
WHERE cover_url LIKE '%/storage/v1/object/public/entertainment/%';
UPDATE public.entertainment
SET media_url = regexp_replace(media_url, '^.*/storage/v1/object/public/entertainment/', '')
WHERE media_url LIKE '%/storage/v1/object/public/entertainment/%';

-- ============== DELETING AN ACCOUNT ==============
-- Deleting someone's account clears their id from the financial records they
-- touched (ON DELETE SET NULL), which the finance guard refused, so accounts
-- that ever confirmed or made a payment couldn't be deleted. That one change
-- is now allowed; everything else stays locked, and the audit log keeps who
-- did what.
CREATE OR REPLACE FUNCTION public.finance_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  people text[] := ARRAY['created_by', 'confirmed_by', 'reviewed_by', 'submitted_by', 'customer_user_id'];
BEGIN
  -- Website and service-role sessions never write directly; the finance
  -- functions run as their owner and switch the flag on first.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'finance_ledger'
     AND current_user NOT IN ('anon', 'authenticated', 'service_role')
     AND current_setting('isoko.finance_internal', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- A deleted account: only person references become empty
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND (to_jsonb(NEW) - people) = (to_jsonb(OLD) - people)
     AND NOT EXISTS (SELECT 1 FROM unnest(people) c
                     WHERE to_jsonb(NEW) -> c IS DISTINCT FROM to_jsonb(OLD) -> c AND to_jsonb(NEW) ->> c IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Financial records can''t be changed or deleted directly. Use a refund, void or adjustment.'
    USING ERRCODE = '42501';
END $$;

-- ============== FUNCTION PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.order_cancel_restock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payout_decision_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.driver_status_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_request_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_only() FROM PUBLIC, anon, authenticated;

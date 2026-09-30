-- Site settings admins edit from the Admin page (Settings tab), instead of the
-- company's details living in the website's code:
--
--   company name, email, phones, address and map location; the WhatsApp numbers of the
--   office and the ICT team; the MoMo code and the account name; the bank
--   account; social media links; the marketplace commission; and the
--   subscription prices and trial length (already settings).
--
-- Each value is seeded with what the site showed until now, so nothing changes
-- until an admin edits it. site_settings() gives the website only these public
-- values (never site_url or the rate limits); check_platform_setting refuses
-- values that would break the site (a price of "abc", a 300% commission, a
-- social link that isn't https); every change is in the audit log with who made it.
--
-- place_order now charges the commission set here (it was fixed at 7% in
-- code), and no longer runs a DELETE without WHERE, which Supabase's API
-- refuses ("DELETE requires a WHERE clause"): checkout from the website failed.

-- ============== THE VALUES ==============
INSERT INTO public.platform_settings (key, value) VALUES
  ('company_name', 'ISOKO GROUPS COMPANY LTD'),
  ('company_email', 'isokogrou93@gmail.com'),
  ('company_phones', '["0788 481 648", "0793 736 574", "0790 176 547"]'),
  ('company_address', 'Kimironko, KG 15 Ave (around the market), Kigali'),
  -- what Google Maps searches for (the map on the site and its "Open in Google Maps" link)
  ('company_map_query', 'Kimironko Market, KG 15 Ave, Kigali'),
  ('whatsapp_office', '250788481648'),
  ('whatsapp_ict', '250790176547'),
  ('company_momo_code', '*182*8*1*871951#'),
  ('momo_account_name', 'ISOKO GROUPS COMPANY LTD'),
  ('momo_label', 'Mobile Money (MTN MoMo)'),
  ('bank_name', 'BANQUE POPULAIRE DU RWANDA(KCB)'),
  ('bank_account_number', '4491099561'),
  ('bank_account_name', 'ISOKO GROUPS COMPANY LTD'),
  ('bank_swift', ''),
  ('social_links', '[
    {"network": "youtube", "label": "ISOKO ENTERTAINMENT", "url": "https://youtu.be/KjN65T1qA7c?si=8RPTzXJNhZI1b3Bs"},
    {"network": "youtube", "label": "Isoko Group", "url": "https://youtube.com/shorts/2zXVi01BI9s?si=ly0LXTSTdbTkWYJk"},
    {"network": "youtube", "label": "Isoko Studioz", "url": "https://youtube.com/shorts/SRKsJk6D8aY?si=uhQ0Xgu3dqUvsZ6h"},
    {"network": "instagram", "label": "Star Wax", "url": "https://www.instagram.com/p/DXv9vurjI45/?igsh=dTg1OTk0ODlpZGNp"},
    {"network": "instagram", "label": "Isoko Studioz", "url": "https://www.instagram.com/p/DU0vkdpDete/?igsh=MWp2cHVkYzVxdTZlaw=="},
    {"network": "instagram", "label": "Isoko Group Logistics", "url": "https://www.instagram.com/reel/DWvjvOkCE8p/?igsh=MTQwNmd5eWZ2c2FkZA=="},
    {"network": "instagram", "label": "Isoko Group Ltd", "url": "https://www.instagram.com/isokogrou?igsh=bXM1OHpndno0Y3Bv"},
    {"network": "tiktok", "label": "Isoko Group Ltd", "url": "https://vt.tiktok.com/ZS9a6kw2e/"},
    {"network": "tiktok", "label": "Isoko Studioz", "url": "https://vt.tiktok.com/ZS9aMNuVe/"},
    {"network": "tiktok", "label": "Isoko Movie", "url": "https://vt.tiktok.com/ZS9aMx5rj/"}
  ]'),
  ('marketplace_commission_percent', '7')
ON CONFLICT (key) DO NOTHING;

-- ============== CHECKS ==============
CREATE OR REPLACE FUNCTION public.check_platform_setting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v text := btrim(coalesce(NEW.value, ''));
  j jsonb;
  item jsonb;
BEGIN
  NEW.value := v;
  CASE NEW.key
    WHEN 'subscription_trial_minutes' THEN
      IF v !~ '^[0-9]+$' OR v::int NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The trial is a whole number of minutes, 1 to 1440';
      END IF;
    WHEN 'subscription_first_week_price', 'subscription_monthly_price' THEN
      IF v !~ '^[0-9]+$' OR v::int NOT BETWEEN 1 AND 10000000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A price is a whole number of RWF, at least 1';
      END IF;
    WHEN 'subscription_first_period_days' THEN
      IF v !~ '^[0-9]+$' OR v::int NOT BETWEEN 1 AND 366 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The first paid period is 1 to 366 days';
      END IF;
    WHEN 'subscription_period_months' THEN
      IF v !~ '^[0-9]+$' OR v::int NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The monthly period is 1 to 12 months';
      END IF;
    WHEN 'marketplace_commission_percent' THEN
      IF v !~ '^[0-9]+(\.[0-9]{1,2})?$' OR v::numeric > 50 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The commission is a percentage from 0 to 50';
      END IF;
    WHEN 'company_email' THEN
      IF v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter a valid email address';
      END IF;
    WHEN 'whatsapp_office', 'whatsapp_ict' THEN
      -- international format without "+", as wa.me links need it
      NEW.value := regexp_replace(v, '[^0-9]', '', 'g');
      IF NEW.value !~ '^[1-9][0-9]{8,14}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the WhatsApp number with its country code, e.g. 250788123456';
      END IF;
    WHEN 'company_phones' THEN
      BEGIN
        j := v::jsonb;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Phones must be a list';
      END;
      IF jsonb_typeof(j) <> 'array' OR jsonb_array_length(j) > 10
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 6 AND 30) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter up to 10 phone numbers';
      END IF;
    WHEN 'social_links' THEN
      BEGIN
        j := v::jsonb;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Social links must be a list';
      END;
      IF jsonb_typeof(j) <> 'array' OR jsonb_array_length(j) > 30 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter up to 30 social links';
      END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(j) LOOP
        IF jsonb_typeof(item) <> 'object'
           OR coalesce(item ->> 'network', '') NOT IN ('youtube', 'instagram', 'tiktok', 'facebook', 'x', 'linkedin', 'whatsapp', 'other')
           OR length(coalesce(item ->> 'label', '')) NOT BETWEEN 1 AND 60
           OR coalesce(item ->> 'url', '') !~ '^https://' THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each social link needs a network, a name and an https:// address';
        END IF;
      END LOOP;
    WHEN 'company_name', 'company_address', 'company_map_query', 'momo_account_name', 'momo_label', 'bank_name', 'bank_account_name', 'company_momo_code' THEN
      IF length(v) NOT BETWEEN 2 AND 200 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This value is required (up to 200 characters)';
      END IF;
    WHEN 'bank_account_number', 'bank_swift' THEN
      IF length(v) > 40 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This value is too long';
      END IF;
    ELSE
      NULL; -- other keys (site_url, mobile_money, ...) keep their own rules
  END CASE;
  RETURN NEW;
END $$;
CREATE TRIGGER check_platform_setting BEFORE INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.check_platform_setting();
REVOKE EXECUTE ON FUNCTION public.check_platform_setting() FROM PUBLIC, anon, authenticated;

-- Every change to a setting is in the audit log
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ============== WHAT THE WEBSITE READS ==============
CREATE OR REPLACE FUNCTION public.site_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(key,
    CASE WHEN key IN ('company_phones', 'social_links') THEN coalesce(value, '[]')::jsonb ELSE to_jsonb(value) END), '{}'::jsonb)
  FROM public.platform_settings
  WHERE key IN ('company_name', 'company_email', 'company_phones', 'company_address', 'company_map_query',
                'whatsapp_office', 'whatsapp_ict', 'company_momo_code', 'momo_account_name', 'momo_label',
                'bank_name', 'bank_account_number', 'bank_account_name', 'bank_swift', 'social_links',
                'marketplace_commission_percent', 'subscription_trial_minutes', 'subscription_first_week_price',
                'subscription_first_period_days', 'subscription_monthly_price', 'subscription_period_months');
$$;
REVOKE EXECUTE ON FUNCTION public.site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_settings() TO anon, authenticated;

-- ============== CHECKOUT ==============
-- As in 20260925150000_module_fixes.sql, with the two changes above
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_shipping_address text,
  p_payment_method text,
  p_payment_reference text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- the commission admins set (Settings), 7% unless changed
  v_rate numeric := public.setting_number('marketplace_commission_percent', 7) / 100;
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
  -- (a WHERE clause: the API refuses a DELETE without one)
  DELETE FROM pg_temp.cart WHERE true;
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


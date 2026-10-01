-- The Seller Registration and Compliance Agreement (company document, 2026-10-01)
--
-- Before selling on ISOKO a seller gives their full name, telephone, email,
-- country, business name, TIN, business address and bank / mobile money
-- payout details, and agrees to the Seller Registration and Compliance
-- Agreement (the site shows it at /seller-agreement). This migration:
--
--   * stores those details on the seller application, which is the seller's
--     record. The payout details are private seller information: only the
--     seller and admins read seller_applications (existing policy), never
--     customers (section 7);
--   * requires the agreement when a seller applies: the application names
--     the agreement version it accepts and the server stamps the time
--     (section 11). Sellers approved before this accept it from their
--     dashboard (accept_seller_agreement);
--   * lets a seller keep their details up to date (section 9) with
--     update_seller_details; name, business and phone were already editable;
--   * gives a product up to four images (section 2). image_url stays the
--     first of them, so every page that shows one image keeps working;
--   * sellers could already edit price and stock (products_editable_columns,
--     section 5); the dashboard now has the controls.

-- ============== THE AGREEMENT ==============
-- Bump this (and SELLER_AGREEMENT_VERSION in src/lib/sellerAgreement.ts)
-- when the agreement text changes; sellers then accept it again.
CREATE OR REPLACE FUNCTION public.seller_agreement_version()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-10-01' $$;

ALTER TABLE public.seller_applications
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS tin text,
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_account text,
  ADD COLUMN IF NOT EXISTS payment_account_name text,
  ADD COLUMN IF NOT EXISTS agreement_version text,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz;

ALTER TABLE public.seller_applications
  ADD CONSTRAINT seller_applications_details_length CHECK (
    length(coalesce(country, '')) <= 60
    AND length(coalesce(tin, '')) <= 30
    AND length(coalesce(business_address, '')) <= 300
    AND length(coalesce(payment_provider, '')) <= 60
    AND length(coalesce(payment_account, '')) <= 60
    AND length(coalesce(payment_account_name, '')) <= 100
    AND length(coalesce(agreement_version, '')) <= 20
  ),
  ADD CONSTRAINT seller_applications_agreement_pair CHECK (
    (agreement_version IS NULL) = (agreement_accepted_at IS NULL)
  );

-- The details a seller must give (sections 1 and 7), trimmed
CREATE OR REPLACE FUNCTION public.check_seller_details(
  p_country text, p_tin text, p_business_address text,
  p_payment_provider text, p_payment_account text, p_payment_account_name text
) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF coalesce(trim(p_country), '') = '' THEN
    RAISE EXCEPTION 'Country is required' USING ERRCODE = '23514';
  END IF;
  IF coalesce(trim(p_tin), '') = '' OR trim(p_tin) !~ '^[A-Za-z0-9 /-]{5,30}$' THEN
    RAISE EXCEPTION 'A valid TIN (Tax Identification Number) is required' USING ERRCODE = '23514';
  END IF;
  IF length(coalesce(trim(p_business_address), '')) < 3 THEN
    RAISE EXCEPTION 'Business address / location is required' USING ERRCODE = '23514';
  END IF;
  IF coalesce(trim(p_payment_provider), '') = '' THEN
    RAISE EXCEPTION 'Bank / Mobile Money provider is required' USING ERRCODE = '23514';
  END IF;
  IF coalesce(trim(p_payment_account), '') = '' OR trim(p_payment_account) !~ '^[A-Za-z0-9 +/-]{6,60}$' THEN
    RAISE EXCEPTION 'A valid account / Mobile Money number is required' USING ERRCODE = '23514';
  END IF;
  IF length(coalesce(trim(p_payment_account_name), '')) < 3 THEN
    RAISE EXCEPTION 'Account holder name is required' USING ERRCODE = '23514';
  END IF;
END $$;

-- A seller's own application carries their agreement and their details.
-- Staff and scripts (not anon/authenticated) are not the seller signing.
CREATE OR REPLACE FUNCTION public.seller_application_agreement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.agreement_version IS DISTINCT FROM public.seller_agreement_version() THEN
    RAISE EXCEPTION 'Please read and accept the Seller Registration and Compliance Agreement'
      USING ERRCODE = '23514', HINT = 'seller_agreement_required';
  END IF;
  NEW.agreement_accepted_at := now();   -- the server's clock, never the browser's
  PERFORM public.check_seller_details(NEW.country, NEW.tin, NEW.business_address,
                                      NEW.payment_provider, NEW.payment_account, NEW.payment_account_name);
  NEW.country := trim(NEW.country);
  NEW.tin := trim(NEW.tin);
  NEW.business_address := trim(NEW.business_address);
  NEW.payment_provider := trim(NEW.payment_provider);
  NEW.payment_account := trim(NEW.payment_account);
  NEW.payment_account_name := trim(NEW.payment_account_name);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.seller_application_agreement() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS seller_application_agreement ON public.seller_applications;
CREATE TRIGGER seller_application_agreement BEFORE INSERT ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.seller_application_agreement();

-- Sellers from before this agreement accept it from their dashboard
CREATE OR REPLACE FUNCTION public.accept_seller_agreement()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  UPDATE public.seller_applications
  SET agreement_version = public.seller_agreement_version(), agreement_accepted_at = v_at, updated_at = v_at
  WHERE id = (SELECT id FROM public.seller_applications WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Apply to become a seller first' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object('application_id', v_id,
                            'agreement_version', public.seller_agreement_version(),
                            'agreement_accepted_at', v_at);
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_seller_agreement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_seller_agreement() TO authenticated;

-- Section 9: the seller keeps their country, TIN, address and payout details
-- up to date. It changes their latest application, whatever its status.
CREATE OR REPLACE FUNCTION public.update_seller_details(
  p_country text, p_tin text, p_business_address text,
  p_payment_provider text, p_payment_account text, p_payment_account_name text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  PERFORM public.check_seller_details(p_country, p_tin, p_business_address,
                                      p_payment_provider, p_payment_account, p_payment_account_name);
  UPDATE public.seller_applications
  SET country = trim(p_country), tin = trim(p_tin), business_address = trim(p_business_address),
      payment_provider = trim(p_payment_provider), payment_account = trim(p_payment_account),
      payment_account_name = trim(p_payment_account_name), updated_at = now()
  WHERE id = (SELECT id FROM public.seller_applications WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Apply to become a seller first' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object('application_id', v_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.update_seller_details(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_seller_details(text, text, text, text, text, text) TO authenticated;

-- ============== PRODUCTS: UP TO FOUR IMAGES ==============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.products
  ADD CONSTRAINT products_max_four_images CHECK (cardinality(image_urls) <= 4);

-- image_url is always the first image: the marketplace, cart and admin pages
-- read it. A client that still writes only image_url replaces the first image.
CREATE OR REPLACE FUNCTION public.products_sync_images()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.image_urls := array_remove(array_remove(coalesce(NEW.image_urls, '{}'), NULL), '');
  IF TG_OP = 'UPDATE' AND NEW.image_url IS DISTINCT FROM OLD.image_url AND NEW.image_urls = OLD.image_urls THEN
    NEW.image_urls := CASE WHEN NEW.image_url IS NULL THEN NEW.image_urls[2:]
                           ELSE ARRAY[NEW.image_url] || NEW.image_urls[2:] END;
  ELSIF cardinality(NEW.image_urls) = 0 AND NEW.image_url IS NOT NULL THEN
    NEW.image_urls := ARRAY[NEW.image_url];
  END IF;
  NEW.image_url := NEW.image_urls[1];
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.products_sync_images() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS products_sync_images ON public.products;
CREATE TRIGGER products_sync_images BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_images();

UPDATE public.products SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(image_urls) = 0;

-- Sellers edit their listing, now including its images (status stays staff's)
DROP TRIGGER IF EXISTS products_editable_columns ON public.products;
CREATE TRIGGER products_editable_columns
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_columns(
    'name', 'description', 'price', 'category', 'image_url', 'image_urls', 'stock', 'updated_at'
  );

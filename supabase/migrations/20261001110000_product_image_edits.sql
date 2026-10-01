-- Sellers edit a listed product's images (Seller Agreement, section 2: at most four)
--
-- 20261001100000 gave products image_urls (at most four; image_url is always
-- the first). Sellers now add, remove, replace and reorder them from their
-- dashboard, so the same trigger also checks what a seller saves:
--
--   * every image a seller adds is a file in the product-images bucket, in
--     their own folder (the bucket's policies already let only them write
--     there): no hotlinks to other sites, no other seller's files, nothing
--     like "javascript:" or "data:";
--   * images already on the product (from before this, or set by staff) stay
--     as they are, so an older product with a picture from elsewhere still
--     takes stock and price edits;
--   * the same image is not listed twice.
--
-- Nothing else changes: a seller updates only their own products (RLS,
-- seller_id = auth.uid()), the status stays staff's (products_editable_columns)
-- and the four-image limit is the CHECK constraint from 20261001100000.

-- A file in the product-images bucket, in this seller's folder
CREATE OR REPLACE FUNCTION public.product_image_allowed(p_url text, p_seller_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_url IS NOT NULL AND length(p_url) <= 1000
     AND p_url ~ ('^https?://[^/?#]+/storage/v1/object/public/product-images/' || p_seller_id || '/[^?#]+$')
$$;

CREATE OR REPLACE FUNCTION public.products_sync_images()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_old text[] := CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.image_urls, '{}') ELSE '{}' END;
  v_clean text[] := '{}';
  v_url text;
BEGIN
  NEW.image_urls := array_remove(array_remove(coalesce(NEW.image_urls, '{}'), NULL), '');
  -- An older client that sets only image_url replaces the first image
  IF TG_OP = 'UPDATE' AND NEW.image_url IS DISTINCT FROM OLD.image_url AND NEW.image_urls = v_old THEN
    NEW.image_urls := CASE WHEN NEW.image_url IS NULL THEN NEW.image_urls[2:]
                           ELSE ARRAY[NEW.image_url] || NEW.image_urls[2:] END;
  -- A row with only image_url (older clients, older rows) gets it as its list;
  -- a seller clearing a list that had images means no images
  ELSIF cardinality(NEW.image_urls) = 0 AND NEW.image_url IS NOT NULL AND cardinality(v_old) = 0 THEN
    NEW.image_urls := ARRAY[NEW.image_url];
  END IF;
  -- Each image once, in the order given
  FOREACH v_url IN ARRAY NEW.image_urls LOOP
    IF NOT (v_url = ANY (v_clean)) THEN
      v_clean := v_clean || v_url;
    END IF;
  END LOOP;
  NEW.image_urls := v_clean;
  -- What a seller adds is a file they uploaded to Isoko
  IF current_user IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    FOREACH v_url IN ARRAY NEW.image_urls LOOP
      IF NOT (v_url = ANY (v_old)) AND NOT public.product_image_allowed(v_url, NEW.seller_id) THEN
        RAISE EXCEPTION 'Product images must be uploaded to Isoko from your seller dashboard'
          USING ERRCODE = '22023', HINT = 'product_image_not_uploaded';
      END IF;
    END LOOP;
  END IF;
  NEW.image_url := NEW.image_urls[1];
  RETURN NEW;
END $$;
-- (the trigger products_sync_images from 20261001100000 keeps calling it)

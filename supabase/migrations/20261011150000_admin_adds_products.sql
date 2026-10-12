-- An administrator may put Isoko's own products on the marketplace.
--
-- Until now nobody could, except a seller listing their own. The products
-- table has policies letting an admin read, change the status of and delete
-- every product on the site -- and none letting them create one. So the
-- person responsible for the marketplace could empty it and not fill it,
-- and the admin page has no form because a form would have been refused.
--
-- That looks like an oversight rather than a decision: the product-images
-- bucket was already written with `OR is_admin()` on upload, update and
-- delete, so somebody expected admins to handle product pictures. The table
-- never caught up.
--
-- What this does NOT allow is an admin listing a product under somebody
-- else's name. A seller lists their own goods from their own dashboard,
-- where their subscription is checked on every insert by
-- require_seller_access(); that trigger only fires when a person is listing
-- for themselves, so an admin acting on their behalf would walk straight
-- past it and could list for a seller who has stopped paying. Orders,
-- commissions and payouts all key on seller_id, so a product owned by the
-- wrong account sends somebody else's money somewhere else. Keeping the
-- admin to their own account keeps one person's goods one person's
-- responsibility.
CREATE POLICY "Admins create products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND seller_id = auth.uid());

-- Four images, and the database is what says so.
--
-- The limit is in the seller agreement the seller signed, and it was checked
-- in the seller's own page and nowhere else -- so it held only for people
-- going through that page, which the admin now is not. A rule that two
-- interfaces have to remember separately is a rule that drifts; this one is
-- now stated once, where neither can get past it.
ALTER TABLE public.products ADD CONSTRAINT products_at_most_four_images
  CHECK (image_urls IS NULL OR coalesce(array_length(image_urls, 1), 0) <= 4);

COMMENT ON CONSTRAINT products_at_most_four_images ON public.products IS
  'MAX_PRODUCT_IMAGES in src/lib/sellerAgreement.ts; the seller agreement promises it.';

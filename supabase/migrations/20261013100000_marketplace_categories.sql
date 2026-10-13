-- Marketplace categories, renamed, split and closed to a known list.
--
--   "Fashion"      -> "Fashion Hub"
--   "Food & Drink" -> "Food" (edible) and "Beverages" (drinkable)
--   new: "Beauty & Cosmetics", "Health & Pharmaceuticals", "Construction Materials"
--
-- Buyers filter on an exact category match, so a product in an unknown category
-- silently disappears from every tab but "All". Products are inserted straight
-- from the browser under RLS and there is no server to validate them, so the
-- list is held by a CHECK constraint here; src/lib/productCategories.ts is the
-- same list for the UI and the two must be changed together.

-- Existing rows first, so they land in the new tabs instead of vanishing.
UPDATE public.products SET category = 'Fashion Hub' WHERE category = 'Fashion';

-- The old combined bucket can't be split by machine: match the drinkable ones
-- by name, and let the rest fall to Food. A seller can re-pick the category.
UPDATE public.products
SET category = 'Beverages'
WHERE category = 'Food & Drink'
  AND name ~* '(beverage|drink|juice|water|soda|beer|wine|spirit|liquor|whisk|vodka|gin|rum|tea|coffee|milk|smoothie|cola|cider|lemonade)';

UPDATE public.products SET category = 'Food' WHERE category = 'Food & Drink';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_known_category;

-- NOT VALID on purpose: every insert and update from now on must use a known
-- category, while any row predating this list is left alone rather than failing
-- the migration. Those rows show only under "All" until someone re-categorises
-- them, and the query in the comment below finds them.
ALTER TABLE public.products ADD CONSTRAINT products_known_category CHECK (
  category IN (
    'Electronics', 'Fashion Hub', 'Food', 'Beverages', 'Beauty & Cosmetics',
    'Health & Pharmaceuticals', 'Home', 'Construction Materials', 'Crafts', 'Accessories'
  )
) NOT VALID;

COMMENT ON CONSTRAINT products_known_category ON public.products IS
  'Categories the marketplace filters on (src/lib/productCategories.ts). NOT VALID: pre-existing rows are not rejected. Find them with: SELECT id, name, category FROM products WHERE category NOT IN (...).';

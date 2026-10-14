-- Packaging: an administrator may rename a line, and two categories are sold
-- by the bundle rather than by weight.
--
-- Both halves of this are the same complaint twice over -- the page is quoting
-- vocabulary that only a developer can change.
--
-- 1. NAMES. Nineteen of the forty-three lines are named after their own code:
--    "BD-PLY-BG-50", "ENV-12", "COR-BX-01". That is all the original array
--    carried, and a customer reading "BD-PLY-BG-50" learns nothing about what
--    it is. Whoever knows what these products are can now say so.
--
--    The original migration refused name changes on the grounds that a rename
--    would orphan the packaging requests quoting it. That is true of the
--    *code* and not of the name: a request stores a sentence composed when it
--    was made ("<category> - <name> (<code>) x 4 kg @ 3,600 RWF/kg = ..."), so
--    renaming a line today cannot rewrite what an old request says. The code,
--    the category and the unit stay fixed; only the name moves.
--
-- 2. BUNDLES. Biodegradable poly bags and seedling polypots are sold by the
--    bundle, not by the kilo, so every price on those two sections of the page
--    was quoted in the wrong unit. 'bundle' joins the units a line may carry,
--    and those two categories move to it.

-- ============== A LINE MAY BE SOLD BY THE BUNDLE ==============
ALTER TABLE public.packaging_products DROP CONSTRAINT IF EXISTS packaging_products_unit_check;
ALTER TABLE public.packaging_products ADD CONSTRAINT packaging_products_unit_check
  CHECK (unit IN ('pc', 'kg', 'bundle'));

-- The guard below is there to stop an ordinary mistake on the admin screen,
-- not to stop a migration that deliberately changes the vocabulary -- and it
-- fires for everybody, superuser included. So it stands down for these two
-- statements and is back on, in its new form, by the end of the file.
ALTER TABLE public.packaging_products DISABLE TRIGGER packaging_products_update;

UPDATE public.packaging_products
SET unit = 'bundle', updated_at = now()
WHERE category_id IN ('biodeg-polybags', 'biodeg-seedling');

ALTER TABLE public.packaging_products ENABLE TRIGGER packaging_products_update;

-- The heading above each section says how it is priced, and said kilos too.
UPDATE public.packaging_categories
SET note = 'Price per bundle'
WHERE id IN ('biodeg-polybags', 'biodeg-seedling');

-- ============== THE NAME MAY MOVE; THE CODE MAY NOT ==============
-- What this protects against is not a hostile admin but an ordinary mistake,
-- and the mistake worth refusing is a changed code: it is the name the page,
-- the order form and every past packaging request already agree on, and the
-- one thing a rename cannot be undone from. A product's name is display text
-- and a request keeps its own copy, so it is safe to let go of.
CREATE OR REPLACE FUNCTION public.packaging_price_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'A packaging line keeps its code, its category and its unit; the name, price, availability and order may be changed here'
      USING ERRCODE = '42501', HINT = 'packaging_identity_is_fixed';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

-- A trigger function is for the trigger, not for the website. This one has
-- been callable from the browser since it was written -- the blanket revoke
-- migration predates it, so it was never covered -- and redefining it is the
-- moment to close that. Nothing calls it directly; the trigger runs as the
-- table's owner either way.
REVOKE EXECUTE ON FUNCTION public.packaging_price_update() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.packaging_price_update() IS
  'Keeps a packaging line''s code, category and unit fixed while its name, price, availability and order are edited from the admin desk. The code is what past packaging requests quote.';

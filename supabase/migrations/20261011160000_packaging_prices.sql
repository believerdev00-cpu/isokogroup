-- Packaging prices an administrator can actually change.
--
-- The whole catalogue -- ten categories, forty-three products -- was a
-- literal array in src/pages/Packaging.tsx. Changing one figure meant
-- editing the page, rebuilding and deploying, which is not a thing the
-- person who sets prices can do. In a business where the price of plastic
-- waste moves with the market, that is the difference between a price list
-- and a photograph of one.
--
-- The rows below are the catalogue as it stands today, generated from that
-- array rather than retyped, so nothing moves on the day this ships. What
-- changes is who may change it afterwards.
--
-- Prices only, deliberately. Codes, names, units and categories are what the
-- page, the order form and the request records all agree on; letting those
-- drift from an admin screen is a bigger change than was asked for, and a
-- renamed code would orphan the packaging requests that already quote it.

CREATE TABLE public.packaging_categories (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  note text CHECK (length(note) <= 120),
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE public.packaging_products (
  code text PRIMARY KEY CHECK (length(code) BETWEEN 1 AND 60),
  category_id text NOT NULL REFERENCES public.packaging_categories (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  -- Rwandan francs, whole. A price of zero is a real answer ("ask us"), a
  -- negative one never is.
  price integer NOT NULL CHECK (price >= 0 AND price <= 100000000),
  unit text NOT NULL CHECK (unit IN ('pc', 'kg')),
  sort integer NOT NULL DEFAULT 0,
  -- A line taken off the list without losing the requests that quote it.
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
CREATE INDEX packaging_products_listing ON public.packaging_products (category_id, sort, code);

INSERT INTO public.packaging_categories (id, title, note, sort) VALUES
  ('reuse-pp-sakes', 'Reuse PP Woven Bags (Sakes)', 'Sold per piece (Pcs)', 0),
  ('reuse-corrboxes', 'Reuse CorrBoxes (Paper Cartons)', 'Price per kg', 1),
  ('plastic-waste', 'Plastic Waste', 'Price per kg', 2),
  ('paper-egg', 'Paper Roll & Egg Trays', NULL, 3),
  ('corrugated-boxes', 'Corrugated Boxes', 'Sold per piece', 4),
  ('paper-bags', 'Paper Bags (Envelopes)', 'Price per kg', 5),
  ('pp-woven-pcs', 'PP Woven Bags (Sakes)', 'Sold per piece', 6),
  ('biodeg-polybags', 'Biodegradable Poly Bags (Food grade)', 'Price per kg', 7),
  ('biodeg-seedling', 'Biodegradable Seedling PolyPots', 'Price per kg', 8),
  ('biodeg-grafting', 'Biodegradable Grafting Polythene', 'Single Layer • per kg', 9);

INSERT INTO public.packaging_products (code, category_id, name, price, unit, sort) VALUES
  ('USAK-100', 'reuse-pp-sakes', 'Used sakes — 100 kg', 130, 'pc', 0),
  ('USAK-50', 'reuse-pp-sakes', 'Used sakes — 50 kg', 110, 'pc', 1),
  ('USAK-25', 'reuse-pp-sakes', 'Used sakes — 25 kg', 90, 'pc', 2),
  ('RCB-STR-BIG', 'reuse-corrboxes', 'Strong CorrBoxes — Big', 350, 'kg', 0),
  ('RCB-STR-SML', 'reuse-corrboxes', 'Strong CorrBoxes — Small', 350, 'kg', 1),
  ('RCB-SFT-BIG', 'reuse-corrboxes', 'Soft CorrBoxes — Big', 350, 'kg', 2),
  ('RCB-SFT-SML', 'reuse-corrboxes', 'Soft CorrBoxes — Small', 350, 'kg', 3),
  ('PW-G1', 'plastic-waste', 'Plastic Waste — Grade 1', 250, 'kg', 0),
  ('PW-G2', 'plastic-waste', 'Plastic Waste — Grade 2', 120, 'kg', 1),
  ('PAPR', 'paper-egg', 'Paper roll', 800, 'kg', 0),
  ('EGGT', 'paper-egg', 'Egg trays', 200, 'pc', 1),
  ('COR-BX-01', 'corrugated-boxes', 'COR-BX-01', 3000, 'pc', 0),
  ('COR-BX-02', 'corrugated-boxes', 'COR-BX-02', 3400, 'pc', 1),
  ('COR-BX-03', 'corrugated-boxes', 'COR-BX-03', 3800, 'pc', 2),
  ('COR-BX-04', 'corrugated-boxes', 'COR-BX-04', 4300, 'pc', 3),
  ('ENV-01', 'paper-bags', 'ENV-01', 2400, 'kg', 0),
  ('ENV-02', 'paper-bags', 'ENV-02', 2300, 'kg', 1),
  ('ENV-03', 'paper-bags', 'ENV-03', 2200, 'kg', 2),
  ('ENV-05', 'paper-bags', 'ENV-05', 2100, 'kg', 3),
  ('ENV-08', 'paper-bags', 'ENV-08', 2000, 'kg', 4),
  ('ENV-10', 'paper-bags', 'ENV-10', 1900, 'kg', 5),
  ('ENV-12', 'paper-bags', 'ENV-12', 1800, 'kg', 6),
  ('ENV-14', 'paper-bags', 'ENV-14', 1800, 'kg', 7),
  ('ENV-16', 'paper-bags', 'ENV-16', 1800, 'kg', 8),
  ('ENV-25', 'paper-bags', 'ENV-25', 1800, 'kg', 9),
  ('ENV-50', 'paper-bags', 'ENV-50', 3800, 'kg', 10),
  ('PP-WVN-BG-100', 'pp-woven-pcs', 'PP-WVN-BG-100', 280, 'pc', 0),
  ('PP-WVN-BG-50', 'pp-woven-pcs', 'PP-WVN-BG-50', 220, 'pc', 1),
  ('PP-WVN-BG-25', 'pp-woven-pcs', 'PP-WVN-BG-25', 230, 'pc', 2),
  ('PP-WVN-BG-10', 'pp-woven-pcs', 'PP-WVN-BG-10', 115, 'pc', 3),
  ('PP-WVN-BG-05', 'pp-woven-pcs', 'PP-WVN-BG-05', 70, 'pc', 4),
  ('PP-WVN-BG-2.5', 'pp-woven-pcs', 'PP-WVN-BG-2.5', 65, 'pc', 5),
  ('BD-PLY-BG-50', 'biodeg-polybags', 'BD-PLY-BG-50', 3600, 'kg', 0),
  ('BD-PLY-BG-25', 'biodeg-polybags', 'BD-PLY-BG-25', 3200, 'kg', 1),
  ('BD-PLY-BG-2', 'biodeg-polybags', 'BD-PLY-BG-2', 2500, 'kg', 2),
  ('BD-PLY-BG-1', 'biodeg-polybags', 'BD-PLY-BG-1', 2200, 'kg', 3),
  ('BP-SD-PPT-1', 'biodeg-seedling', 'BP-SD-PPT-1', 2200, 'kg', 0),
  ('BP-SD-PPT-2', 'biodeg-seedling', 'BP-SD-PPT-2', 2100, 'kg', 1),
  ('BP-SD-PPT-3', 'biodeg-seedling', 'BP-SD-PPT-3', 2000, 'kg', 2),
  ('BP-SD-PPT-4', 'biodeg-seedling', 'BP-SD-PPT-4', 1900, 'kg', 3),
  ('BP-SD-PPT-5', 'biodeg-seedling', 'BP-SD-PPT-5', 1800, 'kg', 4),
  ('BD-GP-1', 'biodeg-grafting', 'BD-GP-1 (Single Layer)', 1000, 'kg', 0),
  ('BD-GP-2', 'biodeg-grafting', 'BD-GP-2 (Single Layer)', 7500, 'kg', 1);

-- ============== WHO READS, WHO WRITES ==============
ALTER TABLE public.packaging_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_products ENABLE ROW LEVEL SECURITY;

-- The price list is the public face of the service; anyone may read it,
-- signed in or not, exactly as they could when it was in the page source.
CREATE POLICY "Anyone reads packaging categories" ON public.packaging_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone reads packaging prices" ON public.packaging_products FOR SELECT TO anon, authenticated USING (true);

-- Only an admin changes a price, and only a price: the editable-columns
-- trigger below is what stops a code or a category being rewritten from the
-- same screen.
CREATE POLICY "Admins change packaging prices" ON public.packaging_products FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage packaging categories" ON public.packaging_categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.packaging_categories, public.packaging_products FROM anon;

-- Nothing but the price, the availability and the ordering may move, and the
-- row records who moved it.
--
-- Not enforce_editable_columns, which the products table uses: that one
-- begins `IF ... OR public.is_admin() THEN RETURN NEW`, so on a table only
-- admins can write to it would never refuse anything. A guard that cannot
-- fire is worse than none, because it reads like protection.
--
-- What this protects against is not a hostile admin but an ordinary
-- mistake. A code is the name the page, the order form and every packaging
-- request already agree on; renaming one from a price screen would quietly
-- orphan the requests quoting it.
CREATE OR REPLACE FUNCTION public.packaging_price_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'Only the price, availability and order of a packaging line may be changed here'
      USING ERRCODE = '42501', HINT = 'packaging_identity_is_fixed';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

CREATE TRIGGER packaging_products_update BEFORE UPDATE ON public.packaging_products
  FOR EACH ROW EXECUTE FUNCTION public.packaging_price_update();

-- A price change is the kind of thing somebody asks about three months later.
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.packaging_products
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

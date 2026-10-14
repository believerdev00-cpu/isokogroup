-- Regression test for 20261011160000_packaging_prices.sql and
-- 20261013110000_packaging_names_and_bundles.sql (the packaging price list an
-- administrator edits):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/packaging_catalogue.test.sql
--
-- What matters here is the line between what an admin may change and what
-- they may not. A price and a name are display: wrong today, right tomorrow,
-- and a past request keeps its own copy of both. A code is the name the page,
-- the order form and every past packaging request agree on, and a changed one
-- cannot be traced back.
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000e601', 'pk-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e602', 'pk-user@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000e601', 'admin');

\set admin '''00000000-0000-4000-8000-00000000e601'''
\set user '''00000000-0000-4000-8000-00000000e602'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN false;
END $$;
CREATE FUNCTION pg_temp.line(p_code text) RETURNS public.packaging_products LANGUAGE sql AS $$
  SELECT * FROM public.packaging_products WHERE code = p_code;
$$;

-- ---------- What visitors see ----------
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, 'SELECT 1 FROM public.packaging_products'), 'the price list is public, signed in or not');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, 'SELECT 1 FROM public.packaging_categories'), 'and so are its headings');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$UPDATE public.packaging_products SET price = 1 WHERE code = 'BD-PLY-BG-50' RETURNING 1$$)
  OR (pg_temp.line('BD-PLY-BG-50')).price = 3600, 'a visitor cannot price anything');
SELECT pg_temp.expect(pg_temp.refused(:user, $$UPDATE public.packaging_products SET price = 1 WHERE code = 'BD-PLY-BG-50' RETURNING 1$$)
  OR (pg_temp.line('BD-PLY-BG-50')).price = 3600, 'nor can a signed-in customer');
SELECT pg_temp.expect((pg_temp.line('BD-PLY-BG-50')).price = 3600, '(the price has not moved)');

-- ---------- Sold by the bundle, not by the kilo ----------
SELECT pg_temp.expect((SELECT bool_and(unit = 'bundle') FROM public.packaging_products
  WHERE category_id IN ('biodeg-polybags', 'biodeg-seedling')), 'poly bags and seedling polypots are sold by the bundle');
SELECT pg_temp.expect((SELECT count(*) = 2 FROM public.packaging_categories
  WHERE id IN ('biodeg-polybags', 'biodeg-seedling') AND note = 'Price per bundle'), 'and both headings say so');
SELECT pg_temp.expect((SELECT bool_and(unit IN ('pc', 'kg')) FROM public.packaging_products
  WHERE category_id NOT IN ('biodeg-polybags', 'biodeg-seedling')), 'nothing else changed unit');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.packaging_products SET unit = 'crate' WHERE code = 'BD-PLY-BG-50'$$),
  'a unit nobody sells in is refused');

-- ---------- An admin may rename a line and reprice it ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.packaging_products
  SET name = 'Food-grade poly bags - 50 kg bundle', price = 3700 WHERE code = 'BD-PLY-BG-50'$$),
  'an admin renames a line and reprices it in one go');
SELECT pg_temp.expect((pg_temp.line('BD-PLY-BG-50')).name = 'Food-grade poly bags - 50 kg bundle'
  AND (pg_temp.line('BD-PLY-BG-50')).price = 3700, 'and both are stored');
SELECT pg_temp.expect((pg_temp.line('BD-PLY-BG-50')).updated_by::text = :admin, 'the row records who changed it');
-- audit_row_change records the columns that moved, not the whole row, so the
-- rename and the new price are what to look for.
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'packaging_products'
  AND actor_id::text = :admin AND new_data ->> 'name' = 'Food-grade poly bags - 50 kg bundle'
  AND new_data ->> 'price' = '3700'), 'and the audit log keeps the change, with who made it');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.packaging_products SET name = '' WHERE code = 'BD-PLY-BG-25'$$),
  'a line cannot be left nameless');

-- ---------- What an admin still may not change ----------
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.packaging_products SET code = 'BD-PLY-BG-500' WHERE code = 'BD-PLY-BG-25'$$),
  'the code is fixed: a past request quotes it');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.packaging_products SET category_id = 'plastic-waste' WHERE code = 'BD-PLY-BG-25'$$),
  'and so is the section it belongs to');
SELECT pg_temp.expect(pg_temp.refused(:admin, $$UPDATE public.packaging_products SET unit = 'kg' WHERE code = 'BD-PLY-BG-25'$$),
  'and the unit, which the admin screen does not offer');
SELECT pg_temp.expect((pg_temp.line('BD-PLY-BG-25')).code = 'BD-PLY-BG-25'
  AND (pg_temp.line('BD-PLY-BG-25')).unit = 'bundle', '(none of the three moved)');

-- ---------- Taking a line off the list ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:admin, $$UPDATE public.packaging_products SET is_active = false WHERE code = 'BP-SD-PPT-5'$$),
  'an admin takes a line off the website');
SELECT pg_temp.expect(NOT (pg_temp.line('BP-SD-PPT-5')).is_active, 'and the row is still there, for the requests that quote it');

ROLLBACK;

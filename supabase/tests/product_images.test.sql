-- Regression test for 20261001110000_product_image_edits.sql (sellers add,
-- remove, replace and reorder a product's images: at most four, their own
-- uploads only, image_url always the first; other sellers change nothing):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/product_images.test.sql
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000b101', 'pi-seller-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b102', 'pi-seller-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b103', 'pi-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b104', 'pi-customer@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000b101', 'seller'), ('00000000-0000-4000-8000-00000000b102', 'seller'),
  ('00000000-0000-4000-8000-00000000b103', 'admin');
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at) VALUES
  ('00000000-0000-4000-8000-00000000b101', 'active', 'seller', now(), now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000b102', 'active', 'seller', now(), now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000b104', 'trial', 'trial', now(), now() + interval '1 day');
SELECT set_config('isoko.subscription_internal', '', true);
-- A's older product, listed before image editing, with a picture from elsewhere
INSERT INTO public.products (id, seller_id, name, price, category, stock, image_url)
VALUES ('00000000-0000-4000-8000-00000000b1a1', '00000000-0000-4000-8000-00000000b101', 'Old basket', 5000, 'Crafts', 3, 'https://cdn.example.com/basket.jpg');

\set a '''00000000-0000-4000-8000-00000000b101'''
\set b '''00000000-0000-4000-8000-00000000b102'''
\set admin '''00000000-0000-4000-8000-00000000b103'''
\set customer '''00000000-0000-4000-8000-00000000b104'''

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
CREATE FUNCTION pg_temp.last_error() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('isoko.last_error', true) $$;
-- rows a user (NULL: a visitor) can read with the given query
CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; v_role text := CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;
CREATE FUNCTION pg_temp.prod(p_id text) RETURNS public.products LANGUAGE sql AS $$
  SELECT * FROM public.products WHERE id = p_id::uuid;
$$;
-- the address of a file a seller uploaded to the product-images bucket
CREATE FUNCTION pg_temp.img(p_seller text, p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'https://xyz.supabase.co/storage/v1/object/public/product-images/' || p_seller || '/' || p_name;
$$;
CREATE FUNCTION pg_temp.set_images(p_user text, p_id text, p_urls text[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT pg_temp.refused(p_user, format('UPDATE public.products SET image_urls = %L WHERE id = %L', p_urls, p_id));
$$;

\set p '''00000000-0000-4000-8000-00000000b1a2'''
\set legacy '''00000000-0000-4000-8000-00000000b1a1'''

-- ---------- Adding images, up to four ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:a, format($$INSERT INTO public.products (id, seller_id, name, price, category, stock, image_urls)
  VALUES (%L, auth.uid(), 'Mat', 2000, 'Crafts', 10, ARRAY[%L])$$, :p, pg_temp.img(:a, '1.jpg'))),
  'a seller lists a product with one uploaded image');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '1.jpg'), pg_temp.img(:a, '2.jpg'), pg_temp.img(:a, '3.jpg'), pg_temp.img(:a, '4.jpg')])
  AND cardinality((pg_temp.prod(:p)).image_urls) = 4, 'and adds images up to four');
SELECT pg_temp.expect((pg_temp.prod(:p)).image_url = pg_temp.img(:a, '1.jpg'), 'image_url is the first of them');
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '1.jpg'), pg_temp.img(:a, '2.jpg'), pg_temp.img(:a, '3.jpg'), pg_temp.img(:a, '4.jpg'), pg_temp.img(:a, '5.jpg')])
  AND pg_temp.last_error() ~ 'products_max_four_images' AND cardinality((pg_temp.prod(:p)).image_urls) = 4,
  'a fifth image is refused by the database and nothing changes');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '1.jpg'), pg_temp.img(:a, '1.jpg'), pg_temp.img(:a, '2.jpg')])
  AND (pg_temp.prod(:p)).image_urls = ARRAY[pg_temp.img(:a, '1.jpg'), pg_temp.img(:a, '2.jpg')], 'the same image is kept once');

-- ---------- Removing, replacing, reordering ----------
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '2.jpg')])
  AND (pg_temp.prod(:p)).image_url = pg_temp.img(:a, '2.jpg'), 'removing the first image makes the next one image_url');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '2.jpg'), pg_temp.img(:a, '3.jpg')]) AND
  NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '2.jpg'), pg_temp.img(:a, '3b.jpg')])
  AND (pg_temp.prod(:p)).image_urls = ARRAY[pg_temp.img(:a, '2.jpg'), pg_temp.img(:a, '3b.jpg')], 'replacing the second image keeps its place');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, '3b.jpg'), pg_temp.img(:a, '2.jpg')])
  AND (pg_temp.prod(:p)).image_url = pg_temp.img(:a, '3b.jpg'), 'reordering moves image_url to the new first image');
SELECT pg_temp.expect(NOT pg_temp.refused(:a, format($$UPDATE public.products SET image_url = %L WHERE id = %L$$, pg_temp.img(:a, 'main.jpg'), :p))
  AND (pg_temp.prod(:p)).image_urls = ARRAY[pg_temp.img(:a, 'main.jpg'), pg_temp.img(:a, '2.jpg')],
  'an older client that sets image_url replaces the first image');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, '{}') AND (pg_temp.prod(:p)).image_url IS NULL
  AND (pg_temp.prod(:p)).image_urls = '{}', 'removing every image leaves none');

-- ---------- Only uploads to Isoko, in the seller's own folder ----------
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY['https://cdn.example.com/stolen.jpg']) AND pg_temp.last_error() ~ 'uploaded to Isoko',
  'a picture from another site is refused');
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY['javascript:alert(1)']), 'so is a script');
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY['data:image/png;base64,AAAA']), 'and an inline data address');
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:b, 'theirs.jpg')]), 'and another seller''s upload');
SELECT pg_temp.expect(pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, 'x.jpg') || '?x=../../' || :b]), 'and a query string');
SELECT pg_temp.expect(pg_temp.refused(:a, format($$INSERT INTO public.products (seller_id, name, price, category, stock, image_url)
  VALUES (auth.uid(), 'Hotlinked', 100, 'Crafts', 1, %L)$$, 'https://cdn.example.com/x.jpg')), 'a new product can''t hotlink either');
SELECT pg_temp.expect((pg_temp.prod(:p)).image_urls = '{}', 'none of that was saved');

-- ---------- Other people ----------
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :p, ARRAY[pg_temp.img(:a, 'final.jpg')]), 'the owner sets a final image');
SELECT pg_temp.expect((pg_temp.set_images(:b, :p, ARRAY[pg_temp.img(:b, 'mine.jpg')]) OR true)
  AND (pg_temp.prod(:p)).image_urls = ARRAY[pg_temp.img(:a, 'final.jpg')], 'another seller changes nothing on it');
SELECT pg_temp.expect((pg_temp.refused(:b, format($$UPDATE public.products SET image_url = NULL WHERE id = %L$$, :p)) OR true)
  AND (pg_temp.prod(:p)).image_url = pg_temp.img(:a, 'final.jpg'), 'nor its image_url');
SELECT pg_temp.expect((pg_temp.set_images(:customer, :p, '{}') OR true)
  AND (pg_temp.prod(:p)).image_urls = ARRAY[pg_temp.img(:a, 'final.jpg')], 'a customer changes nothing');
SELECT pg_temp.expect(pg_temp.refused(:a, format($$UPDATE public.products SET status = 'inactive' WHERE id = %L$$, :p)),
  'the owner still can''t change the status');
-- ---------- Older products keep working ----------
SELECT pg_temp.expect((pg_temp.prod(:legacy)).image_urls = ARRAY['https://cdn.example.com/basket.jpg'],
  'an older single-image product has that image as its list');
SELECT pg_temp.expect(NOT pg_temp.refused(:a, format($$UPDATE public.products SET stock = 1, price = 5500 WHERE id = %L$$, :legacy))
  AND (pg_temp.prod(:legacy)).image_url = 'https://cdn.example.com/basket.jpg', 'its seller edits stock and price; the picture stays');
SELECT pg_temp.expect(NOT pg_temp.set_images(:a, :legacy, ARRAY['https://cdn.example.com/basket.jpg', pg_temp.img(:a, 'basket-2.jpg')])
  AND cardinality((pg_temp.prod(:legacy)).image_urls) = 2, 'and adds an uploaded image next to it');
SELECT pg_temp.expect(pg_temp.set_images(:a, :legacy, ARRAY['https://cdn.example.com/other.jpg']), 'but can''t add a new outside picture');

-- ---------- Customers see the result ----------
SELECT pg_temp.expect(pg_temp.visible(:customer, format($$SELECT 1 FROM public.products WHERE id = %L AND image_urls = ARRAY[%L]$$, :p, pg_temp.img(:a, 'final.jpg'))) = 1
  AND pg_temp.visible(NULL, format($$SELECT 1 FROM public.products WHERE id = %L AND image_url = %L$$, :p, pg_temp.img(:a, 'final.jpg'))) = 1,
  'customers and visitors read the saved images of an active product');
SELECT pg_temp.expect(pg_temp.visible(:customer, format($$SELECT 1 FROM public.products WHERE id = %L AND stock = 0$$, :p)) = 0
  AND NOT pg_temp.refused(:a, format($$UPDATE public.products SET stock = 0 WHERE id = %L$$, :p))
  AND pg_temp.visible(:customer, format($$SELECT 1 FROM public.products WHERE id = %L AND stock = 0 AND status = 'active'$$, :p)) = 1,
  'a product with no stock stays listed as active with stock 0 (the site shows it out of stock)');

-- ---------- Staff ----------
SELECT pg_temp.expect(NOT pg_temp.set_images(:admin, :p, ARRAY['https://cdn.isokogroups.com/staff.jpg'])
  AND (pg_temp.prod(:p)).image_url = 'https://cdn.isokogroups.com/staff.jpg', 'staff may set a picture from anywhere');

ROLLBACK;

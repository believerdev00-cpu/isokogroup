-- Regression test for 20261001100000_seller_agreement.sql (the Seller
-- Registration and Compliance Agreement: the details a seller gives, their
-- acceptance of the agreement, private payout details, four product images):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/seller_agreement.test.sql
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000a901', 'sa-applicant@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a902', 'sa-other@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a903', 'sa-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a904', 'sa-oldseller@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000a903', 'admin'), ('00000000-0000-4000-8000-00000000a904', 'seller');
-- everyone but the old seller is a customer in their trial
SELECT set_config('isoko.subscription_internal', 'on', true);
INSERT INTO public.subscriptions (user_id, status, plan, trial_started_at, trial_expires_at) VALUES
  ('00000000-0000-4000-8000-00000000a901', 'trial', 'trial', now(), now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000a902', 'trial', 'trial', now(), now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000a904', 'active', 'seller', now(), now() + interval '1 day');
SELECT set_config('isoko.subscription_internal', '', true);
-- a seller approved before the agreement existed (no details, no acceptance)
INSERT INTO public.seller_applications (id, user_id, full_name, business_name, phone, id_number, status)
VALUES ('00000000-0000-4000-8000-00000000a9a4', '00000000-0000-4000-8000-00000000a904', 'Old Seller', 'Old Shop', '0788000004', '1199', 'approved');
INSERT INTO public.products (id, seller_id, name, price, category, stock, image_url)
VALUES ('00000000-0000-4000-8000-00000000a9b1', '00000000-0000-4000-8000-00000000a904', 'Basket', 5000, 'Crafts', 3, 'https://img/old.jpg');

\set applicant '''00000000-0000-4000-8000-00000000a901'''
\set other '''00000000-0000-4000-8000-00000000a902'''
\set admin '''00000000-0000-4000-8000-00000000a903'''
\set oldseller '''00000000-0000-4000-8000-00000000a904'''

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
CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;
-- the application the website sends, with any column overridden
CREATE FUNCTION pg_temp.apply_sql(p_overrides jsonb DEFAULT '{}') RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.seller_applications SELECT * FROM jsonb_populate_record(NULL::public.seller_applications, %L)',
    (jsonb_build_object('id', gen_random_uuid(), 'user_id', '00000000-0000-4000-8000-00000000a901', 'full_name', 'Applicant',
      'business_name', 'Shop', 'phone', '0788000001', 'id_number', '1199', 'email', 'sa-applicant@test.local', 'status', 'pending',
      'created_at', now(), 'updated_at', now(),
      'country', 'Rwanda', 'tin', '123456789', 'business_address', ' KN 4 Ave, Kigali ', 'payment_provider', 'MTN MoMo',
      'payment_account', '0788000001', 'payment_account_name', 'Applicant Name',
      'agreement_version', public.seller_agreement_version()) || p_overrides)::text);
$$;
CREATE FUNCTION pg_temp.prod(p_id text) RETURNS public.products LANGUAGE sql AS $$
  SELECT * FROM public.products WHERE id = p_id::uuid;
$$;
CREATE FUNCTION pg_temp.app(p_user text) RETURNS public.seller_applications LANGUAGE sql AS $$
  SELECT * FROM public.seller_applications WHERE user_id = p_user::uuid ORDER BY created_at DESC LIMIT 1;
$$;

-- ---------- Section 11: the seller signs the agreement when applying ----------
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"agreement_version": null}'))
  AND pg_temp.last_error() ~ 'accept the Seller Registration and Compliance Agreement',
  'an application without the agreement is refused');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"agreement_version": "2020-01-01"}')),
  'an old agreement version is refused');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"agreement_version": null, "agreement_accepted_at": "2026-01-01T00:00:00Z"}')),
  'a timestamp alone is not acceptance');

-- ---------- Sections 1 and 7: the details a seller must give ----------
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"country": ""}')) AND pg_temp.last_error() ~ 'Country',
  'country is required');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"tin": null}')) AND pg_temp.last_error() ~ 'TIN', 'TIN is required');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"tin": "12"}')), 'a TIN of two characters is not a TIN');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"business_address": " "}')), 'business address is required');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"payment_provider": ""}')), 'bank / mobile money provider is required');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"payment_account": "abc"}')), 'a real account / MoMo number is required');
SELECT pg_temp.expect(pg_temp.refused(:applicant, pg_temp.apply_sql('{"payment_account_name": ""}')), 'account holder name is required');

SELECT pg_temp.expect(NOT pg_temp.refused(:applicant, pg_temp.apply_sql()), 'the complete application with the agreement is accepted');
SELECT pg_temp.expect((pg_temp.app(:applicant)).agreement_version = public.seller_agreement_version()
  AND (pg_temp.app(:applicant)).agreement_accepted_at BETWEEN now() - interval '1 minute' AND now(),
  'it records the agreement version and the server''s time of acceptance');
SELECT pg_temp.expect((pg_temp.app(:applicant)).business_address = 'KN 4 Ave, Kigali' AND (pg_temp.app(:applicant)).status = 'pending',
  'details are trimmed and the application starts pending');

-- the browser's own timestamp is replaced by the server's
DELETE FROM public.seller_applications WHERE user_id = :applicant;
SELECT pg_temp.expect(NOT pg_temp.refused(:applicant, pg_temp.apply_sql('{"agreement_accepted_at": "2020-01-01T00:00:00Z"}'))
  AND (pg_temp.app(:applicant)).agreement_accepted_at > now() - interval '1 minute',
  'a forged acceptance time is replaced by the server''s');

-- ---------- Section 7: payout details are private ----------
SELECT pg_temp.expect(pg_temp.visible(:applicant, $$SELECT payment_account FROM public.seller_applications WHERE payment_account = '0788000001'$$) = 1,
  'the seller sees their own payout details');
SELECT pg_temp.expect(pg_temp.visible(:other, $$SELECT payment_account FROM public.seller_applications WHERE payment_account = '0788000001'$$) = 0,
  'another customer sees nothing of them');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT payment_account FROM public.seller_applications$$)
  OR pg_temp.visible(:other, $$SELECT 1 FROM public.seller_applications$$) = 0, 'nor do visitors');
SELECT pg_temp.expect(pg_temp.visible(:admin, $$SELECT tin FROM public.seller_applications WHERE tin = '123456789'$$) = 1,
  'admins see them to verify the seller and pay approved payouts');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('tin', 'payment_account', 'payment_provider', 'payment_account_name')),
  'the public profile carries none of them');

-- ---------- Section 9: the seller keeps their details up to date ----------
SELECT pg_temp.expect(NOT pg_temp.refused(:applicant,
  $$SELECT public.update_seller_details('Rwanda', '987654321', 'KG 7 Ave, Kigali', 'Bank of Kigali', '00040-12345678-90', 'Applicant Name')$$)
  AND (pg_temp.app(:applicant)).payment_provider = 'Bank of Kigali' AND (pg_temp.app(:applicant)).tin = '987654321',
  'the seller updates their TIN and payout details');
SELECT pg_temp.expect(pg_temp.refused(:applicant,
  $$SELECT public.update_seller_details('Rwanda', '987654321', 'KG 7 Ave', 'Bank of Kigali', '', 'Applicant Name')$$),
  'but not to blanks');
SELECT pg_temp.expect(pg_temp.refused(:other,
  $$SELECT public.update_seller_details('Rwanda', '111111111', 'Elsewhere', 'Airtel Money', '0730000000', 'Other')$$)
  AND (pg_temp.app(:applicant)).tin = '987654321', 'someone with no application changes nothing');
SELECT pg_temp.expect(pg_temp.refused(:other, $$UPDATE public.seller_applications SET payment_account = '0730000000'$$)
  OR (pg_temp.app(:applicant)).payment_account = '00040-12345678-90', 'and can''t edit the table directly');
SELECT pg_temp.expect(pg_temp.refused(:applicant, $$UPDATE public.seller_applications SET status = 'approved' WHERE user_id = auth.uid()$$)
  OR (pg_temp.app(:applicant)).status = 'pending', 'the status is still not the seller''s to change');

-- ---------- Sellers from before the agreement accept it from the dashboard ----------
SELECT pg_temp.expect((pg_temp.app(:oldseller)).agreement_accepted_at IS NULL, 'an earlier seller has not accepted it yet');
SELECT pg_temp.expect(NOT pg_temp.refused(:oldseller, 'SELECT public.accept_seller_agreement()')
  AND (pg_temp.app(:oldseller)).agreement_version = public.seller_agreement_version()
  AND (pg_temp.app(:oldseller)).agreement_accepted_at IS NOT NULL
  AND (pg_temp.app(:oldseller)).status = 'approved', 'accept_seller_agreement stamps their application and keeps their approval');
SELECT pg_temp.expect(pg_temp.refused(:other, 'SELECT public.accept_seller_agreement()'), 'with no application there is nothing to accept');
SELECT pg_temp.expect(pg_temp.refused(NULL, 'SELECT public.accept_seller_agreement()'), 'visitors can''t call it');

-- ---------- Section 2: up to four product images; section 5: stock stays editable ----------
SELECT pg_temp.expect((pg_temp.prod('00000000-0000-4000-8000-00000000a9b1')).image_urls = ARRAY['https://img/old.jpg'],
  'an existing product''s single image became its image list');
SELECT pg_temp.expect(pg_temp.refused(:oldseller, $$INSERT INTO public.products (seller_id, name, price, category, stock, image_urls)
  VALUES (auth.uid(), 'Too many', 100, 'Crafts', 1, ARRAY['a','b','c','d','e'])$$), 'five images are refused');
SELECT pg_temp.expect(NOT pg_temp.refused(:oldseller, $$INSERT INTO public.products (id, seller_id, name, price, category, stock, image_urls)
  VALUES ('00000000-0000-4000-8000-00000000a9b2', auth.uid(), 'Mat', 2000, 'Crafts', 10, ARRAY['https://img/1.jpg', '', 'https://img/2.jpg'])$$),
  'up to four images are accepted');
SELECT pg_temp.expect(((pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).image_url, (pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).image_urls)
  = ('https://img/1.jpg'::text, ARRAY['https://img/1.jpg', 'https://img/2.jpg']::text[]), 'image_url is the first image; blanks are dropped');
SELECT pg_temp.expect(NOT pg_temp.refused(:oldseller, $$UPDATE public.products SET image_urls = ARRAY['https://img/3.jpg', 'https://img/1.jpg']
  WHERE id = '00000000-0000-4000-8000-00000000a9b2'$$)
  AND (pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).image_url = 'https://img/3.jpg',
  'reordering the images moves image_url with them');
SELECT pg_temp.expect(NOT pg_temp.refused(:oldseller, $$UPDATE public.products SET image_url = 'https://img/4.jpg'
  WHERE id = '00000000-0000-4000-8000-00000000a9b2'$$)
  AND (pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).image_urls = ARRAY['https://img/4.jpg', 'https://img/1.jpg'],
  'an older client that sets image_url replaces the first image');
SELECT pg_temp.expect(NOT pg_temp.refused(:oldseller, $$UPDATE public.products SET stock = 0, price = 2500
  WHERE id = '00000000-0000-4000-8000-00000000a9b2'$$)
  AND ((pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).stock, (pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).price) = (0, 2500),
  'the seller updates stock and price');
SELECT pg_temp.expect(pg_temp.refused(:oldseller, $$UPDATE public.products SET status = 'inactive'
  WHERE id = '00000000-0000-4000-8000-00000000a9b2'$$), 'but still not the status');
SELECT pg_temp.expect(pg_temp.refused(:other, $$UPDATE public.products SET image_urls = '{}' WHERE id = '00000000-0000-4000-8000-00000000a9b2'$$)
  OR (pg_temp.prod('00000000-0000-4000-8000-00000000a9b2')).image_url = 'https://img/4.jpg',
  'nobody else edits the images');

ROLLBACK;

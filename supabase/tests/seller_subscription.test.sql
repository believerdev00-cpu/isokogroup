-- Regression test for 20260930130000_seller_subscription.sql (the final rule:
-- buyers choose 50 RWF / 7 days or 200 RWF / month; sellers pay 1,500 RWF a
-- month, which covers normal access and the existing seller system):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/seller_subscription.test.sql
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000f701', 'ss2-newseller@test.local', 'authenticated', 'authenticated', '{"register_as":"seller"}'),
  ('00000000-0000-4000-8000-00000000f702', 'ss2-buyer@test.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000f703', 'ss2-admin@test.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000f704', 'ss2-finance@test.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000f705', 'ss2-oldseller@test.local', 'authenticated', 'authenticated', '{}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000f703', 'admin'), ('00000000-0000-4000-8000-00000000f704', 'finance');
UPDATE public.platform_settings SET value = '1500' WHERE key = 'seller_monthly_price';
UPDATE public.platform_settings SET value = '50' WHERE key = 'subscription_first_week_price';
UPDATE public.platform_settings SET value = '200' WHERE key = 'subscription_monthly_price';

\set newseller '''00000000-0000-4000-8000-00000000f701'''
\set buyer '''00000000-0000-4000-8000-00000000f702'''
\set admin '''00000000-0000-4000-8000-00000000f703'''
\set finance '''00000000-0000-4000-8000-00000000f704'''
\set oldseller '''00000000-0000-4000-8000-00000000f705'''

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true); END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;
CREATE FUNCTION pg_temp.as_(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v, '{}'::jsonb);
END $$;
CREATE FUNCTION pg_temp.state(p_user text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.as_(p_user, 'SELECT public.subscription_state()');
$$;
CREATE FUNCTION pg_temp.pay(p_user text, p_plan text, p_amount numeric, p_ref text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (pg_temp.as_(p_user, format($q$SELECT to_jsonb(public.submit_subscription_payment(%L, 'Payer Name', %L, NULL, %s))$q$,
    p_plan, p_ref, p_amount)) ->> 'id')::uuid;
$$;
CREATE FUNCTION pg_temp.confirm(p_by text, p_payment uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.as_(p_by, format($q$SELECT to_jsonb(public.subscription_confirm_payment(%L))$q$, p_payment));
$$;
CREATE FUNCTION pg_temp.sub(p_user uuid) RETURNS public.subscriptions LANGUAGE sql AS $$
  SELECT * FROM public.subscriptions WHERE user_id = p_user;
$$;
CREATE FUNCTION pg_temp.apply(p_user text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.as_(p_user, $q$INSERT INTO public.seller_applications (user_id, full_name, business_name, phone, id_number,
      country, tin, business_address, payment_provider, payment_account, payment_account_name, agreement_version)
    VALUES (auth.uid(), 'Applicant', 'Shop', '0788000000', '1199',
      'Rwanda', '123456789', 'Kigali', 'MTN MoMo', '0788000000', 'Applicant', public.seller_agreement_version())
    RETURNING to_jsonb(seller_applications.*)$q$);
$$;

-- ================= NORMAL USER: 50 RWF / 7 DAYS OR 200 RWF / MONTH =================
SELECT pg_temp.as_(:buyer, 'SELECT to_jsonb(public.start_trial())');
SELECT pg_temp.expect(pg_temp.state(:buyer) -> 'plans' @> '[{"plan":"week","price":50,"days":7},{"plan":"monthly","price":200,"months":1}]'
  AND jsonb_array_length(pg_temp.state(:buyer) -> 'plans') = 2, 'a normal user chooses 50 RWF / 7 days or 200 RWF / 1 month');
SELECT pg_temp.expect(pg_temp.pay(:buyer, 'seller', 1500, 'SS2-B-1') IS NULL, 'a normal user can''t take the seller plan');
SELECT set_config('ss.b1', pg_temp.pay(:buyer, 'monthly', 200, 'SS2-B-2')::text, true);
SELECT pg_temp.confirm(:finance, current_setting('ss.b1')::uuid);
SELECT pg_temp.expect((pg_temp.sub(:buyer::uuid)).plan = 'monthly'
  AND (pg_temp.sub(:buyer::uuid)).expires_at = (pg_temp.sub(:buyer::uuid)).starts_at + interval '1 month',
  'a normal user may take the month straight away (no 7 days first)');
SELECT pg_temp.expect(NOT public.has_role(:buyer::uuid, 'seller'), 'a normal subscription gives no seller access');

-- ================= NEW SELLER: 1,500 RWF A MONTH =================
-- registered as a seller, never signed in to start a trial: applies straight away
SELECT pg_temp.expect(pg_temp.apply(:newseller) IS NOT NULL, 'a new seller sends the application without a trial or subscription');
SELECT pg_temp.expect(pg_temp.state(:newseller) -> 'plans' = '[{"plan":"seller","price":1500,"days":null,"months":1}]'::jsonb
  AND (pg_temp.state(:newseller) ->> 'seller_path')::boolean, 'from then on the only plan is the seller plan, 1,500 RWF a month');
SELECT pg_temp.expect(pg_temp.pay(:newseller, 'week', 50, 'SS2-S-0') IS NULL, 'a seller can''t pay the 50 RWF plan instead');
SELECT pg_temp.expect(pg_temp.pay(:newseller, 'seller', 200, 'SS2-S-0') IS NULL
  AND current_setting('isoko.last_error') LIKE 'This payment is 1,500 RWF%', 'nor pay less than 1,500');
SELECT set_config('ss.s1', pg_temp.pay(:newseller, 'seller', 1500, 'SS2-S-1')::text, true);
SELECT pg_temp.expect((SELECT status = 'pending' AND plan = 'seller' FROM public.subscription_payments WHERE id = current_setting('ss.s1')::uuid)
  AND NOT public.has_role(:newseller::uuid, 'seller'), 'the payment is pending; not a seller yet');
SELECT pg_temp.expect(pg_temp.state(:newseller) ->> 'renewal_status' = 'renewal_pending'
  AND pg_temp.state(:newseller) ->> 'payment_status' = 'pending', 'the status shows the payment waiting');

-- the admin's approve button alone doesn't open it
SELECT pg_temp.expect(pg_temp.as_(:admin, $$SELECT to_jsonb(public.approve_seller_application(
  (SELECT id FROM public.seller_applications WHERE user_id = '00000000-0000-4000-8000-00000000f701')))$$) IS NULL,
  'the application can''t be approved without a confirmed seller payment');
SELECT pg_temp.expect(pg_temp.confirm(:finance, current_setting('ss.s1')::uuid) IS NULL
  AND current_setting('isoko.last_error') LIKE 'An admin confirms a new seller%', 'finance staff can''t open a new seller (an admin reviews sellers)');

SELECT pg_temp.expect(pg_temp.confirm(:admin, current_setting('ss.s1')::uuid) IS NOT NULL, 'the admin confirms the 1,500 RWF');
SELECT pg_temp.expect(public.has_role(:newseller::uuid, 'seller')
  AND (SELECT status FROM public.seller_applications WHERE user_id = :newseller) = 'approved',
  'confirmed: the application is approved and the existing seller role given');
SELECT pg_temp.expect((pg_temp.sub(:newseller::uuid)).status = 'active' AND (pg_temp.sub(:newseller::uuid)).plan = 'seller'
  AND (pg_temp.sub(:newseller::uuid)).expires_at = (pg_temp.sub(:newseller::uuid)).starts_at + interval '1 month'
  AND public.has_active_access(:newseller::uuid), 'the seller subscription runs a calendar month and gives normal access too');
SELECT pg_temp.expect(pg_temp.state(:newseller) ->> 'renewal_status' = 'active'
  AND pg_temp.state(:newseller) ->> 'period_started_at' IS NOT NULL AND pg_temp.state(:newseller) ->> 'access_until' IS NOT NULL,
  'the status shows start, expiry and renewal status');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notifications WHERE user_id = :newseller AND event_type = 'SUBSCRIPTION_SELLER_ACTIVATED')
  AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = :newseller AND event_type = 'SELLER_APPROVED'),
  'the new seller is told: payment confirmed, seller account approved');
SELECT pg_temp.expect(pg_temp.as_(:newseller, $$INSERT INTO public.products (seller_id, name, price, category, stock)
  VALUES (auth.uid(), 'SS2 product', 1000, 'x', 1) RETURNING 1$$) IS NOT NULL, 'the seller lists a product in the existing seller system');
SELECT pg_temp.expect(pg_temp.as_(:newseller, $$INSERT INTO public.logistics_requests (user_id, pickup, dropoff) VALUES (auth.uid(), 'A', 'B') RETURNING 1$$) IS NOT NULL,
  'and uses normal member services, without a 50 or 200 RWF subscription');

-- renewal: nearly over, reminders, then expiry
SELECT set_config('isoko.subscription_internal', 'on', true);
UPDATE public.subscriptions SET expires_at = now() + interval '2 days' WHERE user_id = :newseller;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.expect(pg_temp.state(:newseller) ->> 'renewal_status' = 'due_soon', 'with 3 days or less left: renewal due soon');
SELECT set_config('isoko.subscription_internal', 'on', true);
UPDATE public.subscriptions SET expires_at = now() + interval '20 hours' WHERE user_id = :newseller;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.state(:newseller);
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notifications WHERE user_id = :newseller AND event_type = 'SUBSCRIPTION_SELLER_ENDING'),
  '24 hours before: the seller reminder');
SELECT set_config('isoko.subscription_internal', 'on', true);
UPDATE public.subscriptions SET expires_at = now() - interval '1 second' WHERE user_id = :newseller;
SELECT set_config('isoko.subscription_internal', '', true);
SELECT pg_temp.state(:newseller);
SELECT pg_temp.expect(NOT public.has_active_access(:newseller::uuid)
  AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = :newseller AND event_type = 'SUBSCRIPTION_SELLER_EXPIRED'),
  'expired: no access, and the seller is told');
SELECT pg_temp.expect(pg_temp.as_(:newseller, $$INSERT INTO public.products (seller_id, name, price, category, stock)
  VALUES (auth.uid(), 'SS2 product 2', 1000, 'x', 1) RETURNING 1$$) IS NULL, 'an expired seller can''t list products');
SELECT pg_temp.expect(public.has_role(:newseller::uuid, 'seller') AND pg_temp.state(:newseller) ->> 'next_plan' = 'seller'
  AND (pg_temp.state(:newseller) ->> 'next_price')::numeric = 1500, 'the seller account stays; renewing is 1,500 RWF');
SELECT set_config('ss.s2', pg_temp.pay(:newseller, 'seller', 1500, 'SS2-S-2')::text, true);
SELECT pg_temp.expect(pg_temp.confirm(:finance, current_setting('ss.s2')::uuid) IS NOT NULL,
  'a renewal can be confirmed by finance staff (the seller is already approved)');
SELECT pg_temp.expect(public.has_active_access(:newseller::uuid) AND (pg_temp.sub(:newseller::uuid)).plan = 'seller',
  'renewed: another month of seller subscription');
SELECT pg_temp.expect((public.finance_totals_for('subscriptions', (pg_temp.sub(:newseller::uuid)).id) ->> 'paid')::numeric = 3000,
  'both months are on the payment ledger');

-- ================= EXISTING USER BECOMES A SELLER =================
SELECT pg_temp.expect(pg_temp.apply(:buyer) IS NOT NULL, 'the normal user chooses "Become a seller"');
SELECT pg_temp.expect(pg_temp.state(:buyer) -> 'plans' = '[{"plan":"seller","price":1500,"days":null,"months":1}]'::jsonb,
  'they are moved to the seller plan');
SELECT set_config('ss.b2', pg_temp.pay(:buyer, 'seller', 1500, 'SS2-B-3')::text, true);
SELECT set_config('ss.until', (pg_temp.sub(:buyer::uuid)).expires_at::text, true);
SELECT pg_temp.confirm(:admin, current_setting('ss.b2')::uuid);
SELECT pg_temp.expect(public.has_role(:buyer::uuid, 'seller') AND (SELECT count(*) FROM public.subscriptions WHERE user_id = :buyer) = 1,
  'same account, now a seller');
SELECT pg_temp.expect((pg_temp.sub(:buyer::uuid)).plan = 'seller'
  AND (pg_temp.sub(:buyer::uuid)).expires_at = current_setting('ss.until')::timestamptz + interval '1 month',
  'the seller month starts when their paid month ends (no days lost, nothing paid twice)');

-- ================= A SCREENSHOT INSTEAD OF A TRANSACTION ID =================
-- (the website uploads it to payment-proofs/<user id>/...; stored here as the upload would be)
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('payment-proofs', '00000000-0000-4000-8000-00000000f705/momo-sms.png', '00000000-0000-4000-8000-00000000f705');
SELECT pg_temp.as_(:oldseller, 'SELECT to_jsonb(public.start_trial())');
INSERT INTO public.user_roles (user_id, role) VALUES (:oldseller, 'seller');
SELECT set_config('ss.o1', (pg_temp.as_(:oldseller, $$SELECT to_jsonb(public.submit_subscription_payment('seller', 'Old Seller',
  NULL, '00000000-0000-4000-8000-00000000f705/momo-sms.png'))$$) ->> 'id'), true);
SELECT pg_temp.expect((SELECT reference IS NULL AND proof_path LIKE '%momo-sms.png' AND payer_name = 'Old Seller' AND amount = 1500
  FROM public.subscription_payments WHERE id = current_setting('ss.o1')::uuid), 'a payment can be reported with just the payer''s name and a screenshot');
SELECT pg_temp.expect((SELECT count(*) FROM storage.objects WHERE bucket_id = 'payment-proofs') >= 1
  AND pg_temp.as_(:admin, $$SELECT to_jsonb(count(*)) FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name LIKE '00000000-0000-4000-8000-00000000f705/%'$$) = '1'::jsonb,
  'the admin can open the screenshot');
SELECT pg_temp.expect(pg_temp.as_(:buyer, $$SELECT to_jsonb(count(*)) FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name LIKE '00000000-0000-4000-8000-00000000f705/%'$$) = '0'::jsonb,
  'another customer can''t');
SELECT pg_temp.expect(pg_temp.as_(:oldseller, $$SELECT to_jsonb(public.subscription_confirm_payment(
  (SELECT id FROM public.subscription_payments WHERE user_id = auth.uid() AND status = 'pending')))$$) IS NULL, 'and the customer can''t confirm it');
SELECT pg_temp.expect(pg_temp.confirm(:finance, current_setting('ss.o1')::uuid) IS NOT NULL
  AND (pg_temp.sub(:oldseller::uuid)).plan = 'seller', 'finance confirms the screenshot payment of an existing seller');

-- ================= A SELLER FROM BEFORE: RENEWS AT THE SELLER PRICE =================
SELECT pg_temp.expect(pg_temp.state(:oldseller) ->> 'next_plan' = 'seller' AND pg_temp.pay(:oldseller, 'monthly', 200, 'SS2-O-1') IS NULL,
  'a seller approved before this pays the seller plan, not 200 RWF');

ROLLBACK;

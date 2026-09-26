-- Regression test for 20260925180000_mobile_money.sql (paying from the phone
-- through ItecPay), run against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/mobile_money.test.sql
--
-- Everything runs in one transaction that is rolled back. The Edge Function and
-- ItecPay itself are covered by mobile-money.e2e.mjs.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'mm-custa@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d2', 'mm-custb@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d3', 'mm-admin@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000d3', 'admin');

CREATE FUNCTION pg_temp.as_(p_user text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
$$;
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_role text := pg_temp.as_(p_user);
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM set_config('isoko.last_error', SQLERRM, true);
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;
-- Runs p_sql as p_user and keeps its jsonb result in isoko.last_result
CREATE FUNCTION pg_temp.run(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_role text := pg_temp.as_(p_user); v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_role = 'authenticated' THEN json_build_object('sub', p_user, 'role', v_role)::text
         ELSE json_build_object('role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  EXECUTE p_sql INTO v;
  RESET ROLE;
  PERFORM set_config('isoko.last_result', coalesce(v::text, ''), true);
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

-- Customer A's trip, accepted at 5,000 RWF (by link); customer B's at 300 USD
CREATE TEMP TABLE trip (who text PRIMARY KEY, token text, id uuid);
GRANT ALL ON trip TO anon, authenticated, service_role;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
INSERT INTO trip (who, token) SELECT 'a', public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":1,"needs":["hotel"],"name":"Customer A","phone":"0788000001","email":"a@x.co"}'::jsonb) ->> 'token';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
INSERT INTO trip (who, token) SELECT 'b', public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":1,"needs":["hotel"],"name":"Customer B","phone":"0788000002","email":"b@x.co"}'::jsonb) ->> 'token';
UPDATE trip SET id = t.id FROM public.travel_trips t WHERE t.access_token = trip.token;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.travel_trips SET currency = 'RWF', status = 'quoted', quote_total = 5000, quote_sent_at = now() WHERE id = (SELECT id FROM trip WHERE who = 'a');
UPDATE public.travel_trips SET currency = 'USD', status = 'quoted', quote_total = 300, quote_sent_at = now() WHERE id = (SELECT id FROM trip WHERE who = 'b');
SELECT pg_temp.refused(NULL, $$SELECT public.travel_accept_quote((SELECT token FROM trip WHERE who='a'))$$);
SELECT pg_temp.refused(NULL, $$SELECT public.travel_accept_quote((SELECT token FROM trip WHERE who='b'))$$);

\set start_a 'SELECT public.mobile_money_start(''travel_trips'', NULL, (SELECT token FROM trip WHERE who=''a''), '

-- ---------- Switched on by the setting ----------
UPDATE public.platform_settings SET value = 'off' WHERE key = 'mobile_money';
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0788123456')$$), 'off: nobody can pay from the phone');
UPDATE public.platform_settings SET value = 'staff' WHERE key = 'mobile_money';
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0788123456')$$)
  AND pg_temp.run('00000000-0000-4000-8000-0000000000d3', 'SELECT to_jsonb(public.mobile_money_available())') = 'true'
  AND pg_temp.run(NULL, 'SELECT to_jsonb(public.mobile_money_available())') = 'false',
  'staff: only admins and finance staff see it (testing with ItecPay)');
UPDATE public.platform_settings SET value = 'on' WHERE key = 'mobile_money';

-- ---------- Checks before anything is recorded ----------
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.mobile_money_start('travel_trips', NULL, 'not-a-token', 'mtn', '0788123456')$$),
  'a wrong link token is refused');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.mobile_money_start('travel_trips', NULL, (SELECT token FROM trip WHERE who='b'), 'mtn', '0788123456')$$)
  AND current_setting('isoko.last_error') LIKE '%RWF%', 'amounts in USD are refused (ItecPay is RWF only)');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0728123456')$$), 'an Airtel number can''t pay with MTN');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'airtel', '0788123456')$$), 'an MTN number can''t pay with Airtel');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '12345')$$), 'not a Rwandan number');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'visa', '0788123456')$$), 'unknown network');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0788123456', 6000)$$), 'more than is owed');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0788123456', 100.5)$$), 'whole francs only');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.mobile_money_start('travel_trips', (SELECT id FROM trip WHERE who='a'), NULL, 'mtn', '0788123456')$$),
  'without the link, a visitor must sign in');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000d2',
  $$SELECT public.mobile_money_start('travel_trips', (SELECT id FROM trip WHERE who='a'), NULL, 'mtn', '0788123456')$$),
  'someone else''s record can''t be paid by id');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id
  WHERE a.entity_id IN (SELECT id FROM trip)), 'none of that recorded anything');

-- ---------- Starting ----------
SELECT pg_temp.expect((pg_temp.run(NULL, :'start_a' || $$'MTN', '+250 788 123 456')$$) ->> 'amount')::numeric = 5000,
  'by link: the whole balance, the phone number tidied');
CREATE TEMP TABLE pay AS SELECT (current_setting('isoko.last_result')::jsonb ->> 'payment_id')::uuid AS id;
GRANT ALL ON pay TO anon, authenticated, service_role;
SELECT pg_temp.expect((SELECT status = 'pending' AND provider = 'itecpay' AND method = 'momo' AND provider_txn_id IS NULL
    AND metadata ->> 'phone' = '0788123456' AND metadata ->> 'network' = 'mtn' FROM public.finance_payments WHERE id = (SELECT id FROM pay)),
  'a pending ItecPay payment is recorded, nothing is paid');
SELECT pg_temp.expect((public.finance_totals_for('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'pending')::numeric = 5000
  AND (public.finance_totals_for('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'paid')::numeric = 0,
  'it counts as pending, not paid');
SELECT pg_temp.expect(pg_temp.refused(NULL, :'start_a' || $$'mtn', '0788123456', 100)$$)
  AND current_setting('isoko.last_error') LIKE '%already waiting%', 'one payment waiting at a time');
SELECT pg_temp.expect(pg_temp.run(NULL, $$SELECT public.mobile_money_status((SELECT id FROM pay))$$) ->> 'status' = 'pending',
  'the customer''s screen can follow it by its id');

-- ---------- Only the Edge Function sends and settles ----------
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.mobile_money_claim_send((SELECT id FROM pay))$$)
  AND pg_temp.refused('00000000-0000-4000-8000-0000000000d3', $$SELECT public.mobile_money_claim_send((SELECT id FROM pay))$$)
  AND pg_temp.refused('00000000-0000-4000-8000-0000000000d1', $$SELECT public.mobile_money_sent((SELECT id FROM pay), 'T', 'F')$$)
  AND pg_temp.refused(NULL, $$SELECT * FROM public.mobile_money_due(10, NULL, false)$$)
  AND pg_temp.refused(NULL, $$SELECT public.finance_apply_provider_event('itecpay', 'x', (SELECT id FROM pay), 'T', 'successful', 5000, 'RWF', NULL, '{}')$$),
  'visitors, customers and admins can''t send, mark sent, list or settle payments');
SELECT pg_temp.expect(pg_temp.run('service', $$SELECT public.mobile_money_claim_send((SELECT id FROM pay))$$) ->> 'phone' = '0788123456',
  'the sender gets the payment to send');
SELECT pg_temp.expect(pg_temp.run('service', $$SELECT public.mobile_money_claim_send((SELECT id FROM pay))$$) IS NULL,
  '... once: a second send gets nothing');
SELECT pg_temp.refused('service', $$SELECT public.mobile_money_sent((SELECT id FROM pay), 'ITEC-TXN-1', '2269377')$$);
SELECT pg_temp.expect((SELECT status = 'processing' AND provider_txn_id = 'ITEC-TXN-1' AND metadata ->> 'financial_transaction_id' = '2269377'
  FROM public.finance_payments WHERE id = (SELECT id FROM pay)), 'ItecPay''s transaction id is kept, the prompt is on the phone');
SELECT pg_temp.expect((pg_temp.run('service', $$SELECT to_jsonb(public.mobile_money_by_transaction('ITEC-TXN-1'))$$) #>> '{}')::uuid = (SELECT id FROM pay),
  'a callback''s transaction id finds the payment');
SELECT pg_temp.expect((SELECT count(*) FROM (SELECT pg_temp.run('service', $$SELECT to_jsonb(array_agg(payment_id)) FROM public.mobile_money_due(10, (SELECT id FROM pay))$$)) x) = 1
  AND current_setting('isoko.last_result')::jsonb ? (SELECT id::text FROM pay),
  'a waiting payment is due for a check');
SELECT pg_temp.expect(pg_temp.run('service', $$SELECT to_jsonb(array_agg(payment_id)) FROM public.mobile_money_due(10, (SELECT id FROM pay))$$) IS NULL,
  '... but not again within 20 seconds');

-- ---------- Settling ----------
SELECT pg_temp.expect(pg_temp.run('service', $$SELECT to_jsonb(public.finance_apply_provider_event('itecpay', 'verify:a:SUCCESSFUL', (SELECT id FROM pay),
  'ITEC-TXN-1', 'successful', 4000, 'RWF', NULL, '{}'))$$) #>> '{}' = 'needs_review'
  AND (SELECT status FROM public.finance_payments WHERE id = (SELECT id FROM pay)) = 'processing',
  'ItecPay reporting a different amount isn''t accepted: finance reviews it');
-- (the action and its check are separate statements: the checks read the
-- database as it was when their statement started)
SELECT pg_temp.run('service', $$SELECT to_jsonb(public.finance_apply_provider_event('itecpay', 'verify:a:SUCCESSFUL2', (SELECT id FROM pay),
  'ITEC-TXN-1', 'successful', 5000, 'RWF', NULL, '{}'))$$);
SELECT pg_temp.expect(current_setting('isoko.last_result') = '"applied"'
  AND (public.finance_totals_for('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'balance')::numeric = 0
  AND pg_temp.run(NULL, $$SELECT public.mobile_money_status((SELECT id FROM pay))$$) ->> 'status' = 'successful',
  'ItecPay''s confirmed amount pays the trip');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.notification_events WHERE event_key = 'PAYMENT_SUCCESSFUL:' || (SELECT id FROM pay)),
  'the customer is told');

-- ---------- Late approval: cancelled can still be paid, failed can't ----------
UPDATE public.travel_trips SET quote_total = 8000 WHERE id = (SELECT id FROM trip WHERE who = 'a');
SELECT pg_temp.run(NULL, :'start_a' || $$'airtel', '0738123456', 1000)$$);
INSERT INTO pay SELECT (current_setting('isoko.last_result')::jsonb ->> 'payment_id')::uuid;
CREATE TEMP TABLE late AS SELECT (current_setting('isoko.last_result')::jsonb ->> 'payment_id')::uuid AS id;
GRANT ALL ON late TO anon, authenticated, service_role;
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('itecpay', 'expired:l', (SELECT id FROM late), NULL, 'cancelled', NULL, 'RWF', 'Not approved in time', '{}')$$);
SELECT pg_temp.expect(pg_temp.run(NULL, $$SELECT public.mobile_money_status((SELECT id FROM late))$$) ->> 'message' = 'Not approved in time'
  AND (public.finance_totals_for('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'pending')::numeric = 0,
  'no approval in time: cancelled, nothing pending, the customer can try again');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('itecpay', 'verify:l:SUCCESSFUL', (SELECT id FROM late), 'ITEC-TXN-2', 'successful', 1000, 'RWF', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT status = 'successful' AND failure_reason LIKE 'Approved late%' FROM public.finance_payments WHERE id = (SELECT id FROM late))
  AND (public.finance_totals_for('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'paid')::numeric = 6000,
  'approved on the phone afterwards: the money is recorded');
SELECT pg_temp.run(NULL, :'start_a' || $$'spenn', '0798123456', 500)$$);
CREATE TEMP TABLE declined AS SELECT (current_setting('isoko.last_result')::jsonb ->> 'payment_id')::uuid AS id;
GRANT ALL ON declined TO anon, authenticated, service_role;
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('itecpay', 'verify:d:FAILED', (SELECT id FROM declined), NULL, 'failed', NULL, 'RWF', 'Not paid (failed)', '{}')$$);
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('itecpay', 'verify:d:SUCCESSFUL', (SELECT id FROM declined), 'ITEC-TXN-3', 'successful', 500, 'RWF', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT status FROM public.finance_payments WHERE id = (SELECT id FROM declined)) = 'failed',
  'a payment ItecPay said failed stays failed');

-- ---------- Signed in ----------
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000d1',
  $$SELECT public.mobile_money_start('travel_trips', (SELECT id FROM trip WHERE who='a'), NULL, 'mtn', '0788123456', 100)$$),
  'the signed-in owner pays their own record without the link');

ROLLBACK;

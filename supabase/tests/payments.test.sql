-- Regression test for the payment engine (20260925120100_payment_engine.sql),
-- run against the local Supabase database as the real roles:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/payments.test.sql
--
-- Everything runs in one transaction that is rolled back. Any failed check
-- raises and stops the script with a non-zero exit code.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'pay-custa@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f2', 'pay-custb@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'pay-travel@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f4', 'pay-consult@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f5', 'pay-finance@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f6', 'pay-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f7', 'pay-seller@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000f3', 'travel_staff'),
  ('00000000-0000-4000-8000-0000000000f4', 'consultancy_staff'),
  ('00000000-0000-4000-8000-0000000000f5', 'finance'),
  ('00000000-0000-4000-8000-0000000000f6', 'admin'),
  ('00000000-0000-4000-8000-0000000000f7', 'seller');

-- Runs the statement as the given user (NULL = anonymous, 'service' = service
-- role) and reports whether it was refused. Checks after a call are separate
-- statements: a subquery in the same SELECT is evaluated before the call.
CREATE FUNCTION pg_temp.refused(p_user text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' WHEN p_user = 'service' THEN 'service_role' ELSE 'authenticated' END;
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

CREATE FUNCTION pg_temp.expect(p_ok boolean, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: % (last error: %)', p_what, current_setting('isoko.last_error', true);
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

CREATE FUNCTION pg_temp.visible(p_user text, p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RESET ROLE;
  RETURN n;
END $$;

CREATE FUNCTION pg_temp.totals(p_table text, p_id uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.finance_totals_for(p_table, p_id);
$$;

-- Two trips of two customers, each accepted at 1000 USD
CREATE TEMP TABLE trip (who text PRIMARY KEY, token text, id uuid);
GRANT ALL ON trip TO anon, authenticated, service_role;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
INSERT INTO trip (who, token) SELECT 'a', public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":2,"needs":["hotel"],"name":"Customer A","phone":"1","email":"a@x.co"}'::jsonb) ->> 'token';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
INSERT INTO trip (who, token) SELECT 'b', public.travel_request_trip('{"arrival_date":"2030-03-01","departure_date":"2030-03-05",
  "travelers":1,"needs":["hotel"],"name":"Customer B","phone":"2","email":"b@x.co"}'::jsonb) ->> 'token';
UPDATE trip SET id = t.id FROM public.travel_trips t WHERE t.access_token = trip.token;
SELECT set_config('request.jwt.claims', '', true);

SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 100, 'momo', 'MP-EARLY')$$),
  'no payment before the customer accepts the trip');
UPDATE public.travel_trips SET status = 'quoted', quote_total = 1000, quote_sent_at = now() WHERE id IN (SELECT id FROM trip);
SELECT pg_temp.refused(NULL, $$SELECT public.travel_accept_quote((SELECT token FROM trip WHERE who='a'))$$);
SELECT pg_temp.refused(NULL, $$SELECT public.travel_accept_quote((SELECT token FROM trip WHERE who='b'))$$);
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'charged')::numeric = 1000,
  'accepting the quote charges the trip');

-- ---------- Customer reports (submissions) ----------
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 9000000, 'momo', 'MP-BIG')$$),
  'overpayment report refused (9,000,000 on a 1,000 balance)');
SELECT pg_temp.expect(current_setting('isoko.last_error') LIKE '%1000.00 USD left to pay%', 'the customer is told what is left to pay');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 600, 'momo', 'MP-1001')$$),
  'customer reports a 600 payment');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 100, 'momo', 'mp-1001')$$),
  'the same reference can''t be reported twice (any case)');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='b'), 100, 'momo', 'MP-1001')$$),
  'nor on another customer''s trip');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 500, 'momo', 'MP-1002')$$),
  'reports can''t add up to more than the balance (600 pending + 500 > 1000)');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment('0000000000000000000000000000000000000000000000000000000000000000', 10, 'momo', 'MP-X')$$),
  'an unknown link can''t report payments');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), -5, 'momo', 'MP-NEG')$$),
  'negative amounts refused');
SELECT pg_temp.expect(pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 10, 'bitcoin', 'MP-M')$$),
  'unknown methods refused');
SELECT pg_temp.expect((public.travel_trip_view((SELECT token FROM trip WHERE who='a')) ->> 'paid')::numeric = 0
  AND (public.travel_trip_view((SELECT token FROM trip WHERE who='a')) ->> 'pending_payment')::numeric = 600,
  'a report is pending, not paid');

-- ---------- Who may see and verify ----------
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f4',
  $$SELECT public.finance_verify_submission((SELECT s.id FROM public.finance_submissions s WHERE s.reference = 'MP-1001'))$$),
  'consultancy staff can''t confirm a travel payment');
SELECT pg_temp.expect(pg_temp.visible('00000000-0000-4000-8000-0000000000f4',
  'SELECT 1 FROM public.finance_submissions WHERE reference = ''MP-1001''') = 0, 'nor see it');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f2',
  $$SELECT public.finance_verify_submission((SELECT s.id FROM public.finance_submissions s WHERE s.reference = 'MP-1001'))$$),
  'a customer can''t confirm payments');
SELECT pg_temp.expect(pg_temp.visible('00000000-0000-4000-8000-0000000000f2',
  $$SELECT 1 FROM public.finance_accounts a JOIN trip ON trip.id = a.entity_id WHERE trip.who = 'a'$$) = 0,
  'customer B can''t see customer A''s account');
SELECT pg_temp.expect(pg_temp.visible('00000000-0000-4000-8000-0000000000f1',
  $$SELECT 1 FROM public.finance_submissions WHERE reference = 'MP-1001'$$) = 1,
  'customer A sees their own payment report');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f1',
  $$INSERT INTO public.finance_payments (account_id, amount, currency, method, status)
    SELECT id, 1000, 'USD', 'momo', 'successful' FROM public.finance_accounts LIMIT 1$$),
  'nobody inserts payments directly');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$UPDATE public.finance_submissions SET status = 'verified' WHERE reference = 'MP-1001'$$),
  'not even admins change a report''s status directly');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_verify_submission((SELECT s.id FROM public.finance_submissions s WHERE s.reference = 'MP-1001'), 5000)$$),
  'travel staff can''t confirm more than the balance');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_verify_submission((SELECT s.id FROM public.finance_submissions s WHERE s.reference = 'MP-1001'))$$),
  'travel staff confirm the 600 payment');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_verify_submission((SELECT s.id FROM public.finance_submissions s WHERE s.reference = 'MP-1001'))$$),
  'a report is confirmed only once');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'paid')::numeric = 600
  AND (pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'balance')::numeric = 400,
  'paid 600, balance 400');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 400, 'bank', 'FT-555')$$),
  'customer reports the last 400');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_reject_submission((SELECT id FROM public.finance_submissions WHERE reference = 'FT-555'), 'Not on the bank statement')$$),
  'travel staff reject a report that never arrived');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_reject_submission((SELECT id FROM public.finance_submissions WHERE reference = 'FT-555'), '')$$),
  'rejecting needs a reason');
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, $$SELECT public.travel_submit_payment((SELECT token FROM trip WHERE who='a'), 400, 'bank', 'FT-555')$$),
  'a rejected reference can be reported again (e.g. after a typo)');

-- ---------- Staff record payments ----------
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_record_payment('travel_trips', (SELECT id FROM trip WHERE who='b'), 1500, 'cash', '')$$),
  'recording more than the balance is refused');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_record_payment('travel_trips', (SELECT id FROM trip WHERE who='b'), 100, 'momo', '')$$),
  'a mobile-money payment needs its reference');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_record_payment('travel_trips', (SELECT id FROM trip WHERE who='b'), 300, 'cash', '', 'Paid at the office', 'key-b-1')$$),
  'travel staff record 300 cash');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_record_payment('travel_trips', (SELECT id FROM trip WHERE who='b'), 300, 'cash', '', 'Paid at the office', 'key-b-1')$$),
  'retrying with the same idempotency key ...');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'paid')::numeric = 300,
  '... records the payment once');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_record_payment('travel_trips', (SELECT id FROM trip WHERE who='b'), 100, 'momo', 'MP-1001')$$),
  'a mobile-money reference already received can''t be recorded again');

-- ---------- Refunds, voids, adjustments: finance only ----------
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 100, 'Customer asked')$$),
  'service staff can''t refund');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 100, '')$$),
  'a refund needs a reason');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 700, 'Too much')$$),
  'can''t refund more than was paid');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 100, 'One traveller cancelled', 'refund-1')$$),
  'finance refunds 100 of the 600');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_refund_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 100, 'One traveller cancelled', 'refund-1')$$),
  'retrying the refund ...');
SELECT pg_temp.expect((SELECT status || ' ' || refunded_amount FROM public.finance_payments WHERE reference = 'MP-1001') = 'partially_refunded 100.00',
  '... refunds once: the payment is partially refunded');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='a')) ->> 'balance')::numeric = 500,
  'the refunded 100 is owed again (balance 500)');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_void_payment((SELECT id FROM public.finance_payments WHERE reference = 'MP-1001'), 'Mistake')$$),
  'a refunded payment can''t be voided (void is not a refund)');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_void_payment((SELECT id FROM public.finance_payments WHERE idempotency_key = 'key-b-1'), 'Recorded on the wrong trip')$$),
  'finance voids a payment recorded by mistake');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'paid')::numeric = 0
  AND (pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'balance')::numeric = 1000,
  'after the void customer B owes 1000 again');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.finance_adjust('travel_trips', (SELECT id FROM trip WHERE who='b'), 'discount', 100, 'Loyal customer')$$),
  'service staff can''t give discounts');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.finance_adjust('travel_trips', (SELECT id FROM trip WHERE who='b'), 'discount', 100, 'Loyal customer')$$),
  'finance gives a 100 discount with a reason');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'balance')::numeric = 900,
  'balance 900 after the discount');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'finance_payments'
  AND reason = 'Recorded on the wrong trip' AND new_data ->> 'status' = 'voided'), 'the void and its reason are in the audit log');

-- ---------- The price changes ----------
UPDATE public.travel_trips SET quote_total = 1200 WHERE id = (SELECT id FROM trip WHERE who='b');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'charged')::numeric = 1200
  AND (pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'balance')::numeric = 1100,
  'a new quote total adjusts the charge (1200 - 100 discount)');

-- ---------- Nothing disappears ----------
SELECT pg_temp.expect(pg_temp.refused('service', $$DELETE FROM public.finance_ledger$$), 'the service role can''t delete ledger entries');
SELECT pg_temp.expect(pg_temp.refused('service', $$UPDATE public.finance_payments SET amount = 1$$), 'or edit payments');
SELECT pg_temp.expect(pg_temp.refused('service', $$INSERT INTO public.finance_ledger (account_id, kind, amount, currency)
  SELECT id, 'waiver', -1000, currency FROM public.finance_accounts LIMIT 1$$), 'or write ledger entries');
DO $$ BEGIN
  UPDATE public.finance_ledger SET amount = 1;
  RAISE EXCEPTION 'FAILED: the database owner could edit the ledger';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  even the database owner can''t edit the ledger';
END $$;
DO $$ BEGIN
  DELETE FROM public.finance_payments;
  RAISE EXCEPTION 'FAILED: the database owner could delete payments';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  or delete payments';
END $$;
SELECT pg_temp.expect(NOT EXISTS (
  SELECT 1 FROM public.finance_accounts a
  WHERE (public.finance_totals(a.id) ->> 'balance')::numeric
     <> (public.finance_totals(a.id) ->> 'charged')::numeric - (public.finance_totals(a.id) ->> 'credits')::numeric
      - (public.finance_totals(a.id) ->> 'paid')::numeric),
  'every balance = charged - credits - paid (ledger and payments agree)');

-- ---------- Payment provider webhooks ----------
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.finance_create_intent('travel_trips', (SELECT id FROM trip WHERE who='b'), 100, 'momo', 'mock', 'i-1')$$),
  'only the service role starts provider payments');
SELECT pg_temp.expect(pg_temp.refused('service',
  $$SELECT public.finance_create_intent('travel_trips', (SELECT id FROM trip WHERE who='b'), 5000, 'momo', 'mock', 'i-0')$$),
  'a provider payment can''t exceed the balance');
SELECT pg_temp.refused('service', $$SELECT public.finance_create_intent('travel_trips', (SELECT id FROM trip WHERE who='b'), 500, 'momo', 'mock', 'i-1')$$);
SELECT pg_temp.refused('service', $$SELECT public.finance_create_intent('travel_trips', (SELECT id FROM trip WHERE who='b'), 500, 'momo', 'mock', 'i-1')$$);
SELECT pg_temp.expect((SELECT count(*) FROM public.finance_payments WHERE idempotency_key = 'i-1') = 1, 'the same intent twice creates one payment');
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'pending')::numeric = 500
  AND (pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'paid')::numeric = 0,
  'a started provider payment is pending, not paid');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.finance_apply_provider_event('mock', 'ev-1', (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-1'),
    'TX-1', 'successful', 500, 'USD', NULL, '{}')$$), 'only the service role applies webhooks');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-0',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-1'), 'TX-0', 'successful', 499, 'USD', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT outcome FROM public.finance_provider_events WHERE event_id = 'ev-0') = 'needs_review'
  AND (SELECT status FROM public.finance_payments WHERE idempotency_key = 'i-1') = 'pending',
  'a successful webhook for the wrong amount is held for review, not booked');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-1',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-1'), 'TX-1', 'successful', 500, 'USD', NULL, '{}')$$);
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-1',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-1'), 'TX-1', 'successful', 500, 'USD', NULL, '{}')$$);
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-1b',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-1'), 'TX-1', 'successful', 500, 'USD', NULL, '{}')$$);
SELECT pg_temp.expect((pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'paid')::numeric = 500
  AND (SELECT count(*) FROM public.finance_ledger l JOIN public.finance_payments p ON p.id = l.payment_id
       WHERE p.idempotency_key = 'i-1' AND l.kind = 'payment') = 1,
  'a successful webhook delivered three times books the payment once');
SELECT pg_temp.expect((SELECT outcome FROM public.finance_provider_events WHERE event_id = 'ev-1b') = 'already_applied',
  'the repeat is recorded as already applied');
SELECT pg_temp.refused('service', $$SELECT public.finance_create_intent('travel_trips', (SELECT id FROM trip WHERE who='b'), 100, 'momo', 'mock', 'i-2')$$);
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-2',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-2'), 'TX-1', 'successful', 100, 'USD', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT outcome FROM public.finance_provider_events WHERE event_id = 'ev-2') = 'duplicate_transaction'
  AND (SELECT status FROM public.finance_payments WHERE idempotency_key = 'i-2') = 'pending',
  'the same provider transaction can''t pay a second payment');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-3',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-2'), NULL, 'failed', 100, 'USD', 'Insufficient funds', '{}')$$);
SELECT pg_temp.expect((SELECT status || ' / ' || failure_reason FROM public.finance_payments WHERE idempotency_key = 'i-2') = 'failed / Insufficient funds'
  AND (pg_temp.totals('travel_trips', (SELECT id FROM trip WHERE who='b')) ->> 'pending')::numeric = 0,
  'a failed payment is recorded with its reason and nothing is owed on it');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('mock', 'ev-4',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-2'), 'TX-9', 'successful', 100, 'USD', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT status FROM public.finance_payments WHERE idempotency_key = 'i-2') = 'failed',
  'a late "successful" can''t revive a failed payment');
SELECT pg_temp.refused('service', $$SELECT public.finance_apply_provider_event('other', 'ev-9',
  (SELECT id FROM public.finance_payments WHERE idempotency_key = 'i-2'), 'TX-2', 'successful', 100, 'USD', NULL, '{}')$$);
SELECT pg_temp.expect((SELECT outcome FROM public.finance_provider_events WHERE event_id = 'ev-9') = 'unknown_payment',
  'a provider can''t confirm another provider''s payment');

-- ---------- Marketplace ----------
SELECT pg_temp.refused('00000000-0000-4000-8000-0000000000f7',
  $$INSERT INTO public.products (seller_id, name, price, category, stock) VALUES (auth.uid(), 'PAY-W', 2500, 'x', 10)$$);
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f1',
  $$SELECT public.place_order(jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE name = 'PAY-W'),
    'quantity', 2)), 'Kigali', 'momo', 'MP-ORDER-1')$$), 'buyer places an order with a mobile-money reference');
SELECT pg_temp.expect((SELECT payment_status FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1') = 'awaiting_confirmation'
  AND (pg_temp.totals('orders', (SELECT id FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1')) ->> 'pending')::numeric = 5000,
  'the order is charged 5000 and the reference is a pending report');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$UPDATE public.orders SET payment_status = 'paid' WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1'$$),
  'admins can''t mark an order paid by editing it');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f3',
  $$SELECT public.confirm_order_payment((SELECT id FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1'))$$),
  'travel staff can''t confirm marketplace payments');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.confirm_order_payment((SELECT id FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1'))$$),
  'finance confirms the order payment');
SELECT pg_temp.expect((SELECT payment_status || ' ' || status FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1') = 'paid processing',
  'the order is paid and processing');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.finance_refund_payment((SELECT p.id FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id
     JOIN public.orders o ON o.id = a.entity_id WHERE o.buyer_id = '00000000-0000-4000-8000-0000000000f1'), 5000, 'Out of stock')$$),
  'admin refunds the whole order');
SELECT pg_temp.expect((SELECT payment_status FROM public.orders WHERE buyer_id = '00000000-0000-4000-8000-0000000000f1') = 'refunded',
  'the order shows refunded');
SELECT pg_temp.expect(pg_temp.visible('00000000-0000-4000-8000-0000000000f2',
  $$SELECT 1 FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id WHERE a.module = 'marketplace'$$) = 0,
  'another customer can''t see the order''s payments');

-- ---------- Subscriptions ----------
SELECT pg_temp.refused('00000000-0000-4000-8000-0000000000f2', $$SELECT public.start_trial()$$);
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f2', $$SELECT public.submit_subscription_payment('MP-SUB-1')$$),
  'subscriber reports a payment');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f2', $$SELECT public.submit_subscription_payment('MP-SUB-2')$$),
  'a second report waits until the first is checked');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f5',
  $$SELECT public.activate_subscription((SELECT id FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-0000000000f2'))$$),
  'finance activates the subscription');
SELECT pg_temp.expect((SELECT status FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-0000000000f2') = 'active'
  AND (pg_temp.totals('subscriptions', (SELECT id FROM public.subscriptions WHERE user_id = '00000000-0000-4000-8000-0000000000f2')) ->> 'paid')::numeric = 200,
  'active, with the 200 payment on record');

-- ---------- Software ----------
SELECT pg_temp.refused(NULL, $$INSERT INTO public.software_bookings (full_name, email, phone, service_type, project_description)
  VALUES ('Soft Client', 's@x.co', '3', 'web', 'A site')$$);
UPDATE public.software_bookings SET agreed_price = 1001 WHERE full_name = 'Soft Client';
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$UPDATE public.software_bookings SET deposit_paid = true WHERE full_name = 'Soft Client'$$),
  'the deposit flag can''t be set by hand');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.software_record_installment((SELECT id FROM public.software_bookings WHERE full_name = 'Soft Client'), 'deposit', 'cash', '')$$),
  'admin records the deposit');
SELECT pg_temp.expect((SELECT deposit_paid AND NOT final_paid FROM public.software_bookings WHERE full_name = 'Soft Client')
  AND (pg_temp.totals('software_bookings', (SELECT id FROM public.software_bookings WHERE full_name = 'Soft Client')) ->> 'paid')::numeric = 501,
  'deposit (501 of 1001) paid, final not');
SELECT pg_temp.expect(pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.software_record_installment((SELECT id FROM public.software_bookings WHERE full_name = 'Soft Client'), 'deposit', 'cash', '')$$),
  'the deposit can''t be recorded twice');
SELECT pg_temp.expect(NOT pg_temp.refused('00000000-0000-4000-8000-0000000000f6',
  $$SELECT public.software_record_installment((SELECT id FROM public.software_bookings WHERE full_name = 'Soft Client'), 'final', 'bank', 'FT-SOFT-1')$$),
  'admin records the final payment');
SELECT pg_temp.expect((SELECT final_paid FROM public.software_bookings WHERE full_name = 'Soft Client')
  AND (pg_temp.totals('software_bookings', (SELECT id FROM public.software_bookings WHERE full_name = 'Soft Client')) ->> 'balance')::numeric = 0,
  'fully paid, balance 0');

ROLLBACK;

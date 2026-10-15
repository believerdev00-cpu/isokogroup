-- Regression test for 20261015100000_currencies.sql and
-- 20261015110000_advert_currency.sql (advertising priced and paid in the
-- advertiser's own currency):
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/advert_currency.test.sql
--
-- The rules worth a test are the ones a careless change would break and
-- nobody would notice until somebody was billed wrongly:
--
--   * a quote and a budget are compared only in the same currency
--   * a price that came out of a conversion cannot be accepted until an
--     administrator has confirmed the rate
--   * what was accepted never changes afterwards, whatever the market does
--   * no rate is ever invented: a missing one makes a conversion impossible,
--     not approximate
--   * nothing is overwritten -- a revised budget and a revised quote are new
--     rows beside the old ones
--
-- Rolled back at the end.
BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-00000000f601', 'adv-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f602', 'adv-seller@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f603', 'adv-other@test.local', 'authenticated', 'authenticated');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000f601', 'admin');

\set admin '''00000000-0000-4000-8000-00000000f601'''
\set seller '''00000000-0000-4000-8000-00000000f602'''
\set other '''00000000-0000-4000-8000-00000000f603'''

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

-- Runs something as a signed-in person and gives back what it returned. The
-- claim is what auth.uid() reads, so this is enough for the SECURITY DEFINER
-- functions, which do their own checking.
CREATE FUNCTION pg_temp.as_user(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

-- The same, but as the 'authenticated' role rather than the owner, which is
-- the only way a row policy is actually in force. Reading a table directly
-- through as_user() above would run as the superuser and pass whatever the
-- policy said, which is worse than no test at all.
CREATE FUNCTION pg_temp.as_role(p_user text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO v;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

-- ============== RATES TO WORK WITH ==============
-- Deliberately not real: these are the numbers the assertions below do their
-- arithmetic with, and a test that depended on today's market would fail on
-- a Tuesday.
INSERT INTO public.fx_rates (quote, base, rate, fetched_at, source) VALUES
  ('RWF', 'USD', 1450, now(), 'test'),
  ('KES', 'USD', 130, now(), 'test'),
  ('EUR', 'USD', 0.92, now(), 'test')
ON CONFLICT (quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = EXCLUDED.fetched_at, source = 'test';
-- Burundi's franc is left without a rate on purpose: it is the "we cannot
-- convert that" case, which has to be an answer and not an estimate.
DELETE FROM public.fx_rates WHERE quote IN ('BIF', 'UGX', 'TZS');

-- ---------- Rounding ----------
SELECT pg_temp.expect(public.money_round(1250.4567, 'USD') = 1250.46, 'a dollar amount rounds to the cent');
SELECT pg_temp.expect(public.money_round(1250.4567, 'RWF') = 1250, 'a franc amount rounds to the franc');
SELECT pg_temp.expect(public.money_round(1250.5, 'RWF') = 1251, 'and half a franc rounds up');
SELECT pg_temp.expect(public.money_round(100, 'XXX') IS NULL, 'a currency we do not know rounds to nothing, rather than guessing');

-- ---------- Converting ----------
SELECT pg_temp.expect(
  (public.fx_convert(10, 'USD', 'RWF') ->> 'amount')::numeric = 14500,
  'ten dollars converts to francs at the stored rate');
SELECT pg_temp.expect(
  (public.fx_convert(10, 'USD', 'RWF') ->> 'indicative')::boolean,
  'and says it is indicative, because nobody has confirmed it');
SELECT pg_temp.expect(
  (public.fx_convert(1450, 'RWF', 'USD') ->> 'amount')::numeric = 1.00,
  'and back again');
SELECT pg_temp.expect(
  -- 1,300 KES is 10 USD is 14,500 RWF. The cross rate goes through the base.
  (public.fx_convert(1300, 'KES', 'RWF') ->> 'amount')::numeric = 14500,
  'a shilling price in francs goes through the dollar');
SELECT pg_temp.expect(
  (public.fx_convert(500, 'RWF', 'RWF') ->> 'rate')::numeric = 1
  AND NOT (public.fx_convert(500, 'RWF', 'RWF') ->> 'indicative')::boolean,
  'a currency into itself is one to one and needs nobody to confirm it');
SELECT pg_temp.expect(public.fx_convert(10, 'USD', 'BIF') IS NULL,
  'with no rate for a currency, there is no conversion -- not an approximate one');
SELECT pg_temp.expect(
  public.fx_convert(10, 'USD', 'RWF') -> 'fetched_at' IS NOT NULL
  AND public.fx_convert(10, 'USD', 'RWF') ->> 'source' = 'test',
  'every conversion carries when the rate was read and who said so');

-- A rate that has gone stale stops being a rate.
UPDATE public.fx_rates SET fetched_at = now() - interval '40 days' WHERE quote = 'EUR';
SELECT pg_temp.expect(public.fx_convert(10, 'USD', 'EUR') IS NULL,
  'a rate older than the staleness setting is not used at all');
UPDATE public.fx_rates SET fetched_at = now() WHERE quote = 'EUR';

-- ---------- Who may change the lists ----------
SELECT pg_temp.expect(NOT pg_temp.refused(NULL, 'SELECT 1 FROM public.currencies'),
  'the currency list is public, because the form needs it before anyone signs in');
-- Row-level security turns this into an update of nothing rather than an
-- error, so what is asserted is that the franc is still being quoted -- which
-- is the part that matters.
SELECT pg_temp.expect(
  pg_temp.refused(:other, $$UPDATE public.currencies SET is_active = false WHERE code = 'RWF' RETURNING 1$$)
  OR public.currency_active('RWF'),
  'an ordinary signed-in person cannot withdraw a currency');
SELECT pg_temp.expect(
  pg_temp.refused(:other, $$UPDATE public.country_currency SET currency = 'USD' WHERE country = 'RW' RETURNING 1$$)
  OR (SELECT currency = 'RWF' FROM public.country_currency WHERE country = 'RW'),
  'nor change what currency a country is quoted in');
SELECT pg_temp.expect(
  pg_temp.refused(:admin, $$INSERT INTO public.fx_rates (quote, rate) VALUES ('RWF', 1) RETURNING 1$$),
  'not even an administrator may type an exchange rate: they come from the provider');

-- ============== A REQUEST, IN SHILLINGS ==============
-- Submitted the way the form submits it, so the function's own validation is
-- what is being tested and not a hand-built row.
SELECT pg_temp.as_user(:seller, $$
  SELECT public.advert_submit_request(jsonb_build_object(
    'full_name', 'Jane Advertiser', 'company', 'Nairobi Coffee Ltd',
    'email', 'jane@example.com', 'phone', '+254722000000',
    'industry', 'Food and beverage', 'what_to_advertise', 'Our new roastery',
    'placement', 'homepage', 'duration', '1 month', 'country', 'KE',
    'budget_amount', '60000', 'budget_currency', 'KES', 'preferred_days', '30'))
$$);

CREATE FUNCTION pg_temp.req() RETURNS public.advert_requests LANGUAGE sql AS $$
  SELECT * FROM public.advert_requests WHERE company = 'Nairobi Coffee Ltd' LIMIT 1;
$$;

SELECT pg_temp.expect((pg_temp.req()).budget_amount = 60000 AND (pg_temp.req()).budget_currency = 'KES',
  'the budget is stored in the currency it was given in');
SELECT pg_temp.expect((pg_temp.req()).budget_rwf IS NULL,
  'and the old francs-only column is left alone rather than filled with a converted figure');
SELECT pg_temp.expect(
  (SELECT count(*) FROM public.advert_budget_revisions WHERE request_id = (pg_temp.req()).id) = 1,
  'the budget as submitted is the first revision, so it survives being changed');

-- An amount with no currency beside it is not money.
SELECT pg_temp.expect(
  pg_temp.refused(:seller, $$SELECT public.advert_submit_request(jsonb_build_object(
    'full_name', 'A', 'company', 'B', 'email', 'a@b.co', 'phone', '0788000000',
    'industry', 'C', 'what_to_advertise', 'D', 'placement', 'homepage', 'duration', '1 month',
    'budget_amount', '500'))$$),
  'a budget with no currency is refused');
SELECT pg_temp.expect(
  pg_temp.refused(:seller, $$SELECT public.advert_submit_request(jsonb_build_object(
    'full_name', 'A', 'company', 'B', 'email', 'a@b.co', 'phone', '0788000000',
    'industry', 'C', 'what_to_advertise', 'D', 'placement', 'homepage', 'duration', '1 month',
    'budget_amount', '500', 'budget_currency', 'ZWL'))$$),
  'and so is one in a currency we do not quote');

-- ============== NO RATE CARD ==============
-- There is deliberately no price list: advertising here is negotiated, so the
-- advertiser's stated maximum is the only anchor a quote has, and a quote is
-- never the output of an exchange rate.
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'advert_rates'),
  'there is no standing rate card to quote from');

-- ============== QUOTING ==============
SELECT pg_temp.expect(
  pg_temp.refused(:other, format($$SELECT public.advert_propose_agreement(
    jsonb_build_object('request_id', %L, 'currency', 'KES', 'daily_rate', '1200', 'days', '30'))$$,
    (pg_temp.req()).id)),
  'somebody who is not the advertising desk cannot quote');

-- The budget is 60,000 KES. Thirty days at 1,200 is 36,000: inside it.
SELECT pg_temp.as_user(:admin, format($$SELECT public.advert_propose_agreement(
  jsonb_build_object('request_id', %L, 'currency', 'KES', 'daily_rate', '1200', 'days', '30'))$$,
  (pg_temp.req()).id));

CREATE FUNCTION pg_temp.quote(p_rev integer DEFAULT NULL) RETURNS public.advert_agreements LANGUAGE sql AS $$
  SELECT * FROM public.advert_agreements
   WHERE request_id = (pg_temp.req()).id AND (p_rev IS NULL OR revision = p_rev)
   ORDER BY revision DESC LIMIT 1;
$$;

SELECT pg_temp.expect((pg_temp.quote()).total = 36000 AND (pg_temp.quote()).currency = 'KES',
  'the total follows the arithmetic, in the quoted currency');
SELECT pg_temp.expect((pg_temp.quote()).fx_rate IS NULL,
  'a rate that was set, not converted, leaves no exchange rate on the agreement');
SELECT pg_temp.expect((pg_temp.req()).status = 'quoted', 'and the request says it has been quoted');

-- Over the budget, in the same currency: refused with the figures.
SELECT pg_temp.expect(
  pg_temp.refused(:admin, format($$SELECT public.advert_propose_agreement(
    jsonb_build_object('request_id', %L, 'currency', 'KES', 'daily_rate', '2500', 'days', '30'))$$,
    (pg_temp.req()).id)),
  'a quote over the advertiser stated maximum is refused');

-- In another currency: refused without being converted, which is the point.
SELECT pg_temp.expect(
  pg_temp.refused(:admin, format($$SELECT public.advert_propose_agreement(
    jsonb_build_object('request_id', %L, 'currency', 'RWF', 'daily_rate', '14500', 'days', '30'))$$,
    (pg_temp.req()).id)),
  'a quote in a currency the budget is not in is refused rather than converted');
SELECT pg_temp.expect(
  current_setting('isoko.last_error', true) LIKE '%60000%KES%',
  'and the refusal says what the budget actually was');

-- A total above the arithmetic is a slip, and somebody would be charged it.
SELECT pg_temp.expect(
  pg_temp.refused(:admin, format($$SELECT public.advert_propose_agreement(
    jsonb_build_object('request_id', %L, 'currency', 'KES', 'daily_rate', '1000', 'days', '30',
                       'total', '40000'))$$, (pg_temp.req()).id)),
  'a total larger than the days times the rate is refused');

-- Coming down to meet a budget is a negotiation, and allowed.
SELECT pg_temp.as_user(:admin, format($$SELECT public.advert_propose_agreement(
  jsonb_build_object('request_id', %L, 'currency', 'KES', 'daily_rate', '1200', 'days', '30',
                     'total', '30000', 'note', 'Ten per cent off for a first booking'))$$,
  (pg_temp.req()).id));
SELECT pg_temp.expect((pg_temp.quote()).revision = 2 AND (pg_temp.quote()).total = 30000,
  'a revised quote is a new revision');
SELECT pg_temp.expect((pg_temp.quote(1)).status = 'superseded',
  'and the one it replaced is marked superseded rather than edited');

-- ============== RESTATING A BUDGET ==============
-- The advertiser restates their budget in francs, which is the only thing
-- that lets a franc quote be checked against it.
SELECT pg_temp.as_user(:seller, format($$SELECT public.advert_revise_budget(
  jsonb_build_object('request_id', %L, 'amount', '600000', 'currency', 'RWF'))$$, (pg_temp.req()).id));
SELECT pg_temp.expect((pg_temp.req()).budget_currency = 'RWF' AND (pg_temp.req()).budget_amount = 600000,
  'the advertiser may restate their own maximum in another currency');
SELECT pg_temp.expect(
  (SELECT count(*) FROM public.advert_budget_revisions WHERE request_id = (pg_temp.req()).id) = 2,
  'and the maximum they gave before is kept beside it');
SELECT pg_temp.expect((pg_temp.quote(2)).status = 'superseded',
  'a quote in the currency they have moved away from is taken off the table');

-- Quoted again, now in the currency they moved to.
SELECT pg_temp.as_user(:admin, format($$SELECT public.advert_propose_agreement(
  jsonb_build_object('request_id', %L, 'currency', 'RWF', 'daily_rate', '14500', 'days', '30',
                     'starts_on', (current_date - 1)::text))$$,
  (pg_temp.req()).id));

-- No rate card means no conversion, which means no rate for anybody to
-- confirm. The columns that would hold one stay empty, and the advertiser can
-- accept straight away rather than waiting on a confirmation that will never
-- come.
SELECT pg_temp.expect((pg_temp.quote()).fx_rate IS NULL AND (pg_temp.quote()).fx_base IS NULL,
  'a quote typed in the advertiser currency carries no exchange rate');
SELECT pg_temp.expect((pg_temp.quote()).rate_confirmed_at IS NULL,
  'and so there is nothing for an administrator to confirm');

-- ============== ACCEPTING, AND THE MONEY ==============
SELECT pg_temp.expect(
  pg_temp.refused(:other, format($$SELECT public.advert_accept_agreement(%L)$$, (pg_temp.quote()).id)),
  'a stranger cannot accept somebody else quote');

SELECT pg_temp.as_user(:seller, format($$SELECT public.advert_accept_agreement(%L)$$, (pg_temp.quote()).id));
SELECT pg_temp.expect((pg_temp.quote()).status = 'accepted', 'the advertiser accepts their own quote');
SELECT pg_temp.expect((pg_temp.req()).status = 'accepted', 'and the request follows');

CREATE FUNCTION pg_temp.acct() RETURNS public.finance_accounts LANGUAGE sql AS $$
  SELECT * FROM public.finance_accounts
   WHERE entity_table = 'advert_requests' AND entity_id = (pg_temp.req()).id;
$$;

SELECT pg_temp.expect((pg_temp.acct()).id IS NOT NULL AND (pg_temp.acct()).module = 'advertising',
  'accepting opens a finance account on the advertising module');
SELECT pg_temp.expect((pg_temp.acct()).currency = 'RWF',
  'in the currency of the agreement, not the company home currency');
SELECT pg_temp.expect(
  (public.finance_totals((pg_temp.acct()).id) ->> 'charged')::numeric = 435000,
  'and charges the agreed fee -- 30 days at 14,500 francs');

-- ---------- What was agreed stays agreed ----------
SELECT pg_temp.expect(
  pg_temp.refused(:admin, format($$UPDATE public.advert_agreements SET total = 1 WHERE id = %L RETURNING 1$$,
    (pg_temp.quote()).id))
  OR (pg_temp.quote()).total = 435000,
  'an accepted fee cannot be edited afterwards, administrator or not');

-- The market moves. Nothing that was accepted moves with it.
UPDATE public.fx_rates SET rate = 2000 WHERE quote = 'RWF';
SELECT pg_temp.expect((pg_temp.quote()).total = 435000 AND (pg_temp.quote()).currency = 'RWF',
  'a rate that changes later does not change what the advertiser owes');
SELECT pg_temp.expect(
  (public.finance_totals((pg_temp.acct()).id) ->> 'charged')::numeric = 435000,
  'nor what the ledger says they were charged');
UPDATE public.fx_rates SET rate = 1450 WHERE quote = 'RWF';

SELECT pg_temp.expect(
  pg_temp.refused(:seller, format($$SELECT public.advert_revise_budget(
    jsonb_build_object('request_id', %L, 'amount', '1', 'currency', 'RWF'))$$, (pg_temp.req()).id)),
  'and a budget cannot be revised once there is an agreement to honour');

-- One agreement in force, ever.
SELECT pg_temp.as_user(:admin, format($$SELECT public.advert_propose_agreement(
  jsonb_build_object('request_id', %L, 'currency', 'RWF', 'daily_rate', '10000', 'days', '10'))$$,
  (pg_temp.req()).id));
SELECT pg_temp.expect(
  pg_temp.refused(:seller, format($$SELECT public.advert_accept_agreement(%L)$$, (pg_temp.quote()).id)),
  'a second agreement cannot be accepted while one is in force');

-- ============== WHAT IS ON AIR ==============
-- The band on the homepage. The rule being tested is the one that decides
-- whether advertising here is free: picking products on the form must not put
-- them on the front page, and an advert must come down when its run ends.
CREATE FUNCTION pg_temp.on_air() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.advert_live_products();
$$;
CREATE FUNCTION pg_temp.on_air(p_product uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.advert_live_products() WHERE product_id = p_product);
$$;

INSERT INTO public.products (id, seller_id, name, description, price, category, image_url, stock, status) VALUES
  ('00000000-0000-4000-8000-0000000000a1', :seller, 'Roasted beans, 1kg', 'A', 9000, 'Food', 'https://example.test/a.jpg', 20, 'active'),
  ('00000000-0000-4000-8000-0000000000a2', :seller, 'Roasted beans, 250g', 'B', 3000, 'Food', 'https://example.test/b.jpg', 20, 'active'),
  -- out of stock: advertising something nobody can buy sends a visitor to a
  -- marketplace that does not have it
  ('00000000-0000-4000-8000-0000000000a3', :seller, 'Sold out blend', 'C', 3000, 'Food', 'https://example.test/c.jpg', 0, 'active'),
  -- somebody else's listing, which must never be advertisable by this seller
  ('00000000-0000-4000-8000-0000000000a4', :other, 'Not their product', 'D', 3000, 'Food', 'https://example.test/d.jpg', 5, 'active');

SELECT pg_temp.expect(pg_temp.on_air() = 0, 'nothing is on air before anybody has chosen a product');

-- The accepted agreement from above belongs to this request, so attaching
-- products to it is what puts them on air.
INSERT INTO public.advert_request_products (request_id, product_id, sort) VALUES
  ((pg_temp.req()).id, '00000000-0000-4000-8000-0000000000a1', 0),
  ((pg_temp.req()).id, '00000000-0000-4000-8000-0000000000a2', 1),
  ((pg_temp.req()).id, '00000000-0000-4000-8000-0000000000a3', 2);

SELECT pg_temp.expect(pg_temp.on_air('00000000-0000-4000-8000-0000000000a1')
  AND pg_temp.on_air('00000000-0000-4000-8000-0000000000a2'),
  'a chosen listing goes on air while the accepted agreement is running');
SELECT pg_temp.expect(NOT pg_temp.on_air('00000000-0000-4000-8000-0000000000a3'),
  'but one that is out of stock does not');

-- A seller cannot choose somebody else's product in the first place.
SELECT pg_temp.expect(
  pg_temp.refused(:seller, $$SELECT public.advert_submit_request(jsonb_build_object(
    'full_name', 'Jane', 'company', 'Nairobi Coffee Ltd', 'email', 'jane@example.com',
    'phone', '+254722000000', 'industry', 'Food', 'what_to_advertise', 'Theirs',
    'placement', 'homepage', 'duration', '1 month',
    'product_ids', jsonb_build_array('00000000-0000-4000-8000-0000000000a4')))$$),
  'a seller cannot ask for somebody else listing to be advertised');

-- The run ends. Nothing has to be switched off by hand.
UPDATE public.advert_agreements
   SET starts_on = current_date - 40, ends_on = current_date - 10
 WHERE id = (SELECT id FROM public.advert_agreements
              WHERE request_id = (pg_temp.req()).id AND status = 'accepted');
SELECT pg_temp.expect(pg_temp.on_air() = 0, 'an advert whose run has ended comes down by itself');

UPDATE public.advert_agreements
   SET starts_on = current_date + 10, ends_on = current_date + 40
 WHERE id = (SELECT id FROM public.advert_agreements
              WHERE request_id = (pg_temp.req()).id AND status = 'accepted');
SELECT pg_temp.expect(pg_temp.on_air() = 0, 'and one whose run has not started is not on air early');

UPDATE public.advert_agreements
   SET starts_on = current_date - 1, ends_on = current_date + 28
 WHERE id = (SELECT id FROM public.advert_agreements
              WHERE request_id = (pg_temp.req()).id AND status = 'accepted');
SELECT pg_temp.expect(pg_temp.on_air() = 2, 'inside its run, both sellable listings are carried');

-- The important one: an unaccepted request buys nothing.
UPDATE public.advert_agreements SET status = 'withdrawn'
 WHERE request_id = (pg_temp.req()).id AND status = 'accepted';
SELECT pg_temp.expect(pg_temp.on_air() = 0,
  'without an accepted agreement nothing is on air, so the band cannot be had for free');

-- Put it back for the reporting assertions that follow.
UPDATE public.advert_agreements SET status = 'accepted'
 WHERE request_id = (pg_temp.req()).id AND status = 'withdrawn' AND total = 435000;

SELECT pg_temp.expect(
  NOT pg_temp.refused(NULL, 'SELECT 1 FROM public.advert_live_products()'),
  'a signed-out visitor can read the band, because it is on the homepage');
SELECT pg_temp.expect(
  pg_temp.refused(NULL, 'SELECT 1 FROM public.advert_agreements'),
  'while the agreements behind it stay closed to them');

-- ============== WHAT CAN PAY IT ==============
UPDATE public.platform_settings SET value = 'on' WHERE key = 'mobile_money';

SELECT pg_temp.expect(
  (SELECT count(*) FROM jsonb_array_elements(public.payment_methods_for('RWF', 'RW') -> 'available') e
    WHERE e ->> 'provider' = 'itecpay') = 1,
  'francs from Rwanda can be paid from a phone');
SELECT pg_temp.expect(
  (SELECT count(*) FROM jsonb_array_elements(public.payment_methods_for('KES', 'KE') -> 'available') e
    WHERE e ->> 'provider' = 'itecpay') = 0,
  'shillings cannot -- ItecPay takes francs and nothing else');
SELECT pg_temp.expect(
  (SELECT count(*) FROM jsonb_array_elements(public.payment_methods_for('KES', 'KE') -> 'unavailable') e
    WHERE e ->> 'label' LIKE 'Mobile Money%') = 1,
  'and the method that cannot take them is listed with the reason, not hidden');
SELECT pg_temp.expect(
  (SELECT count(*) FROM jsonb_array_elements(public.payment_methods_for('KES', 'KE') -> 'available') e
    WHERE e ->> 'method' = 'bank') = 1,
  'while the bank transfer that can take them is offered');

UPDATE public.platform_settings SET value = 'off' WHERE key = 'mobile_money';
SELECT pg_temp.expect(
  (SELECT count(*) FROM jsonb_array_elements(public.payment_methods_for('RWF', 'RW') -> 'available') e
    WHERE e ->> 'provider' = 'itecpay') = 0,
  'a provider that is switched off is not offered even where it would work');
UPDATE public.platform_settings SET value = 'on' WHERE key = 'mobile_money';

-- ============== FEES AND SETTLEMENT ==============
-- A payment recorded by hand goes through no provider, so no fee comes off
-- it. An invented one would be worse than none.
SELECT pg_temp.as_user(:admin, format($$SELECT to_jsonb(public.finance_record_payment(
  'advert_requests', %L, 100000, 'bank', 'TEST-REF-1'))$$, (pg_temp.req()).id));

SELECT pg_temp.expect(
  (SELECT fee_amount IS NULL FROM public.finance_payments
    WHERE account_id = (pg_temp.acct()).id AND reference = 'TEST-REF-1'),
  'a hand-recorded bank payment carries no invented provider fee');

-- ItecPay keeps 3% of a mobile-money payment (docs/ITECPAY_INTEGRATION.md),
-- so what settles is not what was paid, and a report that says otherwise is
-- wrong. The provider path inserts the payment itself; this exercises the
-- stamping that path relies on.
SELECT public.finance_begin();
INSERT INTO public.finance_payments (account_id, amount, currency, method, provider, reference, status)
VALUES ((pg_temp.acct()).id, 100000, 'RWF', 'momo', 'itecpay', 'TEST-REF-2', 'successful');

SELECT pg_temp.expect(
  (SELECT fee_amount FROM public.finance_payments
    WHERE account_id = (pg_temp.acct()).id AND reference = 'TEST-REF-2') = 3000,
  'the provider fee is worked out from the rule in force');
SELECT pg_temp.expect(
  (SELECT settlement_amount FROM public.finance_payments
    WHERE account_id = (pg_temp.acct()).id AND reference = 'TEST-REF-2') = 97000,
  'and what is expected to settle is recorded beside it');
SELECT pg_temp.expect(
  (SELECT fee_rule FROM public.finance_payments
    WHERE account_id = (pg_temp.acct()).id AND reference = 'TEST-REF-2') = 'itecpay_momo',
  'with the rule that said so, so the figure can be explained later');

-- A rule that changes next year must not rewrite last year's settlement.
UPDATE public.payment_fee_rules SET percent = 9 WHERE id = 'itecpay_momo';
SELECT pg_temp.expect(
  (SELECT fee_amount FROM public.finance_payments
    WHERE account_id = (pg_temp.acct()).id AND reference = 'TEST-REF-2') = 3000,
  'a later change to the fee schedule leaves a recorded payment alone');
UPDATE public.payment_fee_rules SET percent = 3 WHERE id = 'itecpay_momo';

-- ============== REPORTING ==============
CREATE FUNCTION pg_temp.report(p_in text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000f601',
    format('SELECT public.advert_revenue_report(%L)', p_in));
$$;

-- Both payments above: the bank transfer and the mobile-money one.
SELECT pg_temp.expect(
  (SELECT (e ->> 'paid')::numeric FROM jsonb_array_elements(pg_temp.report('RWF') -> 'by_currency') e
    WHERE e ->> 'currency' = 'RWF') = 200000,
  'the report says what was paid, in the currency it was paid in');
SELECT pg_temp.expect(
  (SELECT (e ->> 'fees')::numeric FROM jsonb_array_elements(pg_temp.report('RWF') -> 'by_currency') e
    WHERE e ->> 'currency' = 'RWF') = 3000,
  'with the fees that came off it -- only the one that went through a provider');
SELECT pg_temp.expect(
  (SELECT (e ->> 'settled')::numeric FROM jsonb_array_elements(pg_temp.report('RWF') -> 'by_currency') e
    WHERE e ->> 'currency' = 'RWF') = 197000,
  'and so what actually settles is less than what was paid');
SELECT pg_temp.expect(
  (pg_temp.report('USD') ->> 'reporting_currency') = 'USD'
  AND (pg_temp.report('USD') ->> 'consolidated_paid')::numeric > 0,
  'and consolidates into whatever currency is asked for');
SELECT pg_temp.expect(
  (SELECT (e ->> 'paid')::numeric FROM jsonb_array_elements(pg_temp.report('USD') -> 'by_currency') e
    WHERE e ->> 'currency' = 'RWF') = 200000,
  'while the original amount is still there, unconverted');
SELECT pg_temp.expect(
  -- 200,000 RWF at 1,450 to the dollar is 137.93, and the report says so with
  -- the rate it used beside it.
  (pg_temp.report('USD') ->> 'consolidated_paid')::numeric = 137.93,
  'and the consolidated figure is the conversion of those originals');

-- A currency with no rate is named rather than silently dropped from the sum.
UPDATE public.finance_accounts SET currency = 'BIF' WHERE id = (pg_temp.acct()).id;
SELECT pg_temp.expect(
  pg_temp.report('USD') -> 'not_converted' @> '["BIF"]'::jsonb,
  'a currency that cannot be converted is named, not quietly left out of the total');
UPDATE public.finance_accounts SET currency = 'RWF' WHERE id = (pg_temp.acct()).id;

SELECT pg_temp.expect(
  pg_temp.refused(:other, 'SELECT public.advert_revenue_report(NULL)'),
  'and nobody outside the office can read the revenue at all');

-- ============== WHAT AN ADVERTISER SEES ==============
SELECT pg_temp.expect(
  pg_temp.as_role(:seller, 'SELECT to_jsonb(count(*)) FROM public.advert_agreements')::numeric > 0,
  'an advertiser can read the quotes on their own request');
SELECT pg_temp.expect(
  pg_temp.as_role(:other, 'SELECT to_jsonb(count(*)) FROM public.advert_agreements')::numeric = 0,
  'and sees none of anybody else''s');
SELECT pg_temp.expect(
  pg_temp.as_role(:other, 'SELECT to_jsonb(count(*)) FROM public.advert_budget_revisions')::numeric = 0,
  'nor what anybody else said they could spend');
SELECT pg_temp.expect(
  pg_temp.as_role(:seller, 'SELECT to_jsonb(count(*)) FROM public.advert_budget_revisions')::numeric = 2,
  'while their own budget history is theirs to read');
SELECT pg_temp.expect(
  pg_temp.refused(:seller, $$INSERT INTO public.advert_budget_revisions (request_id, amount, currency)
    VALUES ((SELECT id FROM public.advert_requests LIMIT 1), 1, 'RWF') RETURNING 1$$),
  'a budget revision is a statement somebody made, not a row anybody can write');

ROLLBACK;

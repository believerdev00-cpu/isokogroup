-- Advertising, priced and paid in the advertiser's own currency.
--
-- What existed: a lead form. A business typed a budget "in RWF", a free-text
-- duration ("3 months"), and somebody rang them. The quote, the agreement and
-- the money all happened in email and in somebody's notebook, so the site
-- held no record of what was agreed, in what currency, at what rate, or
-- whether it had been paid.
--
-- What exists now, on top of the currency groundwork in
-- 20261015100000_currencies.sql:
--
--   advert_budget_revisions                every budget the advertiser has named
--   advert_agreements                      each quote, in the quoted currency
--   advert_request_products                the listings they want put on air
--   payment_methods                        which ways to pay exist, and where
--
-- The money itself is not reinvented here. An accepted agreement opens a
-- finance account exactly as an accepted consultancy proposal does, and from
-- there the existing engine does the work: the ledger, the reported payment
-- that is not money until somebody checks it, the provider event whose amount
-- and currency must match, the refunds. This file adds 'advertising' to that
-- engine and nothing more.
--
-- The rules that needed writing down, because they are the ones a careless
-- change would break:
--
--   * A quote and a budget are only ever compared in the same currency. If
--     the advertiser named their maximum in shillings, a franc quote is
--     refused outright rather than converted and waved through.
--   * A price that came out of a conversion is not a price until an
--     administrator confirms the rate. The advertiser cannot accept it before
--     then, and the rate they accepted is stored on the agreement, so a
--     moving market never changes what they owe.
--   * Nothing is overwritten. A revised budget is a new row; a revised quote
--     is a new revision and the old one is marked superseded.

-- ============== NO RATE CARD ==============
-- There deliberately is not one. Advertising here is negotiated: the
-- advertiser says what they are willing to spend and the office quotes
-- against that figure, placement by placement. A standing price list was
-- built first and taken out again, because a published day rate is not how
-- this business sells and an unset one would only ever be an empty screen
-- somebody had to be told to ignore.
--
-- So the only anchor a quote has is the advertiser's own stated maximum,
-- which advert_propose_agreement() below enforces -- in that maximum's own
-- currency, never a converted one.

-- ============== WHAT THE ADVERTISER ASKED FOR ==============
ALTER TABLE public.advert_requests
  ADD COLUMN country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD COLUMN budget_currency text REFERENCES public.currencies (code),
  ADD COLUMN budget_amount numeric(14,2) CHECK (budget_amount IS NULL OR budget_amount > 0),
  ADD COLUMN preferred_start date,
  ADD COLUMN preferred_days integer CHECK (preferred_days IS NULL OR preferred_days BETWEEN 1 AND 3650),
  ADD CONSTRAINT advert_budget_has_a_currency
    CHECK ((budget_amount IS NULL) = (budget_currency IS NULL));

COMMENT ON COLUMN public.advert_requests.budget_rwf IS
  'Historical. Every budget before 2026-10-15 was francs by assumption; those rows are copied into budget_amount/budget_currency below and this column is left exactly as it was written. New requests do not set it.';
COMMENT ON COLUMN public.advert_requests.budget_amount IS
  'The advertiser maximum, in budget_currency. Never compared with an amount in another currency.';

-- ============== THE LISTINGS THEY WANT PUT ON AIR ==============
-- A seller uploads their own products in the marketplace. When they want one
-- carried in the advertising band they press "Advertise Here" and pick some
-- of them -- several, not one, because a seller advertising a line advertises
-- a line.
--
-- This is the list they picked. It is not yet an advert: what is actually on
-- air is advert_live_products() below, which asks whether there is an
-- accepted agreement and whether today is inside it.
CREATE TABLE public.advert_request_products (
  request_id uuid NOT NULL REFERENCES public.advert_requests (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, product_id)
);
CREATE INDEX advert_request_products_product ON public.advert_request_products (product_id);

COMMENT ON TABLE public.advert_request_products IS
  'The seller own listings they asked to have advertised. Whether any of them is on air is decided by advert_live_products(), not by this table.';

ALTER TABLE public.advert_request_products ENABLE ROW LEVEL SECURITY;

-- A seller sees what they asked for; the desk sees everything. Nobody writes
-- here directly -- the submit function does it, after checking every product
-- belongs to the person asking.
CREATE POLICY "Advertisers read their own chosen products" ON public.advert_request_products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.advert_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));
CREATE POLICY "Advertising staff manage chosen products" ON public.advert_request_products
  FOR ALL TO authenticated
  USING (public.finance_can_collect('advertising'))
  WITH CHECK (public.finance_can_collect('advertising'));
REVOKE ALL ON public.advert_request_products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.advert_request_products FROM authenticated;

-- The francs already on file, said properly. A copy, not a move: the original
-- column keeps what it always held.
UPDATE public.advert_requests
   SET budget_amount = budget_rwf, budget_currency = 'RWF'
 WHERE budget_rwf IS NOT NULL AND budget_amount IS NULL;

-- Every budget the advertiser has ever named, including the first. A revised
-- maximum is a new row, so "what did they say they could spend, and when"
-- survives the revision.
CREATE TABLE public.advert_budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.advert_requests (id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL REFERENCES public.currencies (code),
  -- Who said so: the advertiser themselves, or the office recording what the
  -- advertiser said on the telephone.
  stated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  by_staff boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advert_budget_revisions_request ON public.advert_budget_revisions (request_id, created_at DESC);

INSERT INTO public.advert_budget_revisions (request_id, amount, currency, stated_by, created_at, note)
SELECT id, budget_amount, budget_currency, user_id, created_at, 'as submitted'
  FROM public.advert_requests WHERE budget_amount IS NOT NULL;

-- An amount has to land on a step the currency actually has: there is no such
-- thing as half a franc, and a budget of 1,000.004 is a typo.
CREATE OR REPLACE FUNCTION public.advert_round_budget()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.budget_amount IS NOT NULL THEN
    NEW.budget_amount := public.money_round(NEW.budget_amount, NEW.budget_currency);
    IF NEW.budget_amount IS NULL OR NEW.budget_amount <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That budget is not an amount this currency can be paid in';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER advert_requests_round_budget
  BEFORE INSERT OR UPDATE OF budget_amount, budget_currency ON public.advert_requests
  FOR EACH ROW EXECUTE FUNCTION public.advert_round_budget();

-- ============== THE AGREEMENT ==============
-- One row per quote. A revised quote is revision 2, not an edit of revision 1:
-- what was offered and refused is as much a part of the negotiation as what
-- was agreed.
CREATE TABLE public.advert_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.advert_requests (id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),

  currency text NOT NULL REFERENCES public.currencies (code),
  daily_rate numeric(14,2) NOT NULL CHECK (daily_rate > 0),
  days integer NOT NULL CHECK (days BETWEEN 1 AND 3650),
  -- The fee. Usually daily_rate * days; less when the office has come down to
  -- meet a budget. Never more -- a total above the arithmetic is a mistake,
  -- not a negotiation.
  total numeric(14,2) NOT NULL CHECK (total > 0),
  starts_on date,
  ends_on date CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  payment_terms text NOT NULL DEFAULT '',
  -- Where the office explains itself: why this rate, what the conversion
  -- means, which payment methods can and cannot take this currency.
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 4000),

  -- When the day rate came out of a conversion, the conversion is kept here.
  -- This is the record of what rate the advertiser agreed to, and it is never
  -- recalculated.
  fx_rate numeric CHECK (fx_rate IS NULL OR fx_rate > 0),
  fx_base text REFERENCES public.currencies (code),
  fx_source text,
  fx_read_at timestamptz,
  rate_confirmed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  rate_confirmed_at timestamptz,

  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'declined', 'withdrawn', 'superseded')),
  proposed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  decline_reason text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (request_id, revision),
  -- A conversion that nobody has confirmed cannot be the basis of an accepted
  -- agreement. The database says so, not only the screen.
  CONSTRAINT advert_converted_rate_is_confirmed
    CHECK (status <> 'accepted' OR fx_rate IS NULL OR rate_confirmed_at IS NOT NULL),
  CONSTRAINT advert_confirmation_is_whole
    CHECK ((rate_confirmed_at IS NULL) = (rate_confirmed_by IS NULL))
);

-- One agreement in force per request. Everything else is history.
CREATE UNIQUE INDEX advert_agreements_one_accepted
  ON public.advert_agreements (request_id) WHERE status = 'accepted';
CREATE INDEX advert_agreements_by_request
  ON public.advert_agreements (request_id, revision DESC);

CREATE TRIGGER advert_agreements_updated_at
  BEFORE UPDATE ON public.advert_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.advert_agreements IS
  'Each advertising quote, in the currency it was quoted in, with the exchange rate it used and who confirmed that rate. Revisions supersede; nothing is edited.';

-- ============== WHO MAY SEE AND DO WHAT ==============
ALTER TABLE public.advert_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advert_budget_revisions ENABLE ROW LEVEL SECURITY;

-- An advertiser reads the quotes on their own request. They cannot write one:
-- accepting goes through the function below, which is why there is no update
-- policy for them.
CREATE POLICY "Advertisers read their own agreements" ON public.advert_agreements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.advert_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));
CREATE POLICY "Advertising staff manage agreements" ON public.advert_agreements
  FOR ALL TO authenticated
  USING (public.finance_can_collect('advertising'))
  WITH CHECK (public.finance_can_collect('advertising'));

CREATE POLICY "Advertisers read their own budgets" ON public.advert_budget_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.advert_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));
CREATE POLICY "Advertising staff read budgets" ON public.advert_budget_revisions
  FOR SELECT TO authenticated USING (public.finance_can_collect('advertising'));

REVOKE ALL ON public.advert_agreements, public.advert_budget_revisions FROM anon;
-- A budget revision is a statement somebody made at a time. It is appended by
-- the functions below and never edited or removed afterwards.
REVOKE INSERT, UPDATE, DELETE ON public.advert_budget_revisions FROM authenticated;

-- The reference, the request and the revision are never reassigned by an
-- edit, and a status change is attributed to whoever made it.
CREATE OR REPLACE FUNCTION public.advert_agreement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.request_id := OLD.request_id;
  NEW.revision := OLD.revision;
  NEW.proposed_by := OLD.proposed_by;
  NEW.proposed_at := OLD.proposed_at;
  -- What was agreed is what was agreed. Once an advertiser has accepted, the
  -- price, the currency and the rate behind it are settled: a rate that moves
  -- tomorrow does not change what they owe, and nor does an administrator.
  IF OLD.status = 'accepted' THEN
    NEW.currency := OLD.currency;
    NEW.daily_rate := OLD.daily_rate;
    NEW.days := OLD.days;
    NEW.total := OLD.total;
    NEW.fx_rate := OLD.fx_rate;
    NEW.fx_base := OLD.fx_base;
    NEW.fx_source := OLD.fx_source;
    NEW.fx_read_at := OLD.fx_read_at;
    NEW.rate_confirmed_by := OLD.rate_confirmed_by;
    NEW.rate_confirmed_at := OLD.rate_confirmed_at;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER advert_agreements_guard
  BEFORE UPDATE ON public.advert_agreements
  FOR EACH ROW EXECUTE FUNCTION public.advert_agreement_guard();

-- ============== PROPOSING ==============
-- The office quotes. Every figure is checked here rather than on the screen
-- that sent it: the total follows the arithmetic, the currency is one we
-- quote in, and the budget is only ever read in its own currency.
CREATE OR REPLACE FUNCTION public.advert_propose_agreement(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.advert_requests;
  a public.advert_agreements;
  v_currency text := upper(btrim(coalesce(p ->> 'currency', '')));
  v_days integer;
  v_rate numeric;
  v_total numeric;
  v_arithmetic numeric;

  v_rev integer;
  v_starts date;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect('advertising'),
    'Only the advertising desk and finance staff can quote for advertising');

  SELECT * INTO r FROM public.advert_requests WHERE id = (p ->> 'request_id')::uuid;
  IF r.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That advertising request does not exist';
  END IF;

  IF NOT public.currency_active(v_currency) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Choose a currency ISOKO quotes in';
  END IF;

  v_days := nullif(btrim(coalesce(p ->> 'days', '')), '')::integer;
  IF v_days IS NULL OR v_days < 1 OR v_days > 3650 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the number of days the advert runs';
  END IF;

  v_rate := public.money_round(nullif(btrim(coalesce(p ->> 'daily_rate', '')), '')::numeric, v_currency);
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the daily rate in the quoted currency';
  END IF;

  v_arithmetic := public.money_round(v_rate * v_days, v_currency);
  v_total := public.money_round(nullif(btrim(coalesce(p ->> 'total', '')), '')::numeric, v_currency);
  IF v_total IS NULL THEN
    v_total := v_arithmetic;
  ELSIF v_total > v_arithmetic THEN
    -- Coming down to meet a budget is a negotiation; going up is a slip of
    -- the finger, and it would be charged to somebody.
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = format('The total cannot be more than %s days at %s (%s %s)',
                       v_days, v_rate, v_arithmetic, v_currency);
  ELSIF v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The total has to be an amount';
  END IF;

  -- The budget, read only in its own currency. Converting it here to see
  -- whether the quote "really" fits is exactly the comparison that must not
  -- happen: the advertiser committed to a number of shillings, not to
  -- whatever the shilling is worth this morning.
  IF r.budget_amount IS NOT NULL THEN
    IF r.budget_currency <> v_currency THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = format('This request names a maximum of %s %s. Quote in %s, or ask the advertiser to restate their budget in %s first.',
                         r.budget_amount, r.budget_currency, r.budget_currency, v_currency);
    END IF;
    IF v_total > r.budget_amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = format('%s %s is over the maximum of %s %s this advertiser gave. Lower the quote, or ask them to revise their budget.',
                         v_total, v_currency, r.budget_amount, r.budget_currency);
    END IF;
  END IF;

  v_starts := nullif(btrim(coalesce(p ->> 'starts_on', '')), '')::date;
  v_rev := 1 + coalesce((SELECT max(revision) FROM public.advert_agreements WHERE request_id = r.id), 0);

  -- A fresh quote replaces whatever was on the table.
  UPDATE public.advert_agreements SET status = 'superseded'
   WHERE request_id = r.id AND status = 'proposed';

  -- The fx_* columns are left null, and that is the point: with no rate card
  -- there is nothing to convert. The office types a day rate in the currency
  -- the advertiser named, so a quote is never the output of an exchange rate
  -- and there is no rate for anybody to have to confirm. The columns stay for
  -- the day a quote is settled in a currency the advertiser did not name --
  -- and every screen that shows a rate is already conditional on one being
  -- there, so nothing displays an empty field in the meantime.
  INSERT INTO public.advert_agreements (
    request_id, revision, currency, daily_rate, days, total, starts_on, ends_on,
    payment_terms, note, proposed_by
  ) VALUES (
    r.id, v_rev, v_currency, v_rate, v_days, v_total, v_starts,
    CASE WHEN v_starts IS NULL THEN NULL ELSE v_starts + (v_days - 1) END,
    -- svc_text gives back NULL for something optional that was left out, and
    -- these columns are NOT NULL DEFAULT '': an absent note is an empty one.
    coalesce(public.svc_text(p, 'payment_terms', 'Payment terms', 500, false), ''),
    coalesce(public.svc_text(p, 'note', 'Note', 4000, false), ''),
    auth.uid()
  ) RETURNING * INTO a;

  UPDATE public.advert_requests SET status = 'quoted' WHERE id = r.id AND status IN ('new', 'contacted');

  INSERT INTO public.notifications (user_id, title, body, type, link)
  SELECT r.user_id, 'Your advertising quote is ready',
         format('%s: %s %s for %s day(s). Open it to accept or ask for a change.',
                r.reference, a.total, a.currency, a.days),
         'info', '/dashboard'
   WHERE r.user_id IS NOT NULL;

  RETURN to_jsonb(a);
END $fn$;

COMMENT ON FUNCTION public.advert_propose_agreement(jsonb) IS
  'Quotes for an advertising request. Checks the arithmetic, refuses a total over the advertiser stated maximum, and refuses to compare a budget with a quote in another currency.';

-- An exchange rate an administrator stands behind. Until this is done, a
-- converted quote is a suggestion and the advertiser cannot accept it.
CREATE OR REPLACE FUNCTION public.advert_confirm_rate(p_agreement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE a public.advert_agreements;
BEGIN
  PERFORM public.finance_require(public.is_admin(),
    'Only an administrator can confirm an exchange rate');

  SELECT * INTO a FROM public.advert_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That quote does not exist';
  END IF;
  IF a.status <> 'proposed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only a quote still on the table can be confirmed';
  END IF;

  UPDATE public.advert_agreements
     SET rate_confirmed_by = auth.uid(), rate_confirmed_at = now()
   WHERE id = a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
END $fn$;

-- ============== THE ADVERTISER'S SIDE ==============
-- A revised maximum, said by the advertiser. Appended, never overwritten: the
-- quote that was refused for being over the old budget stays explicable.
CREATE OR REPLACE FUNCTION public.advert_revise_budget(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.advert_requests;
  v_amount numeric;
  v_currency text := upper(btrim(coalesce(p ->> 'currency', '')));
  v_staff boolean;
BEGIN
  SELECT * INTO r FROM public.advert_requests WHERE id = (p ->> 'request_id')::uuid;
  IF r.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That advertising request does not exist';
  END IF;

  v_staff := public.finance_can_collect('advertising');
  PERFORM public.finance_require(v_staff OR (r.user_id IS NOT NULL AND r.user_id = auth.uid()),
    'This is not your advertising request');

  IF NOT public.currency_active(v_currency) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose a currency ISOKO quotes in';
  END IF;

  v_amount := public.money_round(nullif(btrim(coalesce(p ->> 'amount', '')), '')::numeric, v_currency);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the most you are willing to spend';
  END IF;

  -- An accepted agreement is a price, and a budget is no longer the thing
  -- that governs it.
  IF EXISTS (SELECT 1 FROM public.advert_agreements WHERE request_id = r.id AND status = 'accepted') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'This request already has an agreement. Ask the office to quote again instead.';
  END IF;

  INSERT INTO public.advert_budget_revisions (request_id, amount, currency, stated_by, by_staff, note)
  VALUES (r.id, v_amount, v_currency, auth.uid(), v_staff,
          coalesce(public.svc_text(p, 'note', 'Note', 500, false), ''));

  UPDATE public.advert_requests
     SET budget_amount = v_amount, budget_currency = v_currency
   WHERE id = r.id;

  -- A quote written against the old maximum is no longer the quote on the
  -- table: the advertiser has moved, and the office should say what it costs
  -- now rather than leave a stale figure to be accepted.
  UPDATE public.advert_agreements SET status = 'superseded'
   WHERE request_id = r.id AND status = 'proposed' AND currency <> v_currency;

  RETURN jsonb_build_object('amount', v_amount, 'currency', v_currency);
END $fn$;

-- Accepting. The advertiser, or the office recording an acceptance given by
-- telephone or email -- which is why by_staff is kept.
CREATE OR REPLACE FUNCTION public.advert_accept_agreement(p_agreement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.advert_agreements;
  r public.advert_requests;
BEGIN
  SELECT * INTO a FROM public.advert_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That quote does not exist';
  END IF;
  SELECT * INTO r FROM public.advert_requests WHERE id = a.request_id;

  PERFORM public.finance_require(
    public.finance_can_collect('advertising') OR (r.user_id IS NOT NULL AND r.user_id = auth.uid()),
    'This is not your advertising quote');

  IF a.status <> 'proposed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'This quote is no longer on the table. Ask the office for a current one.';
  END IF;
  -- The unique index would stop this anyway, but with a message about an
  -- index rather than about the agreement that is already in force.
  IF EXISTS (SELECT 1 FROM public.advert_agreements
              WHERE request_id = a.request_id AND status = 'accepted') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'This request already has an agreement in force. The office has to withdraw it before another can be accepted.';
  END IF;
  IF a.fx_rate IS NOT NULL AND a.rate_confirmed_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'This quote was priced from an exchange rate that still has to be confirmed by ISOKO. You will be told as soon as it is.';
  END IF;

  UPDATE public.advert_agreements SET status = 'accepted' WHERE id = a.id RETURNING * INTO a;
  UPDATE public.advert_requests SET status = 'accepted' WHERE id = r.id;
  RETURN to_jsonb(a);
END $fn$;

CREATE OR REPLACE FUNCTION public.advert_decline_agreement(p_agreement_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.advert_agreements;
  r public.advert_requests;
BEGIN
  SELECT * INTO a FROM public.advert_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That quote does not exist';
  END IF;
  SELECT * INTO r FROM public.advert_requests WHERE id = a.request_id;
  PERFORM public.finance_require(
    public.finance_can_collect('advertising') OR (r.user_id IS NOT NULL AND r.user_id = auth.uid()),
    'This is not your advertising quote');
  IF a.status <> 'proposed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This quote is no longer on the table';
  END IF;

  UPDATE public.advert_agreements
     SET status = 'declined', decline_reason = left(coalesce(p_reason, ''), 1000)
   WHERE id = a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
END $fn$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which includes anon,
-- so each of these has to be closed before it is opened to the people who
-- should have it. Quoting, confirming a rate, accepting and declining all
-- belong to somebody with an account; there is nothing here for a signed-out
-- visitor, and schema_guards.test.sql keeps that list honest.
REVOKE EXECUTE ON FUNCTION
  public.advert_propose_agreement(jsonb), public.advert_confirm_rate(uuid),
  public.advert_revise_budget(jsonb), public.advert_accept_agreement(uuid),
  public.advert_decline_agreement(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advert_propose_agreement(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advert_confirm_rate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advert_revise_budget(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advert_accept_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advert_decline_agreement(uuid, text) TO authenticated;

-- ============== SUBMITTING, IN A CURRENCY ==============
-- The form now asks for a country, a currency and a budget, and may name one
-- of the seller's own marketplace products. Everything the old version
-- enforced still holds: the function sets the status and the account itself,
-- which is why the table needs no insert policy.
CREATE OR REPLACE FUNCTION public.advert_submit_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.advert_requests;
  v_budget numeric;
  v_currency text := upper(btrim(coalesce(p ->> 'budget_currency', '')));
  v_country text := upper(btrim(coalesce(p ->> 'country', '')));
  v_artwork text;
  v_products uuid[];
  v_days integer;
  v_start date;
BEGIN
  IF v_country = '' THEN
    v_country := NULL;
  ELSIF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose the country you are advertising from';
  END IF;

  -- A budget needs a currency and a currency needs a budget: an amount with
  -- no currency beside it is not money.
  IF nullif(btrim(coalesce(p ->> 'budget_amount', '')), '') IS NOT NULL THEN
    IF (p ->> 'budget_amount') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the budget as a number, with no commas';
    END IF;
    IF NOT public.currency_active(v_currency) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose the currency your budget is in';
    END IF;
    v_budget := public.money_round((p ->> 'budget_amount')::numeric, v_currency);
    IF v_budget IS NULL OR v_budget <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the budget as an amount this currency can be paid in';
    END IF;
  ELSE
    v_currency := NULL;
  END IF;

  -- A product only if it is this seller's own: an advertiser must not be able
  -- to put somebody else's listing on the homepage.
  -- The listings they want carried. Only their own: an advertiser must not be
  -- able to put somebody else's product on the homepage, and a seller_id
  -- check here is the only thing standing between the band and that.
  v_products := ARRAY(SELECT DISTINCT trim(both '"' FROM e::text)::uuid
                        FROM jsonb_array_elements(coalesce(p -> 'product_ids', '[]'::jsonb)) e);
  IF array_length(v_products, 1) > 0 THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Sign in to advertise one of your own products';
    END IF;
    IF array_length(v_products, 1) > 12 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Choose up to twelve products for one request';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_products) pid
                WHERE NOT EXISTS (SELECT 1 FROM public.products
                                   WHERE id = pid AND seller_id = auth.uid())) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Choose products you have listed yourself, or describe what you want to advertise';
    END IF;
  END IF;

  v_days := nullif(btrim(coalesce(p ->> 'preferred_days', '')), '')::integer;
  IF v_days IS NOT NULL AND (v_days < 1 OR v_days > 3650) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give how many days you would like it to run';
  END IF;
  v_start := nullif(btrim(coalesce(p ->> 'preferred_start', '')), '')::date;

  v_artwork := nullif(btrim(coalesce(p ->> 'artwork_path', '')), '');
  IF v_artwork IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR array_length(string_to_array(v_artwork, '/'), 1) <> 2
       OR split_part(v_artwork, '/', 1) <> auth.uid()::text
       OR split_part(v_artwork, '/', 2) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An advert image must be your own upload';
    END IF;
  END IF;

  INSERT INTO public.advert_requests (
    user_id, full_name, company, email, phone, industry,
    what_to_advertise, placement, duration, message, artwork_path,
    country, budget_amount, budget_currency, preferred_start, preferred_days
  ) VALUES (
    auth.uid(),
    public.svc_text(p, 'full_name', 'Your name', 120),
    public.svc_text(p, 'company', 'Company or business name', 160),
    public.svc_email(p),
    public.svc_text(p, 'phone', 'Phone or WhatsApp', 40),
    public.svc_text(p, 'industry', 'Type of business', 120),
    public.svc_text(p, 'what_to_advertise', 'What you want to advertise', 2000),
    public.svc_text(p, 'placement', 'Preferred placement', 120),
    public.svc_text(p, 'duration', 'How long', 120),
    public.svc_text(p, 'message', 'Message', 2000, false),
    v_artwork, v_country, v_budget, v_currency, v_start, v_days
  ) RETURNING * INTO r;

  INSERT INTO public.advert_request_products (request_id, product_id, sort)
  SELECT r.id, pid, ord - 1
    FROM unnest(v_products) WITH ORDINALITY AS t(pid, ord);

  IF v_budget IS NOT NULL THEN
    INSERT INTO public.advert_budget_revisions (request_id, amount, currency, stated_by, note)
    VALUES (r.id, v_budget, v_currency, auth.uid(), 'as submitted');
  END IF;

  RETURN jsonb_build_object('reference', r.reference);
END $fn$;

COMMENT ON FUNCTION public.advert_submit_request(jsonb) IS
  'Records an advertising enquiry, with the budget in the currency the advertiser chose. Sets the account and the status itself, so a request cannot arrive pre-approved or carrying staff notes.';

GRANT EXECUTE ON FUNCTION public.advert_submit_request(jsonb) TO anon, authenticated;

-- ============== WHAT IS ACTUALLY ON AIR ==============
-- The listings sliding in the advertising band, and the only thing that
-- decides it.
--
-- Picking products on the form does not put them on the homepage. If it did,
-- advertising here would be free: anybody with a seller account could fill in
-- a form and be on the front page by lunchtime. A listing goes on air when
-- there is an *accepted* agreement on the request, and only while today is
-- inside the run it paid for.
--
-- The window is the agreement's own dates. When the office quoted without a
-- start date, the run starts the day the advertiser accepted and lasts the
-- days they agreed -- so an advert always has an end, and comes down by
-- itself rather than waiting for somebody to notice.
--
-- A product also has to still be worth showing: active, in stock and
-- photographed. Advertising something that cannot be bought sends a visitor
-- to a marketplace that does not have it, which is the same rule
-- AdvertShowcase already applied to the whole catalogue.
CREATE OR REPLACE FUNCTION public.advert_live_products()
RETURNS TABLE (
  product_id uuid, name text, price integer, category text, description text,
  image_url text, image_urls text[], stock integer, placement text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id)
         p.id, p.name, p.price, p.category, p.description,
         p.image_url, p.image_urls, p.stock, r.placement
    FROM public.advert_agreements a
    JOIN public.advert_requests r ON r.id = a.request_id
    JOIN public.advert_request_products rp ON rp.request_id = r.id
    JOIN public.products p ON p.id = rp.product_id
   WHERE a.status = 'accepted'
     AND p.status = 'active'
     AND p.stock > 0
     AND current_date >= coalesce(a.starts_on, a.responded_at::date, a.proposed_at::date)
     AND current_date <= coalesce(
           a.ends_on,
           coalesce(a.starts_on, a.responded_at::date, a.proposed_at::date) + (a.days - 1))
   ORDER BY p.id, rp.sort, a.responded_at DESC;
$$;

COMMENT ON FUNCTION public.advert_live_products() IS
  'The seller listings currently carried in the advertising band: an accepted agreement, inside its run, for a product that can still be bought. Choosing products on the form does not put them here.';

-- Public: the band is on the homepage, which anybody can see. It reads
-- products and agreements the caller cannot read directly, which is why it is
-- SECURITY DEFINER -- and it returns only what is on air, never a budget, a
-- fee or who is paying.
REVOKE EXECUTE ON FUNCTION public.advert_live_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advert_live_products() TO anon, authenticated;

-- ============== ADVERTISING JOINS THE PAYMENT ENGINE ==============
ALTER TABLE public.finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_module_check;
ALTER TABLE public.finance_accounts ADD CONSTRAINT finance_accounts_module_check
  CHECK (module IN ('travel', 'consultancy', 'data', 'marketplace', 'subscriptions',
                    'software', 'training', 'advertising'));

-- The currency list is a table now, so the engine reads it from there instead
-- of carrying its own copy of three codes. A currency cannot be deleted while
-- an account is denominated in it, which is the point.
ALTER TABLE public.finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_currency_check;
ALTER TABLE public.finance_accounts ADD CONSTRAINT finance_accounts_currency_fkey
  FOREIGN KEY (currency) REFERENCES public.currencies (code);

CREATE OR REPLACE FUNCTION public.finance_module_of(_entity_table text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _entity_table
    WHEN 'travel_trips' THEN 'travel'
    WHEN 'consult_requests' THEN 'consultancy'
    WHEN 'data_requests' THEN 'data'
    WHEN 'orders' THEN 'marketplace'
    WHEN 'subscriptions' THEN 'subscriptions'
    WHEN 'software_bookings' THEN 'software'
    WHEN 'training_applications' THEN 'training'
    WHEN 'advert_requests' THEN 'advertising'
  END;
$$;

-- An accepted agreement is a price, and a price is a charge -- the same way
-- an accepted consultancy proposal is. The account is opened in the
-- agreement's own currency, and finance_open_account refuses to change the
-- currency of an account that already has charges or payments on it, so an
-- advertiser cannot be re-billed in another currency after the fact.
CREATE OR REPLACE FUNCTION public.finance_price_from_advert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.advert_requests;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT * INTO r FROM public.advert_requests WHERE id = NEW.request_id;
    PERFORM public.finance_set_price(
      public.finance_open_account('advert_requests', r.id, NEW.currency, r.user_id,
                                  r.reference || ' * ' || r.company),
      NEW.total, format('Advertising %s: %s day(s) %s', r.reference, NEW.days, r.placement));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER finance_price AFTER INSERT OR UPDATE OF status, total, currency
  ON public.advert_agreements
  FOR EACH ROW EXECUTE FUNCTION public.finance_price_from_advert();

REVOKE EXECUTE ON FUNCTION public.finance_price_from_advert() FROM PUBLIC, anon, authenticated;

-- What the advertiser owes and has paid, for their own dashboard. The engine's
-- own finance_account_summary is staff-only; this is the customer's view of
-- their own account and nobody else's.
CREATE OR REPLACE FUNCTION public.advert_payment_state(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.advert_requests;
  a public.finance_accounts;
BEGIN
  SELECT * INTO r FROM public.advert_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  PERFORM public.finance_require(
    public.finance_can_collect('advertising') OR (r.user_id IS NOT NULL AND r.user_id = auth.uid()),
    'This is not your advertising request');

  a := public.finance_account_of('advert_requests', p_request_id);
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;
  RETURN jsonb_build_object(
    'exists', true, 'currency', a.currency,
    'totals', public.finance_totals(a.id),
    'payments', public.finance_customer_payments('advert_requests', p_request_id));
END $fn$;
REVOKE EXECUTE ON FUNCTION public.advert_payment_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advert_payment_state(uuid) TO authenticated;

-- ============== WAYS TO PAY, AND WHERE THEY WORK ==============
-- The site has one real payment provider (ItecPay) and it takes Rwandan
-- francs from Rwandan mobile money, nothing else. Showing a Kenyan
-- advertiser a "pay from your phone" button would be a lie that fails at the
-- last step, so what is offered is read from here, per currency and country.
CREATE TABLE public.payment_methods (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'cash', 'other')),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  -- Empty means "any currency we quote in" / "anywhere". A list means only
  -- those.
  currencies text[] NOT NULL DEFAULT '{}',
  countries text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  -- Shown to the payer: how to pay, and anything they need to know first.
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 2000),
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.payment_methods IS
  'The ways ISOKO can actually be paid, by currency and country. A method is offered only where it is configured and works -- ItecPay takes RWF from Rwanda and nothing else.';

INSERT INTO public.payment_methods (id, label, method, provider, currencies, countries, instructions, sort) VALUES
  ('momo_itecpay', 'Mobile Money (MTN, Airtel, SPENN)', 'momo', 'itecpay',
   ARRAY['RWF'], ARRAY['RW'],
   'You will get a prompt on your phone. Approve it and the payment is confirmed automatically.', 0),
  ('bank_transfer', 'Bank transfer', 'bank', 'manual',
   '{}', '{}',
   'Transfer to the account shown on the payment page and send us the transaction reference. Finance checks it against the bank before the payment counts.', 1),
  ('cash_office', 'Cash at the Kigali office', 'cash', 'manual',
   ARRAY['RWF'], ARRAY['RW'],
   'Pay at the ISOKO office in Kimironko and ask for a receipt.', 2)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads payment methods" ON public.payment_methods
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admins manage payment methods" ON public.payment_methods
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.payment_methods FROM anon;
CREATE TRIGGER payment_methods_stamp BEFORE INSERT OR UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.stamp_currency_editor();

-- What this payer, in this currency, can actually use -- and what they
-- cannot, with the reason. The second half matters as much as the first: "we
-- cannot take shillings by mobile money, but a bank transfer works" is an
-- answer, and a short list with no explanation is not.
-- Runs as whoever asks, deliberately. "Anyone reads payment methods" already
-- covers the active rows this looks at, and mobile_money_available() is its
-- own elevated function, so there is nothing here that needs the owner's
-- rights -- and schema_guards.test.sql keeps a documented list of the
-- elevated functions a signed-out visitor may run, which this does not
-- belong on.
CREATE OR REPLACE FUNCTION public.payment_methods_for(_currency text, _country text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH asked AS (
    SELECT upper(btrim(coalesce(_currency, ''))) AS currency,
           nullif(upper(btrim(coalesce(_country, ''))), '') AS country
  ),
  judged AS (
    SELECT m.id, m.label, m.method, m.provider, m.instructions, m.sort,
           m.currencies, m.countries,
           CASE
             WHEN m.provider = 'itecpay' AND NOT public.mobile_money_available()
               THEN 'Paying from a phone is not switched on yet'
             WHEN cardinality(m.currencies) > 0 AND NOT (a.currency = ANY (m.currencies))
               THEN format('%s cannot be paid by %s', a.currency, lower(m.label))
             WHEN cardinality(m.countries) > 0 AND a.country IS NOT NULL
                  AND NOT (a.country = ANY (m.countries))
               THEN format('%s is only available in %s', m.label, array_to_string(m.countries, ', '))
           END AS why_not
      FROM public.payment_methods m, asked a
     WHERE m.is_active
  )
  SELECT jsonb_build_object(
    'currency', (SELECT currency FROM asked),
    'available', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'method', method, 'provider', provider,
        'instructions', instructions) ORDER BY sort, id)
      FROM judged WHERE why_not IS NULL), '[]'::jsonb),
    'unavailable', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'reason', why_not) ORDER BY sort, id)
      FROM judged WHERE why_not IS NOT NULL), '[]'::jsonb));
$$;
GRANT EXECUTE ON FUNCTION public.payment_methods_for(text, text) TO anon, authenticated;

-- ============== FEES AND WHAT ACTUALLY SETTLES ==============
-- ItecPay keeps 3% of a mobile-money payment and 5% of a card payment
-- (docs/ITECPAY_INTEGRATION.md). What reaches ISOKO is therefore not what the
-- advertiser paid, and a report that says otherwise is wrong.
--
-- The rule in force is recorded on the payment when the payment is made, not
-- looked up when a report is run: a fee schedule that changes next year must
-- not rewrite what last year's settlement was.
CREATE TABLE public.payment_fee_rules (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  method text CHECK (method IS NULL OR method IN ('momo', 'bank', 'card', 'cash', 'other')),
  percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  fixed numeric(14,2) NOT NULL DEFAULT 0 CHECK (fixed >= 0),
  is_active boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.payment_fee_rules (id, provider, method, percent, note) VALUES
  ('itecpay_momo', 'itecpay', 'momo', 3, 'ItecPay contract, May 2026: 3% on MTN, Airtel and SPENN'),
  ('itecpay_card', 'itecpay', 'card', 5, 'ItecPay contract, May 2026: 5% on Visa')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_fee_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff read fee rules" ON public.payment_fee_rules
  FOR SELECT TO authenticated USING (public.finance_can_reverse());
CREATE POLICY "Admins manage fee rules" ON public.payment_fee_rules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.payment_fee_rules FROM anon;
CREATE TRIGGER payment_fee_rules_stamp BEFORE INSERT OR UPDATE ON public.payment_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.stamp_currency_editor();

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2) CHECK (fee_amount IS NULL OR fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS settlement_amount numeric(14,2) CHECK (settlement_amount IS NULL OR settlement_amount >= 0),
  ADD COLUMN IF NOT EXISTS fee_rule text;

COMMENT ON COLUMN public.finance_payments.fee_amount IS
  'The provider fee as the rule in force at the time computed it. Written once, at insert; never recomputed.';
COMMENT ON COLUMN public.finance_payments.settlement_amount IS
  'What ISOKO expects to receive after the fee, in the payment currency.';

CREATE OR REPLACE FUNCTION public.finance_stamp_fee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE f public.payment_fee_rules;
BEGIN
  IF NEW.fee_amount IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.payment_fee_rules
   WHERE is_active AND provider = NEW.provider
     AND (method IS NULL OR method = NEW.method)
   ORDER BY (method IS NOT NULL) DESC LIMIT 1;
  IF f.id IS NULL THEN RETURN NEW; END IF;

  NEW.fee_rule := f.id;
  NEW.fee_amount := least(
    public.money_round(NEW.amount * f.percent / 100 + f.fixed, NEW.currency), NEW.amount);
  NEW.settlement_amount := NEW.amount - NEW.fee_amount;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_payments_fee BEFORE INSERT ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION public.finance_stamp_fee();
REVOKE EXECUTE ON FUNCTION public.finance_stamp_fee() FROM PUBLIC, anon, authenticated;

-- ============== THE OFFICE'S DESK ==============
-- Every request with its budget, its quotes and where the money is, in one
-- answer, so the advertising desk is not assembling this from four queries.
CREATE OR REPLACE FUNCTION public.advert_desk()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.finance_require(public.finance_can_collect('advertising'),
    'Only the advertising desk and finance staff can see advertising requests');

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'request', to_jsonb(r),
      -- The listings they asked to have carried, with their shelf prices in
      -- francs. A shelf price is not the advertising fee and the desk says so.
      'products', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'price', p.price, 'currency', 'RWF',
            'status', p.status, 'stock', p.stock) ORDER BY rp.sort)
          FROM public.advert_request_products rp
          JOIN public.products p ON p.id = rp.product_id
         WHERE rp.request_id = r.id), '[]'::jsonb),
      'budgets', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'amount', b.amount, 'currency', b.currency, 'by_staff', b.by_staff,
            'note', b.note, 'created_at', b.created_at) ORDER BY b.created_at DESC)
          FROM public.advert_budget_revisions b WHERE b.request_id = r.id), '[]'::jsonb),
      'agreements', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.revision DESC)
          FROM public.advert_agreements a WHERE a.request_id = r.id), '[]'::jsonb),
      'finance', (SELECT jsonb_build_object('currency', fa.currency,
                                            'totals', public.finance_totals(fa.id))
                    FROM public.finance_accounts fa
                   WHERE fa.entity_table = 'advert_requests' AND fa.entity_id = r.id)
    ) ORDER BY r.created_at DESC)
    FROM public.advert_requests r), '[]'::jsonb);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.advert_desk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advert_desk() TO authenticated;

-- ============== REPORTING ==============
-- Advertising revenue, by the currency it was actually earned in, and then
-- consolidated.
--
-- The original amounts come first and are never replaced by the converted
-- ones: a row of 1,200,000 RWF is the fact, and its dollar equivalent is an
-- arithmetic convenience that was true on the morning the report was run. A
-- currency with no fresh rate is reported with its originals and counted as
-- unconvertible rather than quietly left out of the total, because a total
-- that silently omits a country is worse than one that says what it could
-- not add up.
CREATE OR REPLACE FUNCTION public.advert_revenue_report(_in text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_to text := coalesce(nullif(upper(btrim(coalesce(_in, ''))), ''), public.reporting_currency());
  v_rows jsonb;
  v_total numeric := 0;
  v_missing text[] := '{}';
  c record;
  conv jsonb;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect('advertising'),
    'Only the advertising desk and finance staff can see advertising revenue');
  IF NOT public.currency_active(v_to) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That is not a currency we report in';
  END IF;

  v_rows := '[]'::jsonb;
  FOR c IN
    SELECT a.currency,
           count(*) AS accounts,
           coalesce(sum((t.totals ->> 'charged')::numeric), 0) AS charged,
           coalesce(sum((t.totals ->> 'paid')::numeric), 0) AS paid,
           coalesce(sum((t.totals ->> 'refunded')::numeric), 0) AS refunded,
           coalesce(sum(t.fees), 0) AS fees,
           coalesce(sum(t.settled), 0) AS settled
      FROM public.finance_accounts a
      CROSS JOIN LATERAL (
        -- The same three statuses finance_totals counts as money that
        -- arrived. Said here rather than invented, so a payment the engine
        -- counts and a payment this report counts cannot drift apart.
        SELECT public.finance_totals(a.id) AS totals,
               coalesce((SELECT sum(p.fee_amount) FROM public.finance_payments p
                          WHERE p.account_id = a.id
                            AND p.status IN ('successful', 'partially_refunded', 'refunded')), 0) AS fees,
               coalesce((SELECT sum(coalesce(p.settlement_amount, p.amount) - p.refunded_amount)
                           FROM public.finance_payments p
                          WHERE p.account_id = a.id
                            AND p.status IN ('successful', 'partially_refunded', 'refunded')), 0) AS settled
      ) t
     WHERE a.module = 'advertising'
     GROUP BY a.currency
     ORDER BY a.currency
  LOOP
    conv := public.fx_convert(c.paid, c.currency, v_to);
    IF conv IS NULL THEN
      v_missing := v_missing || c.currency;
    ELSE
      v_total := v_total + (conv ->> 'amount')::numeric;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      -- the facts, in the currency they happened in
      'currency', c.currency, 'accounts', c.accounts,
      'charged', c.charged, 'paid', c.paid, 'refunded', c.refunded,
      'fees', c.fees, 'settled', c.settled,
      -- and the arithmetic, labelled as such
      'converted_paid', conv -> 'amount',
      'rate', conv -> 'rate', 'rate_source', conv -> 'source', 'rate_read_at', conv -> 'fetched_at',
      'convertible', conv IS NOT NULL));
  END LOOP;

  RETURN jsonb_build_object(
    'reporting_currency', v_to,
    'generated_at', now(),
    'by_currency', v_rows,
    'consolidated_paid', public.money_round(v_total, v_to),
    -- Named, not hidden: these currencies are in by_currency with their real
    -- amounts and are not part of the consolidated figure.
    'not_converted', to_jsonb(v_missing));
END $fn$;
REVOKE EXECUTE ON FUNCTION public.advert_revenue_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advert_revenue_report(text) TO authenticated;

-- ============== TELLING THE ADVERTISER ==============
-- The office already hears about a new request. The advertiser hears when
-- their rate is confirmed, because until then they are looking at a quote
-- they cannot accept and no screen should have to explain the silence.
CREATE OR REPLACE FUNCTION public.notify_advert_rate_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.advert_requests;
BEGIN
  IF NEW.rate_confirmed_at IS NOT NULL AND OLD.rate_confirmed_at IS NULL AND NEW.status = 'proposed' THEN
    SELECT * INTO r FROM public.advert_requests WHERE id = NEW.request_id;
    IF r.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (r.user_id, 'Your advertising quote is confirmed',
              format('%s: %s %s is now final and ready to accept.', r.reference, NEW.total, NEW.currency),
              'info', '/dashboard');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER advert_agreements_rate_confirmed
  AFTER UPDATE OF rate_confirmed_at ON public.advert_agreements
  FOR EACH ROW EXECUTE FUNCTION public.notify_advert_rate_confirmed();

-- ============== CLOSING WHAT THIS FILE OPENED ==============
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, so the seven trigger
-- functions above arrived reachable from the website. Nothing is exposed by
-- it -- PL/pgSQL refuses a direct call to a trigger function outright -- but
-- schema_guards.test.sql asserts the rule, and 20261013120000 swept for
-- exactly this, saying the next one added would be caught by the same guard.
-- It was. The sweep is repeated rather than the functions named, so the one
-- after this is caught too.
DO $$
DECLARE f regprocedure;
  opened integer := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    opened := opened + 1;
  END LOOP;
  RAISE NOTICE 'closed % trigger function(s) that the website could reach', opened;
END $$;

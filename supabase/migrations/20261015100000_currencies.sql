-- Money in more than one currency, and an exchange rate nobody invents.
--
-- Until now every price on this site was Rwandan francs, with two exceptions
-- that proved the rule: finance_accounts has always allowed 'RWF', 'USD' and
-- 'EUR', and the initiative fetches one rate (USD -> RWF) so the "$1" campaign
-- could say what a dollar costs. An advertiser in Nairobi was asked for a
-- budget "in RWF" and had to do the arithmetic themselves, in their head,
-- against a rate nobody had shown them.
--
-- This file is the groundwork: which currencies exist, which country suggests
-- which one, and how to turn an amount in one into an amount in another while
-- saying out loud what rate was used and when it was read. The advertising
-- workflow that uses all of it is the next migration.
--
-- Three rules run through everything here:
--
--   * An amount is never money without a currency beside it. Two amounts in
--     different currencies are never compared, added or sorted together.
--   * A rate is read from a provider, stored with its timestamp, and shown
--     with both. When there is no fresh rate the answer is "we cannot convert
--     that", never a guess.
--   * A conversion is indicative until a person confirms it. Nothing a
--     customer has accepted changes afterwards because a rate moved.

-- ============== WHAT A CURRENCY IS ==============
CREATE TABLE public.currencies (
  -- ISO 4217, which is also what the rate provider keys its answer by.
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  symbol text NOT NULL CHECK (length(symbol) BETWEEN 1 AND 8),

  -- ISO 4217's own figure: 0 for the franc and the shilling, 2 for the dollar
  -- and the euro. It decides how an amount is written and how far a
  -- conversion is rounded.
  minor_units smallint NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4),

  -- The smallest step an amount may land on. Usually one minor unit, but a
  -- currency where nobody quotes cents can be coarsened by an administrator
  -- without pretending the currency has fewer decimals than it really does.
  rounding_step numeric(14,4) NOT NULL DEFAULT 0.01 CHECK (rounding_step > 0),

  -- Off, rather than deleted: a currency withdrawn from the list must not
  -- orphan the agreements and payments already written in it.
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  -- A step finer than the currency's own smallest unit would be a price
  -- nobody can pay. Kept in numeric rather than through power()'s double
  -- precision, so the comparison is exact at 0.01 instead of nearly.
  CONSTRAINT currencies_step_fits
    CHECK (rounding_step * power(10::numeric, minor_units::numeric) >= 1)
);

COMMENT ON TABLE public.currencies IS
  'The currencies ISOKO quotes and collects in. Deactivated, never deleted: past agreements are written in these codes.';

INSERT INTO public.currencies (code, name, symbol, minor_units, rounding_step, sort) VALUES
  ('RWF', 'Rwandan Franc',      'FRw', 0, 1,    0),
  ('USD', 'US Dollar',          '$',   2, 0.01, 1),
  ('EUR', 'Euro',               E'€', 2, 0.01, 2),
  ('KES', 'Kenyan Shilling',    'KSh', 2, 1,    3),
  ('UGX', 'Ugandan Shilling',   'USh', 0, 1,    4),
  ('TZS', 'Tanzanian Shilling', 'TSh', 2, 1,    5),
  ('BIF', 'Burundian Franc',    'FBu', 0, 1,    6)
ON CONFLICT (code) DO NOTHING;

-- ============== WHICH COUNTRY SUGGESTS WHICH ==============
-- A suggestion, never a decision. The seller may change it, and a country
-- that is not on this list is not an error: it means "ask them".
--
-- Keyed by ISO 3166-1 alpha-2 because that is what a browser's own region
-- settings give, so a suggestion can be made without asking anybody's
-- location and without reading their language -- "en" is spoken in Kigali
-- and in Kansas, and guessing a currency from it would be wrong in both.
CREATE TABLE public.country_currency (
  country text PRIMARY KEY CHECK (country ~ '^[A-Z]{2}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  currency text NOT NULL REFERENCES public.currencies (code) ON UPDATE CASCADE,
  -- Somewhere ISOKO is set up to do business, as against somewhere whose
  -- currency simply happens to be one we quote.
  is_supported boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
CREATE INDEX country_currency_by_currency ON public.country_currency (currency);

INSERT INTO public.country_currency (country, name, currency) VALUES
  ('RW', 'Rwanda',   'RWF'),
  ('KE', 'Kenya',    'KES'),
  ('UG', 'Uganda',   'UGX'),
  ('TZ', 'Tanzania', 'TZS'),
  ('BI', 'Burundi',  'BIF'),
  -- The dollar, where it is the currency in use rather than a convenience.
  ('US', 'United States', 'USD'),
  ('EC', 'Ecuador',       'USD'),
  ('SV', 'El Salvador',   'USD'),
  ('PA', 'Panama',        'USD'),
  -- The euro area.
  ('AT', 'Austria', 'EUR'), ('BE', 'Belgium', 'EUR'), ('HR', 'Croatia', 'EUR'),
  ('CY', 'Cyprus', 'EUR'),  ('EE', 'Estonia', 'EUR'), ('FI', 'Finland', 'EUR'),
  ('FR', 'France', 'EUR'),  ('DE', 'Germany', 'EUR'), ('GR', 'Greece', 'EUR'),
  ('IE', 'Ireland', 'EUR'), ('IT', 'Italy', 'EUR'),   ('LV', 'Latvia', 'EUR'),
  ('LT', 'Lithuania', 'EUR'), ('LU', 'Luxembourg', 'EUR'), ('MT', 'Malta', 'EUR'),
  ('NL', 'Netherlands', 'EUR'), ('PT', 'Portugal', 'EUR'), ('SK', 'Slovakia', 'EUR'),
  ('SI', 'Slovenia', 'EUR'), ('ES', 'Spain', 'EUR')
ON CONFLICT (country) DO NOTHING;

-- ============== ROUNDING ==============
-- One place decides what a payable amount looks like in a given currency, so
-- the page, the agreement and the ledger cannot each round differently and
-- disagree by a franc.
CREATE OR REPLACE FUNCTION public.money_round(_amount numeric, _currency text)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _amount IS NULL THEN NULL
    ELSE round(_amount / c.rounding_step) * c.rounding_step
  END
  FROM public.currencies c WHERE c.code = _currency;
$$;
COMMENT ON FUNCTION public.money_round(numeric, text) IS
  'An amount on the currency own smallest step. NULL for a currency we do not know, which is how a caller finds out.';

-- Is this a currency we are quoting in today?
CREATE OR REPLACE FUNCTION public.currency_active(_code text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.currencies WHERE code = _code AND is_active);
$$;

-- ============== THE RATES ==============
-- fx_rates already exists (20261012120000_usd_minimum.sql): one row, USD ->
-- RWF, refreshed by fx_refresh() through pg_net and pg_cron. The provider's
-- answer has always carried every currency it knows; we kept one and dropped
-- the rest. Now we keep the ones we quote in.
ALTER TABLE public.fx_rates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- How old a rate may be before it stops counting as a rate. Seven days is
-- what usd_minimum_rwf() has always used; it is a setting now because an
-- advertising quote is a tighter thing than a donation minimum.
INSERT INTO public.platform_settings (key, value) VALUES ('fx_stale_days', '7')
ON CONFLICT (key) DO NOTHING;

-- The currency consolidated reporting is expressed in. Reports always show
-- the original amounts too; this is only the column that adds up.
INSERT INTO public.platform_settings (key, value) VALUES ('reporting_currency', 'RWF')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fx_stale_days()
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT greatest(1, least(90, public.setting_number('fx_stale_days', 7)));
$$;

CREATE OR REPLACE FUNCTION public.reporting_currency()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT value FROM public.platform_settings p
      WHERE p.key = 'reporting_currency' AND public.currency_active(p.value)),
    'RWF');
$$;
GRANT EXECUTE ON FUNCTION public.fx_stale_days(), public.reporting_currency(),
  public.money_round(numeric, text), public.currency_active(text) TO anon, authenticated, service_role;

-- What one US dollar is worth in _code, together with when that was read and
-- from whom. NULL means there is nothing fresh enough to go on, which is an
-- answer every caller here is written to handle.
CREATE OR REPLACE FUNCTION public.fx_rate_row(_code text)
RETURNS public.fx_rates LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM public.fx_rates
   WHERE quote = _code
     AND fetched_at > now() - (public.fx_stale_days() || ' days')::interval;
$$;

-- An amount in one currency, in another, with the arithmetic shown.
--
-- The rates are all quoted against the dollar, so a Kenyan shilling price in
-- francs goes through USD: divide by the KES rate, multiply by the RWF one.
-- The dollar itself has no row and needs none -- it is the base.
--
-- Returns NULL, not a number, when either leg is missing or stale. Every
-- caller treats that as "conversion unavailable" and says so. Nothing in this
-- schema will invent a rate, which is the whole reason this is a function and
-- not a column somebody can type into.
CREATE OR REPLACE FUNCTION public.fx_convert(_amount numeric, _from text, _to text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  r_from public.fx_rates;
  r_to public.fx_rates;
  v_from numeric;
  v_to numeric;
  v_rate numeric;
  v_read timestamptz;
  v_source text;
BEGIN
  IF _amount IS NULL OR _from IS NULL OR _to IS NULL THEN RETURN NULL; END IF;
  IF NOT public.currency_active(_from) OR NOT public.currency_active(_to) THEN RETURN NULL; END IF;

  IF _from = _to THEN
    RETURN jsonb_build_object(
      'amount', public.money_round(_amount, _to), 'currency', _to,
      'from_amount', _amount, 'from_currency', _from,
      'rate', 1, 'base', _from, 'source', 'same currency',
      'fetched_at', NULL, 'indicative', false);
  END IF;

  IF _from = 'USD' THEN
    v_from := 1;
  ELSE
    r_from := public.fx_rate_row(_from);
    v_from := r_from.rate;
    v_read := r_from.fetched_at;
    v_source := r_from.source;
  END IF;

  IF _to = 'USD' THEN
    v_to := 1;
  ELSE
    r_to := public.fx_rate_row(_to);
    v_to := r_to.rate;
    -- The older of the two readings is the age of the answer.
    v_read := least(coalesce(v_read, r_to.fetched_at), r_to.fetched_at);
    v_source := coalesce(v_source, r_to.source);
  END IF;

  IF v_from IS NULL OR v_to IS NULL OR v_from <= 0 OR v_to <= 0 THEN RETURN NULL; END IF;

  v_rate := v_to / v_from;
  RETURN jsonb_build_object(
    'amount', public.money_round(_amount * v_rate, _to), 'currency', _to,
    'from_amount', _amount, 'from_currency', _from,
    -- Enough places that a reader can redo the multiplication and land on the
    -- same figure we did.
    'rate', round(v_rate, 8), 'base', 'USD',
    'source', coalesce(v_source, 'open.er-api.com'), 'fetched_at', v_read,
    -- Indicative until somebody with authority says otherwise. The advertising
    -- workflow is where that confirmation happens.
    'indicative', true);
END $$;
COMMENT ON FUNCTION public.fx_convert(numeric, text, text) IS
  'Converts between two active currencies through the stored USD rates, returning the rate, its source and when it was read. NULL when no fresh rate exists: callers say conversion is unavailable rather than guessing.';

GRANT EXECUTE ON FUNCTION public.fx_convert(numeric, text, text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fx_rate_row(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_rate_row(text) TO anon, authenticated, service_role;

-- ============== FETCHING THEM ALL ==============
-- The same two-phase pg_net fetch as before -- ask on one run, collect on the
-- next -- but it now keeps a row for every currency on our own list instead
-- of only RWF. The provider's reply already carried them; this stops throwing
-- them away. A currency an administrator activates tomorrow is picked up on
-- the next run with no deploy.
CREATE OR REPLACE FUNCTION public.fx_refresh()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending bigint; v_requested timestamptz; v_status int; v_body jsonb; v_new bigint;
  v_note text := ''; v_stored int := 0; v_missing text[] := '{}';
  c record; v_rate numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN 'pg_net is not installed here; no rate is fetched';
  END IF;

  SELECT request_id, requested_at INTO v_pending, v_requested
    FROM public.fx_requests ORDER BY requested_at LIMIT 1;
  IF v_pending IS NOT NULL THEN
    SELECT status_code, (content)::jsonb INTO v_status, v_body
      FROM net._http_response WHERE id = v_pending;
    IF FOUND THEN
      IF v_status = 200 AND v_body ->> 'result' = 'success' THEN
        -- Every currency we quote in, not just the franc. USD is the base and
        -- needs no row of its own.
        FOR c IN SELECT code FROM public.currencies WHERE is_active AND code <> 'USD' LOOP
          v_rate := nullif(v_body -> 'rates' ->> c.code, '')::numeric;
          IF v_rate IS NOT NULL AND v_rate > 0 THEN
            INSERT INTO public.fx_rates (quote, base, rate, fetched_at, source)
            VALUES (c.code, 'USD', v_rate, now(), coalesce(v_body ->> 'provider', 'open.er-api.com'))
            ON CONFLICT (quote) DO UPDATE
              SET rate = EXCLUDED.rate, fetched_at = EXCLUDED.fetched_at,
                  source = EXCLUDED.source, updated_at = now();
            v_stored := v_stored + 1;
          ELSE
            -- Worth naming: a currency the provider does not carry can never
            -- be converted, and somebody has to know that rather than
            -- wondering why one quote will not price.
            v_missing := v_missing || c.code;
          END IF;
        END LOOP;
        v_note := format('stored %s rate(s)', v_stored);
        IF array_length(v_missing, 1) > 0 THEN
          v_note := v_note || format('; the provider carries no rate for %s', array_to_string(v_missing, ', '));
        END IF;
      ELSE
        v_note := format('the provider answered %s', coalesce(v_status::text, 'nothing'));
      END IF;
      DELETE FROM public.fx_requests WHERE request_id = v_pending;
    ELSIF v_requested < now() - interval '10 minutes' THEN
      DELETE FROM public.fx_requests WHERE request_id = v_pending;
      v_note := 'the previous request never answered';
    ELSE
      RETURN 'still waiting for the previous request';
    END IF;
  END IF;

  -- Ask again only when something we hold is getting on. One request brings
  -- back every currency, so this is still one call a day.
  IF NOT EXISTS (
    SELECT 1 FROM public.currencies c
     WHERE c.is_active AND c.code <> 'USD'
       AND NOT EXISTS (SELECT 1 FROM public.fx_rates f
                        WHERE f.quote = c.code AND f.fetched_at > now() - interval '6 hours')
  ) THEN
    RETURN coalesce(nullif(v_note, ''), 'every rate is current');
  END IF;
  IF EXISTS (SELECT 1 FROM public.fx_requests) THEN
    RETURN coalesce(nullif(v_note, ''), 'a request is already in flight');
  END IF;

  SELECT net.http_get(url := 'https://open.er-api.com/v6/latest/USD', timeout_milliseconds := 20000) INTO v_new;
  INSERT INTO public.fx_requests (request_id) VALUES (v_new);
  RETURN trim(both ' ;' FROM v_note || '; asked for fresh rates');
END $$;

REVOKE EXECUTE ON FUNCTION public.fx_refresh() FROM PUBLIC, anon, authenticated;

-- ============== WHO MAY CHANGE THE LISTS ==============
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_currency ENABLE ROW LEVEL SECURITY;

-- The advertising form needs the list before anyone has signed in.
CREATE POLICY "Anyone reads the currency list" ON public.currencies
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone reads the country list" ON public.country_currency
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage currencies" ON public.currencies
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage country currencies" ON public.country_currency
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.currencies, public.country_currency FROM anon;

-- Who last touched the list is worth keeping, and nobody should be able to
-- claim it was somebody else.
CREATE OR REPLACE FUNCTION public.stamp_currency_editor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

CREATE TRIGGER currencies_stamp BEFORE INSERT OR UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.stamp_currency_editor();
CREATE TRIGGER country_currency_stamp BEFORE INSERT OR UPDATE ON public.country_currency
  FOR EACH ROW EXECUTE FUNCTION public.stamp_currency_editor();

-- ============== THE CURRENCY A COUNTRY SUGGESTS ==============
-- Public, because the advertising form asks before anyone signs in. It is a
-- suggestion and the form says so: the seller can always choose another.
CREATE OR REPLACE FUNCTION public.suggested_currency(_country text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN cc.country IS NULL THEN jsonb_build_object('country', NULL, 'currency', NULL, 'known', false)
    ELSE jsonb_build_object('country', cc.country, 'name', cc.name, 'currency', cc.currency,
                            'supported', cc.is_supported, 'known', true)
  END
  FROM (SELECT upper(btrim(coalesce(_country, ''))) AS wanted) q
  LEFT JOIN public.country_currency cc
    ON cc.country = q.wanted AND public.currency_active(cc.currency);
$$;
GRANT EXECUTE ON FUNCTION public.suggested_currency(text) TO anon, authenticated;

-- "US$1 or its validated local-currency equivalent", with a real rate.
--
-- The campaign is called "$1 One Project" and the site has until now
-- refused to say what a dollar is, on the honest grounds that it had no
-- rate and would not invent one. The minimum was a round 1,000 francs "in
-- that spirit", which today is about seventy cents -- close enough to be
-- defensible and not actually what the campaign says.
--
-- So the rate is fetched, from exchangerate-api.com's open endpoint. It
-- needs no key, which is the main reason it was chosen over the
-- alternatives: there is nothing to rotate, nothing to leak, and no
-- account that can lapse. It publishes once a day.
--
-- Frankfurter was tried first and does not carry RWF at all -- it answers
-- "not found" -- which is worth recording so nobody tries it again.
--
-- The browser never calls the provider. The rate is fetched here, stored
-- here, and read from here, so there is one number that the page, the
-- validation and the database all agree on, and no visitor's page depends
-- on somebody else's uptime.

CREATE TABLE public.fx_rates (
  quote text PRIMARY KEY,
  base text NOT NULL DEFAULT 'USD',
  rate numeric NOT NULL CHECK (rate > 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source text
);

-- One in-flight request at a time. pg_net answers asynchronously: the call
-- returns an id and the body turns up in net._http_response a moment later,
-- so the id has to be remembered until the next run collects it.
CREATE TABLE public.fx_requests (
  request_id bigint PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_requests ENABLE ROW LEVEL SECURITY;

-- The rate is on the donation page, so everyone may read it. Nobody may
-- write one: an exchange rate somebody can set is an exchange rate somebody
-- can set to anything.
CREATE POLICY "Anyone reads exchange rates" ON public.fx_rates FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.fx_rates, public.fx_requests FROM anon, authenticated;
REVOKE SELECT ON public.fx_requests FROM anon, authenticated;

-- ============== THE MINIMUM ==============
-- A dollar in francs, rounded up, from a rate that is not stale.
--
-- The fallback matters more than the rate does. If the provider is down, or
-- the rate is a fortnight old, a donation must still be possible: giving
-- money to a community fund is not the moment to be told the exchange rate
-- service is unavailable. It falls back to the standing 1,000 francs, which
-- is the floor the table's own CHECK has always enforced.
CREATE OR REPLACE FUNCTION public.usd_minimum_rwf()
RETURNS integer
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT ceil(rate)::integer FROM public.fx_rates
      WHERE quote = 'RWF' AND fetched_at > now() - interval '7 days'),
    1000);
$$;
GRANT EXECUTE ON FUNCTION public.usd_minimum_rwf() TO anon, authenticated, service_role;

-- ============== FETCHING IT ==============
CREATE OR REPLACE FUNCTION public.fx_refresh()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending bigint; v_requested timestamptz; v_status int; v_body jsonb; v_rate numeric; v_new bigint;
  v_note text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN 'pg_net is not installed here; no rate is fetched';
  END IF;

  -- Collect whatever the last run asked for.
  SELECT request_id, requested_at INTO v_pending, v_requested
    FROM public.fx_requests ORDER BY requested_at LIMIT 1;
  IF v_pending IS NOT NULL THEN
    SELECT status_code, (content)::jsonb INTO v_status, v_body
      FROM net._http_response WHERE id = v_pending;
    IF FOUND THEN
      IF v_status = 200 AND v_body ->> 'result' = 'success' THEN
        v_rate := nullif(v_body -> 'rates' ->> 'RWF', '')::numeric;
        IF v_rate IS NOT NULL AND v_rate > 0 THEN
          INSERT INTO public.fx_rates (quote, base, rate, fetched_at, source)
          VALUES ('RWF', 'USD', v_rate, now(), v_body ->> 'provider')
          ON CONFLICT (quote) DO UPDATE
            SET rate = EXCLUDED.rate, fetched_at = EXCLUDED.fetched_at, source = EXCLUDED.source;
          v_note := format('stored 1 USD = %s RWF', round(v_rate, 2));
        ELSE
          v_note := 'the answer carried no RWF rate';
        END IF;
      ELSE
        v_note := format('the provider answered %s', coalesce(v_status::text, 'nothing'));
      END IF;
      DELETE FROM public.fx_requests WHERE request_id = v_pending;
    ELSIF v_requested < now() - interval '10 minutes' THEN
      -- No answer and no longer worth waiting for; let the next run ask again.
      DELETE FROM public.fx_requests WHERE request_id = v_pending;
      v_note := 'the previous request never answered';
    ELSE
      RETURN 'still waiting for the previous request';
    END IF;
  END IF;

  -- Ask again only when what we hold is getting old. The provider publishes
  -- once a day, so asking more often than that is noise.
  IF EXISTS (SELECT 1 FROM public.fx_rates WHERE quote = 'RWF' AND fetched_at > now() - interval '6 hours') THEN
    RETURN coalesce(nullif(v_note, ''), 'the rate is current');
  END IF;
  IF EXISTS (SELECT 1 FROM public.fx_requests) THEN
    RETURN coalesce(nullif(v_note, ''), 'a request is already in flight');
  END IF;

  SELECT net.http_get(url := 'https://open.er-api.com/v6/latest/USD', timeout_milliseconds := 20000) INTO v_new;
  INSERT INTO public.fx_requests (request_id) VALUES (v_new);
  RETURN trim(both ' ;' FROM v_note || '; asked for a fresh rate');
END $$;

REVOKE EXECUTE ON FUNCTION public.fx_refresh() FROM PUBLIC, anon, authenticated;

-- ============== THE DONATION MINIMUM FOLLOWS IT ==============
-- The page works the minimum out from the same row this function reads, so
-- the two agree. A rate that moves between somebody opening the page and
-- pressing send could still refuse a donation -- once a day, by a franc or
-- two -- and the message says what the figure is rather than just "no".
CREATE OR REPLACE FUNCTION public.initiative_donation_minimum()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min integer := public.usd_minimum_rwf();
BEGIN
  IF NEW.amount < v_min THEN
    RAISE EXCEPTION 'The smallest contribution is % RWF, which is about one US dollar', v_min
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER initiative_donation_minimum
  BEFORE INSERT ON public.initiative_donations
  FOR EACH ROW EXECUTE FUNCTION public.initiative_donation_minimum();

-- ============== SCHEDULE ==============
-- Quarter-hourly, which sounds eager for a daily rate: most runs do nothing
-- at all because the rate is under six hours old. It is the two-phase
-- fetch that wants the short interval -- the run that asks is not the run
-- that collects the answer.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('fx-refresh') FROM cron.job WHERE jobname = 'fx-refresh';
    PERFORM cron.schedule('fx-refresh', '*/15 * * * *', 'SELECT public.fx_refresh()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: fx_refresh() is not scheduled';
  END IF;
END
$cron$;

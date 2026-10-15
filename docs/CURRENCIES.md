# Currencies, exchange rates and advertising fees

How ISOKO quotes and collects money in more than one currency, what an
administrator sets, and the two things that have to be done before the
advertising desk can quote at all.

| Part | Where |
| --- | --- |
| Currencies, country defaults, conversion | `supabase/migrations/20261015100000_currencies.sql` |
| Quotes, agreements, chosen listings, payment routing, reporting | `supabase/migrations/20261015110000_advert_currency.sql` |
| Decimal-safe money in the browser | `src/lib/money.ts` |
| Which country to suggest, without a geolocation service | `src/lib/region.ts` |
| The lists and the conversions, as queries | `src/lib/currencies.ts` |
| Admin screen (Admin → Currencies) | `src/components/admin/CurrencyAdmin.tsx` |
| Quoting (Admin → Advertising → Quote) | `src/components/admin/AdvertQuoteDialog.tsx` |
| The band on the homepage | `src/components/AdvertShowcase.tsx` |
| Tests | `supabase/tests/advert_currency.test.sql`, `src/lib/money.test.ts`, `src/lib/region.test.ts` |

## There is no rate card

Advertising here is negotiated. The advertiser says what they are willing to
spend, the office quotes against that figure, and the only thing the database
enforces about the price is that it does not exceed the maximum they named —
in that maximum's own currency.

A standing price list was built first and then taken out again, because a
published day rate is not how this business sells and an unset one would only
ever have been an empty screen somebody had to be told to ignore. So nothing
has to be configured before the desk can quote.

Worth checking once in **Admin → Currencies**: RWF, USD, EUR, KES, UGX, TZS
and BIF are offered — switch off any you will not quote in, which leaves every
past agreement alone. Optionally pick the currency consolidated reports add up
in, and how old an exchange rate may be before it stops counting.

## How a product gets onto the homepage

A seller uploads their own products in the marketplace. To have one carried in
the sliding band they press **Advertise Here**, tick some of their listings
(up to twelve), and send the request.

Ticking them does not put them on the homepage. If it did, advertising here
would be free — anybody with a seller account could fill in a form and be on
the front page by lunchtime. A listing goes on air when:

- there is an **accepted** agreement on that request, and
- today is inside the run it covers (the agreement's dates, or the days agreed
  counted from the day the advertiser accepted), and
- the product is still active, in stock and photographed.

`advert_live_products()` is the only thing that decides this, and the band
calls it rather than working it out in the browser — a date comparison in
JavaScript is one anybody can edit. An advert comes down by itself when its
run ends; nobody has to remember. When nothing is on air the band falls back
to the catalogue, so the homepage is never empty.

## The rules the database enforces

These are in the schema rather than the screens, so a future screen cannot
get them wrong.

- **A fee and a budget are compared only in the same currency.** If an
  advertiser gave their maximum in shillings, a franc quote is refused — not
  converted and waved through. The advertiser can restate their budget in the
  other currency, and that is a new row beside the old one, never an edit.
- **A quote is never the output of an exchange rate.** The day rate is typed
  in the advertiser's own currency, so nothing is converted and there is no
  rate for anybody to have to confirm. `advert_agreements` keeps `fx_rate`,
  `fx_source`, `fx_read_at` and a confirmation pair for the day a fee is
  settled in a currency the advertiser did not name; nothing writes them
  today, and every screen that shows a rate is conditional on one being
  there, so no empty field is displayed in the meantime.
- **What was accepted never changes.** Once accepted, the currency, the day
  rate, the days, the total and the rate behind them are frozen by a trigger.
  A rate that moves tomorrow does not change what anybody owes.
- **No rate is ever invented.** `fx_convert()` returns NULL rather than a
  guess when a rate is missing or stale, and every caller says "we cannot
  convert that just now". A report names the currencies it could not convert
  instead of dropping them from the total.
- **Money is decimal, never floating point.** `numeric(14,2)` in the
  database; `bigint` counts of the currency's smallest unit in the browser.
  Amounts cross between the two as decimal *strings*, because JSON has only
  doubles.

## Where the rates come from

`fx_refresh()` (pg_cron, quarter-hourly) fetches
`https://open.er-api.com/v6/latest/USD` through pg_net and stores one row per
active currency in `fx_rates`. It needs no API key, which is why it was
chosen: nothing to rotate, nothing to leak, no account to lapse.

- The browser never calls the provider, so no visitor's page depends on
  somebody else's uptime, and the figure on the page is the figure the quote
  was checked against.
- **Nobody can type a rate**, administrators included: `fx_rates` has no
  write policy at all.
- Frankfurter was tried first and does not carry RWF. Recorded here so nobody
  tries it again.
- A currency the provider does not carry is named in `fx_refresh()`'s return
  value. Advertising can still be quoted and collected in it, because a quote
  needs no rate — but its revenue cannot be folded into the consolidated
  figure, and the report says so rather than leaving it out.

## Suggesting a currency

In order of how much it is worth trusting: the country on the seller's own
application, then the device's time zone, then the region subtag of the
browser's locale. Then it asks.

No IP geolocation, so nothing is told to a third party. And **never the
language**: a locale of `en` yields nothing rather than the United States,
because a Rwandan running an English browser must not be quoted in dollars.
`sw-KE` gives Kenya; `en` gives nothing. The form always says where the
suggestion came from and lets it be changed.

## Paying

`payment_methods` says which methods work for which currency and country, and
`payment_methods_for()` returns both what is available and what is not **with
the reason**. The second list is the useful one.

- **Mobile money (ItecPay)** takes Rwandan francs from Rwandan numbers and
  nothing else, and only when `platform_settings.mobile_money` is on.
- **Bank transfer** takes any currency. The advertiser reports a reference and
  finance verifies it against the real amount and currency before it counts as
  money — nothing is marked paid on a claim or a screenshot.
- An accepted agreement opens a finance account on the new `advertising`
  module and charges the fee, exactly as an accepted consultancy proposal
  does. Everything after that is the existing payment engine: the ledger, the
  reported payment that is not money until checked, the provider event whose
  amount *and currency* must match, refunds.

Provider fees are recorded on the payment when it is made, from
`payment_fee_rules` (ItecPay: 3% mobile money, 5% card, per the May 2026
contract). They are never recomputed, so a fee schedule that changes next year
does not rewrite what last year settled at.

## Reporting

`advert_revenue_report(currency)` gives revenue per currency as it was earned —
charged, paid, refunded, fees, settled — and then a consolidated figure in the
reporting currency, with the rate and its age shown. The originals are the
facts; the consolidated column is an arithmetic convenience that was true on
the morning it was run. A currency with no fresh rate appears with its real
amounts and is named in `not_converted` rather than being left out silently.

## Running the tests

The SQL suite needs a local database that is actually current. `npm run
test:db` applies no migrations, so a stale local database reports "all suites
passed" while testing a schema that exists nowhere else — check
`supabase_migrations.schema_migrations` against `supabase/migrations/` first.

```sh
npm test                                            # money, region, the forms and the desk
npm run test:db advert_currency                      # the schema's own rules
```

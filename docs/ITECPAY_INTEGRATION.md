# ItecPay integration: audit and plan

Source: ItecPay's Postman collection "ITEC PAYMENT" (exported 2026-09-25) and
the ItecPay contract (May 2026). Items marked **(ask ItecPay)** aren't in their
documentation.

**Status:** mobile money (MTN, Airtel, SPENN) is built and tested against a fake
ItecPay that answers as documented (`supabase/tests/mobile-money.e2e.mjs`); not
yet against ItecPay itself (the test phase below). Cards, payouts and
reconciliation from reports are not built. Off until
`platform_settings.mobile_money` is set (see docs/DEPLOYMENT.md, step 5b).

| Part | Where |
| --- | --- |
| Rules (who may pay, amounts, one attempt at a time, settling) | `supabase/migrations/20260925180000_mobile_money.sql` |
| Talking to ItecPay (send, status check, callback, sweep) | `supabase/functions/payments-itecpay/` |
| "Pay from your phone" | `src/features/finance/MobileMoneyPay.tsx`, in the travel, consultancy and data payment box and the Training Center student payments page |
| Tests | `supabase/tests/mobile_money.test.sql`, `supabase/tests/mobile-money.e2e.mjs` |

Not offered yet (a decision first): subscriptions (paying from the phone
would be expected to activate the plan at once; today an admin activates it),
marketplace checkout (one checkout can pay several sellers' orders) and
software bookings.

## What ItecPay offers

All requests are `POST`, JSON body, API key **in the body** (`"key"`), reply
`200 OK` with the real outcome in the body's `status` (200 or 400). One key per
payment mode (MTN MoMo, Airtel Money, SPENN, cards), from the portal's
Integrations > API keys page.

| Use | Endpoint | Request | Reply |
| --- | --- | --- | --- |
| Ask a customer to pay from MTN / Airtel / SPENN (V2, current) | `https://pay.itecpay.rw/api2/pay` | `amount`, `phone` (local, e.g. `0788123456`), `key`, `req_ref` (our id, UUID), `note` (shows on the customer's statement), `message` | `{status: 200, data: {financial_transaction_id, transaction_id, amount: "10", currency: "RWF", status: "PENDING"}}` or `{status: 400, data: {message}}` |
| Check a payment | `https://pay.itecpay.rw/api2/verify` | `action: "status_check"`, `req_ref`, `key` | `{status: 200, data: {transaction_id, amount, status: "PENDING" \| "SUCCESSFUL" \| …}}` |
| Result sent to us (V2) | our callback URL | – | `{status: 200, data: {transaction_id, amount, status}}` |
| Card payment link (V1, Pesapal) | `https://pay.itecpay.rw/api/pay/apis/pesapal/generatecode` | `amount`, `email`, `key` (card key) | `{status: 200, PCODE, amount, link, valid_until}` or `{status: 400, PCODE: null}` |
| Card result sent to us | our callback URL | – | `{PCODE, amount: "2000", transID}` |
| Pay out to a wallet (refunds, payouts) | `https://pay.itecpay.rw/api/transfer` | `amount`, `phone`, `key` | not documented |
| Reports | `https://pay.itecpay.rw/api/report` | `key`, `start`/`end` (`YYYYMMDDhhmmss`), `report`: `payments` \| `transfers` \| `charges` \| `all` | not documented |
| Older MoMo request (V1) | `https://pay.itecpay.rw/api/pay` | `amount`, `phone`, `key` (no reference) | `{status: 200, data: {amount, transID}}`; superseded by V2 |

Contract terms that affect the build: fees 3% (MTN, Airtel, SPENN) and 5%
(Visa); a 10% rolling reserve for 180 days; settlements only to MoMo Pay 871951
/ BPR 4491099561; a test phase (UAT) and 1–2 weeks of controlled live testing
before launch; 3D-Secure for cards; refund, cancellation and delivery policies
on the website; chargeback and fraud questions answered within one business day.

## Findings

**Critical: the callbacks can't be trusted on their own.** ItecPay's callbacks
carry no signature. Their documentation only suggests putting a secret in the
callback URL. Anyone who learns that URL (logs, a proxy, a former employee)
could post "SUCCESSFUL" for any transaction. So a callback must never mark a
payment paid by itself: it only tells us to **ask ItecPay** (`/api2/verify`,
with our key, from our server), and only that answer counts. The payment
engine already works this way for amounts (`finance_apply_provider_event`
holds a mismatching amount for review).

**Critical: payouts can be sent twice.** `/api/transfer` takes no reference or
request id, and its reply isn't documented. A retry after a timeout could send
the money twice, with no way to tell. Refunds and payouts stay manual (sent in
the ItecPay portal, recorded in the ledger with a reason) until ItecPay
confirms an idempotent transfer. **(ask ItecPay)**

**High: cards have no status check.** A card payment is only confirmed by its
callback, which is unsigned. Until ItecPay provides a status check for a
`PCODE` **(ask ItecPay)**, card payments can only be confirmed against the
payments report, or by staff. Cards also need 3D-Secure under the contract;
confirm the Pesapal page does it.

**High: the callback for mobile money has no `req_ref`.** It carries ItecPay's
`transaction_id` only, so we must store that id when the payment is requested,
to find the payment when the callback arrives.

**Medium: the full list of statuses isn't documented.** Only `PENDING` and
`SUCCESSFUL` appear. What does a declined, cancelled or timed-out payment say,
and is a callback sent for those? **(ask ItecPay)** Until then, a payment that
stays `PENDING` past a deadline (e.g. 15 minutes) is treated as failed on our
side, and one more `verify` is done before closing it.

**Medium: which key for which phone.** One request endpoint, four keys: the key
picks the network. MTN numbers (078, 079) use the MTN key, Airtel (072, 073) the
Airtel key; SPENN is the customer's choice. Card key only for card links.

**Medium: errors come back as `200 OK`.** The HTTP code is always 200; the
outcome is the body's `status`. Anything unexpected (no body, HTML, a timeout)
is "unknown", never "failed": the payment stays pending and `verify` decides.

**Medium: RWF only.** Replies say `currency: "RWF"`. Accounts in USD or EUR
(possible for travel quotes and the Training Center) can't use ItecPay; they
keep the manual methods.

**Low: the key travels in the body.** Request bodies must never be logged, and
the keys live only in Supabase secrets.

**Low: fees and settlement.** ItecPay deducts its fee and holds 10% for 180
days, so what reaches the bank is less than what customers paid. The ledger
records what the customer paid (their debt is settled in full); the fees and
the reserve are reconciled from the `charges` and `payments` reports, as
company costs.

**Low: V1.** V1 mobile money has no reference and can't be checked; use V2
only. (Cards exist only in V1.)

## Design

```
customer "Pay from my phone"
  -> mobile_money_start (database, called by the browser: the signed-in owner or the
       private link's token; rate-limited per visitor and per record; RWF only;
       the amount checked against what is left; one payment waiting at a time)
       records a pending payment (provider itecpay) and returns its id
  -> payments-itecpay/send {payment_id}: once per payment
       POST /api2/pay { req_ref = our payment id, key for the chosen network }
       ItecPay accepts: its transaction_id is kept, the payment is "processing"
       ItecPay refuses: the payment fails with ItecPay's reason
       no clear answer: the payment waits; the status check decides
  <- "Approve the payment on your phone"; the screen follows mobile_money_status

ItecPay callback -> payments-itecpay/callback/<secret>
       unknown secret: 404. Known transaction_id: POST /api2/verify from our server
       -> finance_apply_provider_event with ItecPay's answer (amount checked, events deduplicated)

every minute (payments-itecpay/sweep) and while the customer's screen waits:
/api2/verify for waiting payments; still PENDING after 15 minutes -> cancelled
("Not approved in time"). Cancelled ones are still checked for a day: a late
approval on the phone is money received and is recorded. A payment ItecPay
reports as failed stays failed.
```

- Our `req_ref` is the engine's payment id, so a repeated request can't create
  a second payment, and every ItecPay transaction maps to one ledger entry.
- The customer never sees the key or ItecPay's addresses; the amount comes
  from the ledger balance, never from the browser.
- Refunds: recorded in the ledger (`finance_refund_payment`, with a reason) and
  sent by staff in the ItecPay portal until the transfer API is safe.
- Nightly reconciliation (not built yet: `/api/report`, `payments` and `charges`): lists what
  ItecPay has that the ledger doesn't, and the other way round, for finance.

## Configuration

Supabase secrets (Dashboard > Edge Functions > Secrets), never in the code or `.env` files in git:

| Secret | Value |
| --- | --- |
| `ITECPAY_KEY_MTN` | MTN Mobile Money key from the portal |
| `ITECPAY_KEY_AIRTEL` | Airtel Money key |
| `ITECPAY_KEY_SPENN` | SPENN key |
| `ITECPAY_KEY_CARD` | Payment Card key (not used yet: cards aren't built) |
| `ITECPAY_CALLBACK_SECRET` | a random value of 32+ characters that we choose; only in the callback address |

Callback address to give ItecPay:
`https://klcyyeeqxxfheurdhmay.supabase.co/functions/v1/payments-itecpay/callback/<ITECPAY_CALLBACK_SECRET>`
(how it is registered, per key in the portal or by ItecPay support: **(ask ItecPay)**).

## Questions for ItecPay (info@itec.rw, +250 788 620 612)

1. Where is the callback URL set (portal, per key, or by you)? Are callbacks signed, or sent from fixed IP addresses we can check?
2. All possible `status` values for `/api2/pay` and `/api2/verify`, and is a callback sent for failed, declined or expired payments?
3. How long does a pending request stay open before it expires?
4. Is `req_ref` unique on your side (a second `/api2/pay` with the same `req_ref` refused)?
5. Cards: is there a status check for a `PCODE`? Does the Pesapal page do 3D-Secure? Can the link carry our reference?
6. `/api/transfer`: its reply, and can it take a reference so a retry doesn't pay twice? Is there a refund API tied to the original transaction?
7. The reply format of `/api/report`.
8. Is there a test (sandbox) mode or test keys? If not, can UAT use small live amounts that are refunded?
9. Which phone formats are accepted (`07…`, `2507…`, `+2507…`)?

## Test plan (UAT, as the contract requires)

With live keys and small amounts to our own phones: request 100 RWF on MTN,
approve, see it become one successful payment; request and decline, see it
fail; request and ignore, see it expire; send the callback twice and a forged
callback, see nothing change twice or at all; the same on Airtel and SPENN; one
card payment through the link. Then refund in the portal and record it. Only
after that, 1–2 weeks with staff before customers see the button.

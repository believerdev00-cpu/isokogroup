# Deploying Isoko

How to take the security-hardening work (migrations `20260922090000` to
`20261001110000`) to production, check it, and back out if needed.

What gets deployed:

| Part | Where | How |
| --- | --- | --- |
| Database (tables, rules, functions) | Supabase project `oswetaksxcepublsjyrt` | `supabase db push` |
| Edge Functions: `training`, `payments-webhook`, `payments-itecpay`, `notifications-dispatch`, `notifications-status`, `file-access`, `service-files`, `generate-pdf` | Same project | `supabase functions deploy` |
| Website | Vercel | push to the production branch |

Nothing in the migrations deletes customer data. They move payments into the
payment ledger and messages into the notification engine, copying the old
records first; the old payment tables stay as read-only history.

## 0. Before you start

- **Know where production stands.** Production's migration history was never
  checked during this work. Link the project and list what it has:

  ```sh
  supabase link --project-ref oswetaksxcepublsjyrt
  supabase migration list        # "Local" vs "Remote" columns
  ```

  Every version marked Remote must also be Local. If production has a version
  that isn't in `supabase/migrations/`, stop: someone changed production outside
  this repository, and that change has to be brought into the repo first.

- **Rehearse on a copy of production.** The migrations were tested on an empty
  database and on the development database, not on production's data. Restore
  production's latest backup into a new, temporary project (Dashboard >
  Database > Backups > Restore to a new project), then run steps 1 to 4 and the
  check in step 8 against that project:

  ```sh
  supabase link --project-ref <temporary project ref>
  supabase db push
  psql "<temporary project connection string>" -f supabase/checks/production_readiness.sql
  ```

  Anything that fails there would have failed in production. Delete the
  temporary project afterwards: it holds customer data. Link back to production
  (`supabase link --project-ref oswetaksxcepublsjyrt`) before step 1.

- **Take a backup** you can restore: Dashboard > Database > Backups (a daily
  backup, or point-in-time recovery if the plan has it). Note the time.

- **Pick a quiet time.** `20260925120100_payment_engine` and
  `20260925160000_training_on_engines` copy payment history; each migration runs
  in one transaction, so a failure leaves the database as it was.

## 1. Database

```sh
supabase db push --dry-run     # lists the migrations it will apply, in order
supabase db push
```

If a migration fails, nothing of that migration is applied. Read the error, fix
the cause (usually data that breaks a new rule, found by the rehearsal), and run
`supabase db push` again: it continues from the failed migration.

## 2. Secrets for the Edge Functions

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL` are provided by Supabase. Set the rest (see `.env.example`):

```sh
supabase secrets set \
  SITE_ORIGINS="https://isokogroups.com,https://www.isokogroups.com" \
  PUBLIC_SITE_URL="https://isokogroups.com" \
  EMAIL_PROVIDER=resend \
  RESEND_API_KEY=<the Resend API key, typed here only> \
  EMAIL_FROM="Isoko Groups <noreply@isokogroups.com>"
```

- `SITE_ORIGINS` and `PUBLIC_SITE_URL` are required: the Training Center API
  refuses to start without them.
- **Email with Resend** (the company sender): `isokogroups.com` is verified in
  Resend (its DNS records are in the Vercel DNS zone, see
  [AUTH_EMAIL.md](AUTH_EMAIL.md)). `RESEND_API_KEY` is an API key with
  "Sending access" (Resend > API Keys). It lives only in Supabase's function
  secrets: not in Vercel (the website sends no email), not in `.env`, not in
  git. The sender can be any address on the verified domain; `noreply@` needs
  no mailbox. After setting the secrets, deploy `notifications-dispatch`
  again (step 3) so it picks them up, and send one test with
  `RESEND_API_KEY=... node supabase/tests/resend-smoke.mjs you@example.com`.
- **Email by SMTP** instead: `EMAIL_PROVIDER=smtp` with `SMTP_HOST`,
  `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD` and
  `EMAIL_FROM` (the Training Center's mailbox, for example; its API no longer
  sends email itself). Port 465: Supabase blocks outgoing ports 25 and 587.
- **WhatsApp (and SMS) with Twilio:** `WHATSAPP_PROVIDER=twilio`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (Twilio Console > Account info; a
  password, only here), `TWILIO_WHATSAPP_FROM`. To test first, use Twilio's
  sandbox (Messaging > Try it out > WhatsApp): `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`,
  and each test phone sends the sandbox's "join" code first. For real customers,
  register your WhatsApp sender in Twilio (Messaging > Senders > WhatsApp senders,
  linked to a Meta Business account) and submit the templates in
  `docs/WHATSAPP_TEMPLATES.md`. SMS through the same account: `SMS_PROVIDER=twilio`
  and `TWILIO_SMS_FROM` (check Twilio's rules for sending SMS to Rwanda first).
  Delivery reports come back to `notifications-status` by themselves; it checks
  Twilio's signature with the auth token.
- Don't set `PAYMENTS_MOCK_SECRET`, or `WHATSAPP_PROVIDER` / `SMS_PROVIDER` to
  `mock`. Hosted functions ignore the mocks anyway, but the settings mislead.
  WhatsApp and SMS stay off (messages marked skipped) until real providers are
  added in `supabase/functions/notifications-dispatch/channels.ts`.

Paying from the phone (ItecPay, see `docs/ITECPAY_INTEGRATION.md`): paste the
keys yourself in Dashboard > Edge Functions > Secrets, from ItecPay's portal
(Integrations > API keys), never into chat, email or a file in the repository:

| Secret | Value |
| --- | --- |
| `ITECPAY_KEY_MTN` | the MTN Mobile Money key |
| `ITECPAY_KEY_AIRTEL` | the Airtel Money key |
| `ITECPAY_KEY_SPENN` | the SPENN key |
| `ITECPAY_CALLBACK_SECRET` | 32+ random characters you make up, e.g. `openssl rand -hex 24` |

A network without its key isn't offered (the request is cancelled with "not
available"). Don't set `ITECPAY_BASE_URL` or `MOBILE_MONEY_WAIT_SECONDS`: they
are for local tests and ignored on hosted Supabase.

## 3. Edge Functions

```sh
npm --prefix training-api ci
npm --prefix training-api run build     # writes supabase/functions/training/index.js
supabase functions deploy training payments-webhook payments-itecpay notifications-dispatch notifications-status file-access service-files generate-pdf
```

## 4. Settings in the database

In the SQL editor:

```sql
-- The site's address, for links in emails and messages (https, no trailing slash).
-- Until it is set, messages that contain a link are skipped.
UPDATE public.platform_settings SET value = 'https://isokogroups.com' WHERE key = 'site_url';
-- Must be 1 in production (tests locally use more)
SELECT value FROM public.platform_settings WHERE key = 'rate_limit_multiplier';
```

### How large an upload the project accepts

Films and episodes are uploaded whole, so the project has to allow a large
single upload. Three limits apply and the smallest one wins:

| Limit | Where | Value |
| --- | --- | --- |
| what the browser refuses before sending | `MAX_UPLOAD_MB` in `src/features/entertainment/api.ts` | 500 MB |
| the project's ceiling for every bucket | Dashboard > Storage > Settings > Upload file size limit (`[storage] file_size_limit` in `supabase/config.toml` sets the local stack) | must be at least 500 MB |
| the bucket's own ceiling | `storage.buckets.file_size_limit` for `entertainment` | 500 MB (524288000) |

Set the project's limit by hand in the dashboard: `supabase config push` would
also overwrite every other setting in `config.toml`. On the free plan the
ceiling cannot go above 50 MB, so larger films need a paid plan; until then the
upload fails with "Payload too large" however large the other two limits are.

A film does not travel in one request. Anything over 6 MB is sent in 6 MB
pieces over Storage's resumable protocol, so a piece that fails is sent again
on its own instead of losing the whole film, and the desk shows how far it has
got. This is what makes a 500 MB upload realistic on a connection that comes
and goes; the total size still has to be within the three limits above.

## 5. Schedule the notification sender and the payment checker

Emails (including new students' temporary passwords) wait in the queue until
`notifications-dispatch` runs. Each run also moves subscriptions along
(`subscription_sweep`): it marks ended trials and paid periods expired and
raises the "trial ends in 2 minutes", "24 hours / 1 hour left" and "expired"
messages. Access itself never waits for it (the database checks the dates on
every request), but those e-mails do, so a 10-minute trial needs the
every-minute schedule. Run it every minute, either with Dashboard >
Integrations > Cron > Create job (type "Supabase Edge Function" or "HTTP
request": `POST https://oswetaksxcepublsjyrt.supabase.co/functions/v1/notifications-dispatch`
with header `Authorization: Bearer <service_role key>`, schedule `* * * * *`),
or in SQL:

```sql
-- once: keep the key in Vault, not in the job
SELECT vault.create_secret('<service_role key>', 'notifications_dispatch_key');
SELECT cron.schedule('notifications-dispatch', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://oswetaksxcepublsjyrt.supabase.co/functions/v1/notifications-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_dispatch_key')),
    body := '{}'::jsonb)
$$);
```

(`pg_cron` and `pg_net` need to be enabled under Database > Extensions.)

The same way, every minute, `POST .../functions/v1/payments-itecpay/sweep` with
the same `Authorization` header: it asks ItecPay about phone payments still
waiting (in case its notification never arrives) and stops waiting after 15
minutes. In SQL, as above with `cron.schedule('payments-itecpay-sweep', ...)` and
that URL.

## 5b. ItecPay: callback address and testing

1. Give ItecPay this callback address (portal or support, see question 1 in
   `docs/ITECPAY_INTEGRATION.md`), with your `ITECPAY_CALLBACK_SECRET` at the end:
   `https://oswetaksxcepublsjyrt.supabase.co/functions/v1/payments-itecpay/callback/<ITECPAY_CALLBACK_SECRET>`
2. Switch it on for admins and finance staff only, and run the contract's test
   phase with small amounts to your own phones (the test plan in
   `docs/ITECPAY_INTEGRATION.md`):
   `UPDATE public.platform_settings SET value = 'staff' WHERE key = 'mobile_money';`
3. After the test phase and ItecPay's sign-off, for everyone:
   `UPDATE public.platform_settings SET value = 'on' WHERE key = 'mobile_money';`
   To stop offering it at any time: `'off'` (payments already waiting still settle).

## 6. Website

Vercel's production environment needs `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key,
never the service-role key). Deploy by pushing to the production branch.

For password reset links, Dashboard > Authentication > URL Configuration needs
the site as **Site URL** (`https://isokogroups.com`) and
`https://isokogroups.com/reset-password` and
`https://www.isokogroups.com/reset-password` under **Redirect URLs**. Supabase
sends these emails itself, and its built-in sender allows only a few emails an
hour ("email rate limit exceeded" on the register page): set up Resend as the
custom SMTP sender under Authentication > SMTP Settings, as described step by
step in [AUTH_EMAIL.md](AUTH_EMAIL.md) (Resend domain, DNS records at
AfriRegister, the Supabase settings, and how to test).

## 7. People and roles

Roles live only in `public.user_roles` (`profiles.role` is a copy). Grant them in
the admin screens, or in SQL for the first admin:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'owner@example.rw';
```

Give the `finance` role to whoever checks and refunds payments (admins can too).
Training Center admins are managed in the Training Center (`training.users`).

## 8. Check

```sh
psql "<production connection string>" -f supabase/checks/production_readiness.sql
```

It is read-only. Every line should say `ok` before real customers use the
site; a `WARN` needs a look, a `FAIL` needs fixing:

| Check | If it isn't ok |
| --- | --- |
| all hardening migrations applied | run step 1 |
| `site_url` | step 4 |
| rate limits at normal strength | set `rate_limit_multiplier` to `1` |
| Training Center currency | Training Center > Settings: RWF, USD or EUR |
| admins, finance role, Training Center admin | step 7 |
| no test accounts | delete them (Dashboard > Authentication) |
| no mock payments / mock-sent messages | they came from testing against production: find out how, then void them (the ledger keeps the record) |
| payment reports waiting 3+ days | the service's staff check them in their screen (Travel, Consultancy, Data), admins for orders and subscriptions |
| provider events needing review | money arrived that didn't match the request; finance checks it |
| notifications-dispatch is sending | step 5; then Dashboard > Edge Functions > notifications-dispatch > Logs |
| channels have a provider | step 2 (email), or accept that WhatsApp/SMS are off |
| messages failed for good | the deliveries' `error` column says why (bad address, provider refused) |
| one-time secrets older than a day | the sender isn't running (step 5) |
| row-level security, public buckets, Training Center access | a later change broke a security rule: `npm run test:db` shows which |
| a film of 60 MB or more uploads in the media desk | the project's upload limit is still 50 MB: step 4, "How large an upload the project accepts" |

The same security rules are checked in CI on every change
(`supabase/tests/schema_guards.test.sql`).

Then try it as people would: sign in, place and cancel an order, open a trip or
consultancy link, record a cash payment on a Training Center enrollment and
check the receipt, and see that the emails arrive.

## What changes for staff and customers

- Payments are never edited or deleted. A mistake is **voided** (the money
  never arrived) or **refunded** (it did, and goes back), always with a reason.
  Fees are reduced with a **discount** or **waiver**.
- Mobile-money, bank and card payments need their transaction reference, and
  a reference is accepted once across the whole platform.
- Only finance staff and admins refund, void or reduce what someone owes
  (Training Center admins for training fees).
- Customer links (travel, consultancy, data) expire 180 days after the request
  closes and can be reset from the staff screen.
- E-Library and Entertainment files open through links that last 4 hours, for
  subscribers only.
- Every email, WhatsApp and SMS comes from one sender; people can switch
  channels off in their settings.
- Once switched on, customers can pay from their phone (MTN, Airtel, SPENN, in
  RWF) on the travel, consultancy and data pages and for Training Center fees;
  it is paid when ItecPay confirms it, with no transaction ID to type. Refunds
  of those payments are sent in the ItecPay portal and recorded in Isoko with a
  reason, as before.

## If something goes wrong

The migrations only go forward; there are no "down" migrations. Choose the
smallest step that fixes the problem:

- **Website:** Vercel > Deployments > promote the previous deployment.
- **An Edge Function:** deploy it from the previous commit
  (`git checkout <commit> -- supabase/functions/<name>` then `supabase functions deploy <name>`).
- **Messages misbehaving:** turn one event off
  (`UPDATE public.notification_event_types SET is_active = false WHERE event_type = '...'`),
  or unschedule the sender (`SELECT cron.unschedule('notifications-dispatch')`):
  messages wait in the queue and go out when it runs again.
- **Too many people blocked by rate limits:** raise `rate_limit_multiplier`
  (e.g. `2`) for a while.
- **The database itself:** fix forward with a new migration. Restoring the
  backup from step 0 is the last resort: everything that happened after it
  (orders, payments, sign-ups) is lost and has to be re-entered.

## Checking changes before they ship

`.github/workflows/ci.yml` runs on every push: lint, types, unit tests and build
for the website and the Training Center API, then a local Supabase with every
migration applied from scratch, the SQL suites (`npm run test:db`), the Training
Center API tests, and the end-to-end tests of the website's services and Edge
Functions. Locally, with Supabase running:

```sh
npm run test:db                    # database rules
npm --prefix training-api test     # Training Center API (rebuilds the local training schema)
```

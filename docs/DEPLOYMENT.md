# Deploying Isoko

How to take the security-hardening work (migrations `20260922090000` to
`20260925170000`) to production, check it, and back out if needed.

What gets deployed:

| Part | Where | How |
| --- | --- | --- |
| Database (tables, rules, functions) | Supabase project `klcyyeeqxxfheurdhmay` | `supabase db push` |
| Edge Functions: `training`, `payments-webhook`, `notifications-dispatch`, `file-access`, `service-files`, `generate-pdf` | Same project | `supabase functions deploy` |
| Website | Vercel | push to the production branch |

Nothing in the migrations deletes customer data. They move payments into the
payment ledger and messages into the notification engine, copying the old
records first; the old payment tables stay as read-only history.

## 0. Before you start

- **Know where production stands.** Production's migration history was never
  checked during this work. Link the project and list what it has:

  ```sh
  supabase link --project-ref klcyyeeqxxfheurdhmay
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
  (`supabase link --project-ref klcyyeeqxxfheurdhmay`) before step 1.

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
  SITE_ORIGINS="https://isokogroup.com,https://www.isokogroup.com" \
  PUBLIC_SITE_URL="https://isokogroup.com" \
  EMAIL_PROVIDER=smtp \
  EMAIL_FROM="Isoko <no-reply@isoko.rw>" \
  SMTP_HOST=... SMTP_PORT=465 SMTP_SECURE=true SMTP_USER=... SMTP_PASSWORD=...
```

- `SITE_ORIGINS` and `PUBLIC_SITE_URL` are required: the Training Center API
  refuses to start without them.
- The SMTP settings are the ones the Training Center used before (its API no
  longer sends email itself). Port 465 with `SMTP_SECURE=true`: Supabase blocks
  outgoing ports 25 and 587.
- Don't set `PAYMENTS_MOCK_SECRET`, or `WHATSAPP_PROVIDER` / `SMS_PROVIDER` to
  `mock`. Hosted functions ignore the mocks anyway, but the settings mislead.
  WhatsApp and SMS stay off (messages marked skipped) until real providers are
  added in `supabase/functions/notifications-dispatch/channels.ts`.

## 3. Edge Functions

```sh
npm --prefix training-api ci
npm --prefix training-api run build     # writes supabase/functions/training/index.js
supabase functions deploy training payments-webhook notifications-dispatch file-access service-files generate-pdf
```

## 4. Settings in the database

In the SQL editor:

```sql
-- The site's address, for links in emails and messages (https, no trailing slash).
-- Until it is set, messages that contain a link are skipped.
UPDATE public.platform_settings SET value = 'https://isokogroup.com' WHERE key = 'site_url';
-- Must be 1 in production (tests locally use more)
SELECT value FROM public.platform_settings WHERE key = 'rate_limit_multiplier';
```

## 5. Schedule the notification sender

Emails (including new students' temporary passwords) wait in the queue until
`notifications-dispatch` runs. Run it every minute, either with Dashboard >
Integrations > Cron > Create job (type "Supabase Edge Function" or "HTTP
request": `POST https://klcyyeeqxxfheurdhmay.supabase.co/functions/v1/notifications-dispatch`
with header `Authorization: Bearer <service_role key>`, schedule `* * * * *`),
or in SQL:

```sql
-- once: keep the key in Vault, not in the job
SELECT vault.create_secret('<service_role key>', 'notifications_dispatch_key');
SELECT cron.schedule('notifications-dispatch', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://klcyyeeqxxfheurdhmay.supabase.co/functions/v1/notifications-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_dispatch_key')),
    body := '{}'::jsonb)
$$);
```

(`pg_cron` and `pg_net` need to be enabled under Database > Extensions.)

## 6. Website

Vercel's production environment needs `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key,
never the service-role key). Deploy by pushing to the production branch.

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

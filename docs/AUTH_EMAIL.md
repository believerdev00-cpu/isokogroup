# Authentication emails through Resend

Confirm-your-email and reset-your-password messages for isokogroups.com, sent
from **Isoko Groups <noreply@isokogroups.com>** through Resend.

## Why the register page says "email rate limit exceeded"

Supabase Auth sends the sign-up confirmation, the "send the link again" email
and the password reset email itself. The website only calls Auth
(`src/lib/auth.tsx`: `signUp`, `resend`, `resetPasswordForEmail`); no code in
this repository sends those emails, and no Edge Function is involved.

Without a custom SMTP sender, Supabase uses its own built-in mailer, which is
meant for trying a project out: it allows only a few emails per hour for the
whole project (Supabase documents it as 2 per hour), and the addresses it
sends to are restricted. When that allowance is used up, Auth answers every
sign-up or reset with HTTP 429 and the message `email rate limit exceeded`
(error code `over_email_send_rate_limit`). The site showed that raw message.

The fix is configuration, not code: give Supabase Auth its own SMTP sender
(Resend), after which the limit becomes the one you set under Rate Limits.
The website changes only make the limit, if it is ever hit again, show a plain
message and stop double requests.

Nothing about seller registration, the 1,500 RWF seller subscription, the 50
and 200 RWF subscriptions, approvals or payments is touched by any of this.

## 1. Resend: the domain

1. In Resend, go to **Domains > Add Domain**, enter `isokogroups.com`, choose
   the region closest to your users, and leave the sending subdomain at its
   default (`send`).
2. Resend then lists the DNS records for this domain. Copy them exactly from
   that page. They are specific to your account; nothing here is a value to
   type in. Expect:
   - **DKIM**: a `TXT` record on a host like `resend._domainkey` with a value
     beginning `p=`. It lets receiving mail servers check that the message was
     really signed for isokogroups.com.
   - **SPF** for Resend's sending subdomain: an `MX` record and a `TXT`
     record (value beginning `v=spf1`) on the host `send` (that is,
     `send.isokogroups.com`). Because it is on the `send` subdomain, it does
     not conflict with an SPF record you may already have on
     `isokogroups.com` itself.
   - **DMARC** (recommended): a `TXT` record on `_dmarc` with a value such
     as the one Resend suggests (`v=DMARC1; p=none;` to start). Add it only
     if `_dmarc.isokogroups.com` does not already exist.
3. Create an API key under **API Keys > Create API Key**, permission
   "Sending access", restricted to the domain if you like. Copy it once: it
   is a password, shown only at creation.

## 2. The DNS records (they live in Vercel, not at AfriRegister)

AfriRegister is the registrar, but the domain's name servers are
`ns1.vercel-dns.com` and `ns2.vercel-dns.com`, so Vercel answers every DNS
query for isokogroups.com. DNS records are managed in Vercel (team
`isoko-groups` > Domains > isokogroups.com > DNS Records, or
`vercel dns ls isokogroups.com`), and a record added at AfriRegister would have
no effect.

The Resend records were added there on 2026-10-01 and the domain shows
**Verified** in Resend:

| Host | Type | Value | TTL |
| --- | --- | --- | --- |
| `@` | TXT | `resend-domain-verification=…` (from Resend) | 60 |
| `resend._domainkey` | TXT | `p=…` (the DKIM key from Resend) | 60 |
| `send` | MX | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 | 60 |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | 60 |

What was there before stays as it was: the Google site-verification TXT on
the root, Vercel's default CAA records, and the ALIAS records that point the
website at Vercel. Notes for later changes:

- There is still **no DMARC** record (`_dmarc`). Resend recommends one;
  `v=DMARC1; p=none;` is the safe start (report only). Add it in the Vercel
  zone when you decide to.
- There is **no MX record on the root**, so no mailbox receives mail at
  isokogroups.com addresses. Sending from `noreply@` does not need one. If
  staff should read mail at an isokogroups.com address, that needs a mail
  provider and its own records, separate from Resend.
- Resend's SPF is on the `send` subdomain. If an SPF record is ever added on
  the root for another sender, keep it to **one** `v=spf1` record per host;
  two make SPF fail.

## 3. Supabase: custom SMTP

Dashboard > project `oswetaksxcepublsjyrt` > **Authentication > SMTP Settings**
(under Emails in newer dashboards):

| Setting | Value |
| --- | --- |
| Enable Custom SMTP | on |
| Sender email | `noreply@isokogroups.com` |
| Sender name | `Isoko Groups` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Username | `resend` |
| Password | the Resend API key from step 1.3 |

Save. The sender domain must be the verified one; `noreply@` needs no
mailbox, Resend accepts any address on the domain.

Then:

- **Authentication > Rate Limits**: with custom SMTP enabled, "Rate limit for
  sending emails" becomes editable (default 30 per hour). Set it to what a
  busy day needs, for example 100 per hour, and leave the one-email-per-minute
  interval per address as it is (the site's "send again" link waits 60 s to
  match).
- **Authentication > Sign In / Providers > Email**: keep **Confirm email**
  on. Do not turn it off to work around the limit.
- **Authentication > URL Configuration**: Site URL `https://isokogroups.com`;
  Redirect URLs include `https://isokogroups.com/**` and
  `https://www.isokogroups.com/**` (the site sends people to `/`,
  `/become-seller` and `/reset-password` after a link).
- **Authentication > Emails (Templates)**: optional wording changes. Keep the
  `{{ .ConfirmationURL }}` placeholder in every template.

The Edge Functions' own email (order and payout notifications, Training
Center mail) is separate and already configured through `EMAIL_PROVIDER=smtp`
and the `SMTP_*` secrets (docs/DEPLOYMENT.md, step 2). The same Resend key can
be their `SMTP_PASSWORD`, with `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`,
`SMTP_SECURE=true`, `SMTP_USER=resend`,
`EMAIL_FROM="Isoko Groups <noreply@isokogroups.com>"`.

## 4. Environment variables

| Where | Variables | Notes |
| --- | --- | --- |
| Local `.env` | `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | unchanged; public values that end up in the browser bundle |
| Vercel (production and preview) | the same three `VITE_*` variables | unchanged |
| Supabase Dashboard, SMTP Settings | the Resend API key as the SMTP password | the only place it lives for Auth email |
| Supabase function secrets (`supabase secrets set`) | `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | the notification sender, already documented; may use the same Resend key |

There is no `RESEND_API_KEY` variable: the website never talks to Resend
directly, and the functions take the key as `SMTP_PASSWORD`. Never put the
key in `.env`, in Vercel, in source code or in git. `.env` and `.env.*`
(except `.env.example`) are ignored by git.

## 5. Testing, once the domain is verified and SMTP is saved

Use a mailbox you can read for each test.

1. **Register**: on `/login` > Register, create an account. The page says
   "Account created. We sent a confirmation link…". The email arrives from
   Isoko Groups <noreply@isokogroups.com>; check that it is not in spam, and
   that the message headers show `dkim=pass` and `spf=pass` (Gmail: "Show
   original").
2. **Confirm**: open the link. It lands on the site, signed in. A seller
   registration lands on `/become-seller`.
3. **Send again**: register another address, do not open the email, press
   "Didn't get it? Send the link again". It waits 60 s between sends and
   says "Please wait a moment" if Auth refuses.
4. **Log in** with the confirmed account; an unconfirmed one gets the
   "confirm your email first" notice.
5. **Password reset**: `/forgot-password`, enter the address, open the link,
   choose a new password on `/reset-password`, log in with it.
6. **Seller path**: register as a seller, confirm, fill the seller
   application, report the 1,500 RWF payment; an admin confirms it under
   Users > Subscription payments; the seller dashboard opens and the
   Subscription page offers no 50 or 200 RWF plan. (Unchanged by this work;
   `supabase/tests/seller_subscription.test.sql` and
   `seller-subscription.e2e.mjs` cover it.)
7. In Resend, **Logs** lists each message as delivered.

## 6. Production checklist

- [ ] isokogroups.com shows **Verified** in Resend
- [ ] DNS records in the Vercel zone, domain Verified in Resend; only one SPF record per host
- [ ] Supabase SMTP Settings saved with `smtp.resend.com`, port 465, user `resend`, sender `noreply@isokogroups.com`, name `Isoko Groups`
- [ ] Rate limit for sending emails raised; Confirm email still on
- [ ] Site URL and Redirect URLs set
- [ ] Website deployed (the message and double-request changes)
- [ ] Register, confirm, send-again, log in and reset tested with a real mailbox; `dkim=pass`, `spf=pass`
- [ ] Resend API key stored nowhere but the Supabase Dashboard (and function secrets, if reused)

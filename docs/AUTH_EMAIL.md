# Authentication emails through Resend

Confirm-your-email and reset-your-password messages for isokogroups.com, sent
from **Isoko Groups <no-reply@isokogroups.com>** through Resend.

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

## 2. AfriRegister: adding the DNS records

1. Sign in to the AfriRegister client area, open **Domains** (or "My
   Domains"), choose `isokogroups.com` and open its **DNS management** (the
   menu is named "Manage DNS", "DNS Management" or "Zone Editor" depending on
   the panel version). If the domain's name servers point somewhere else
   (for example to a hosting provider or Cloudflare), the records go in that
   provider's DNS panel instead: the name servers decide who answers.
2. Before adding anything, read the records already there and note:
   - every `TXT` record on the root (`@` or `isokogroups.com`) whose value
     starts with `v=spf1`. A domain may have **only one** SPF record on a
     host; two of them make SPF fail for everyone. Resend's SPF goes on
     `send`, so a root SPF is normally left alone. If Resend ever asks for
     an SPF on the root as well, merge it into the existing record (one
     `v=spf1 ... ~all` line with both `include:` parts) rather than adding a
     second one;
   - whether `_dmarc` and `resend._domainkey` already exist (they should
     not; if they do, send me what is there before changing them);
   - the existing `MX` records on the root. Leave them: they are your
     incoming mail. Resend's `MX` is on `send`, not on the root.
3. Add each record from the Resend page:
   - **Host / Name**: what Resend shows, without the domain if the panel adds
     it for you (`resend._domainkey`, `send`, `_dmarc`). Some panels want the
     full name (`resend._domainkey.isokogroups.com`); the panel's existing
     records show which style it uses.
   - **Type**: `TXT` or `MX` as shown.
   - **Value**: pasted exactly. For the `MX`, the priority Resend shows (for
     example 10).
   - **TTL**: the default is fine.
4. Do not delete or edit any other record, in particular the `A`/`CNAME`
   records that point the website at Vercel and the root `MX` records.
5. Back in Resend, press **Verify DNS Records**. Propagation usually takes
   minutes, sometimes a few hours. The domain shows **Verified** when done.

## 3. Supabase: custom SMTP

Dashboard > project `oswetaksxcepublsjyrt` > **Authentication > SMTP Settings**
(under Emails in newer dashboards):

| Setting | Value |
| --- | --- |
| Enable Custom SMTP | on |
| Sender email | `no-reply@isokogroups.com` |
| Sender name | `Isoko Groups` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Username | `resend` |
| Password | the Resend API key from step 1.3 |

Save. The sender domain must be the verified one; `no-reply@` needs no
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
`EMAIL_FROM="Isoko Groups <no-reply@isokogroups.com>"`.

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
   Isoko Groups <no-reply@isokogroups.com>; check that it is not in spam, and
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
- [ ] Only one SPF record per host at AfriRegister; root `MX` and Vercel records untouched
- [ ] Supabase SMTP Settings saved with `smtp.resend.com`, port 465, user `resend`, sender `no-reply@isokogroups.com`, name `Isoko Groups`
- [ ] Rate limit for sending emails raised; Confirm email still on
- [ ] Site URL and Redirect URLs set
- [ ] Website deployed (the message and double-request changes)
- [ ] Register, confirm, send-again, log in and reset tested with a real mailbox; `dkim=pass`, `spf=pass`
- [ ] Resend API key stored nowhere but the Supabase Dashboard (and function secrets, if reused)

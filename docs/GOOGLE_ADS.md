# Google Ads and remarketing

Isoko Groups can advertise to people who visited the website before, including
former trial users, through Google Ads remarketing. This is done the way Google
supports it: a Google tag on the website, a consent bar, and audiences built by
Google Ads from the pages visited. Nothing else: no phone lists, no emails, no
WhatsApp or SMS to former users, no promise that any one person will see an ad.

## What the website does

- `src/lib/analytics.tsx` loads the Google tag **only** when both are true:
  1. `VITE_GOOGLE_TAG_ID` is set at build time (Vercel > Settings >
     Environment Variables). It is the id from **Google Ads > Tools > Google
     tag** (`AW-…`), or the `G-…` id of a Google Analytics property linked to the
     Ads account. Leave it empty and no Google code is downloaded at all.
  2. The visitor pressed **Accept** in the consent bar (`ConsentBanner`). The
     choice is kept in the browser (`localStorage` key `isoko-consent`); Decline
     is remembered too and the bar is not shown again.
- Consent Mode v2: the tag is told `denied` for `ad_storage`, `ad_user_data`,
  `ad_personalization` and `analytics_storage` first, then `granted`, before it
  loads. Google records the choice with every hit.
- What is sent: a `page_view` per route, and two conversion-style events:
  `sign_up` (an account was created) and `subscription_payment_reported` (a
  customer reported a Mobile Money payment). Only the event names; never the
  email, phone, name or user id.
- The tag is a third-party script from `googletagmanager.com`; the site has no
  Content-Security-Policy header, so nothing else needs changing.

## Setting it up in Google Ads

1. Google Ads > Tools > **Google tag**: copy the tag id and set
   `VITE_GOOGLE_TAG_ID` on Vercel, then redeploy.
2. Google Ads > Tools > **Audience manager** > Your data sources: confirm the tag
   is receiving data (after a visit with consent accepted).
3. Create audience segments, for example:
   - *All website visitors* (default, 30 to 540 days).
   - *Visited the Subscription page but no payment reported*: visitors of
     `/subscription` minus the `subscription_payment_reported` conversion.
   - *Former trial users*: visitors who triggered `sign_up` but not
     `subscription_payment_reported` in the chosen window.
4. Tools > **Conversions**: create two "website" conversions from the tag,
   event names `sign_up` and `subscription_payment_reported`.
5. Build a Display, YouTube or Search remarketing campaign on those segments.

Google decides who is eligible (its own minimum audience sizes, consent rules
and policy); the website cannot target a named person and does not try to.

## What is deliberately not done

- No upload of customer lists (emails or phones) to Customer Match. It would
  need its own consent and a documented lawful basis; nothing in the platform
  collects that consent today.
- No marketing emails, SMS or WhatsApp to former users: the notification engine
  only sends transactional messages about the person's own trial, payments,
  orders and requests.
- No Google Tag Manager container, no Analytics 4 setup beyond what the one tag
  id gives. Add them later through the same consent gate if needed.

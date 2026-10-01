# Who can do what on the website

Three levels, enforced in the database (row-level security, function grants
and triggers), not only hidden in the frontend.

| Level | Who | What |
| --- | --- | --- |
| Public | anyone | Home, About, Service Hub, the service pages (Logistics, Travel, Consultancy, Data Analysis, Software, Training), Track a shipment, Entertainment (films, TV series, genres, podcasts, photo, art, fashion, live, events), the Isoko Fashion Hub, subscription prices, the private customer links (`/travel/trip/<token>`, …) |
| Account | signed in | Start a service: request a trip, consultancy or data analysis, book a software consultation, register for a course, ask about or order a Fashion Hub style, save Entertainment items, see the dashboard and subscription status |
| Subscription | signed in with access (trial, paid period, seller plan, or admin/staff) | The member services: Marketplace, cart and orders, deliveries, packaging, sourcing, E-Library, Entertainment playback of paid films and episodes, the seller dashboard |

## Account level: what changed (`20261002120000_requests_require_account.sql`)

- `travel_request_trip`, `consult_submit_request` and `data_submit_request` are
  no longer executable by `anon`. A visitor who calls them gets *permission
  denied* whatever the website shows.
- `software_bookings` and `course_registrations` can only be inserted by the
  signed-in owner (`user_id` can no longer be empty).
- Fashion Hub requests (`fashion_submit_request`) are signed-in only from the
  start.
- The website shows `AccountRequired` in place of those forms when signed out
  (Register / Sign in, and Login brings the person back to the same page via
  `state.from`). Login now returns to `from` even when the person has no active
  subscription; member pages show their own subscription wall.

**Exception, unchanged:** the Training Center application (`/training-center`)
has its own identity flow (email claim and confirmation inside the training
API) and still works without a website account. Changing it is a separate
decision.

## Registration is not subscription

A new account starts a 10-minute trial on first sign-in; after it ends the
account stays, the member services lock, and the dashboard and Subscription
page show one of: free trial (with countdown), active (until date), expiring
soon (3 days or less), payment awaiting confirmation, expired, no subscription.
A subscription becomes active only when an admin confirms the Mobile Money
payment (`subscription_confirm_payment`); a reported, rejected or missing
payment never opens access. In-app and email notifications already exist for:
trial started / ending / expired, payment pending / rejected, week or month
activated / ending / expired, seller plan activated / ending / expired.

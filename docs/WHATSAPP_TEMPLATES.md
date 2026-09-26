# WhatsApp templates (Twilio)

WhatsApp only lets Isoko start a conversation with a template WhatsApp has
approved. Below is one template per WhatsApp notification, written from the
texts Isoko sends today. Placeholders are numbered as WhatsApp requires, and
each ends with a closing line, because WhatsApp refuses a template that starts
or ends with a placeholder.

Until a template is approved and registered, that notification is sent as plain
text. WhatsApp only delivers plain text within 24 hours of the customer's last
message to you (and in Twilio's sandbox); otherwise it fails with "needs an
approved WhatsApp template" and the email or SMS still goes out.

## Submitting one

1. Twilio Console > Messaging > Content Template Builder > Create new.
2. Name: the template name below. Language: English. Content type: Text.
3. Body: paste the body below. Add a sample value for each placeholder (the
   samples below work).
4. Save, then "Submit for WhatsApp approval", category **Utility**.
5. Once approved, copy its Content SID (`HX…`) and register it with the SQL
   below (Supabase > SQL editor), replacing `HX…`.

To stop using a template, delete its row (`DELETE FROM public.notification_templates
WHERE event_type = '…' AND channel = 'whatsapp';`): the plain text is used again.

## CONSULTANCY_PROPOSAL_READY

The consultancy proposal is ready. Template name: `isoko_consultancy_proposal_ready`

```
Hello {{1}}, your proposal ({{2}}) is ready. Review it here: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('CONSULTANCY_PROPOSAL_READY', 'whatsapp', 'CONSULTANCY_PROPOSAL_READY',
  'Hello {{name}}, your proposal ({{amount}}) is ready. Review it here: {{link}}',
  'HX…', ARRAY['name', 'amount', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## CONSULTANCY_REQUEST_CREATED

Consultancy request received. Template name: `isoko_consultancy_request_created`

```
Hello {{1}}, thank you for your {{2}} request. A consultant will contact you. Follow it here: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` service: e.g. `business plan`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('CONSULTANCY_REQUEST_CREATED', 'whatsapp', 'CONSULTANCY_REQUEST_CREATED',
  'Hello {{name}}, thank you for your {{service}} request. A consultant will contact you. Follow it here: {{link}}',
  'HX…', ARRAY['name', 'service', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## CUSTOMER_LINK_RESET

A customer's private link was replaced. Template name: `isoko_customer_link_reset`

```
Hello {{1}}, here is your new private link for {{2}}. The old one no longer works: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` reference: e.g. `ISO-TRIP-00123`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('CUSTOMER_LINK_RESET', 'whatsapp', 'CUSTOMER_LINK_RESET',
  'Hello {{name}}, here is your new private link for {{reference}}. The old one no longer works: {{link}}',
  'HX…', ARRAY['name', 'reference', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## DATA_ANALYSIS_READY

Data analysis results are ready for review. Template name: `isoko_data_analysis_ready`

```
Hello {{1}}, your results are ready for your review: {{2}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('DATA_ANALYSIS_READY', 'whatsapp', 'DATA_ANALYSIS_READY',
  'Hello {{name}}, your results are ready for your review: {{link}}',
  'HX…', ARRAY['name', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## DATA_ANALYSIS_REQUEST_CREATED

Data analysis request received. Template name: `isoko_data_analysis_request_created`

```
Hello {{1}}, thank you for your {{2}} request. Upload your data and follow the project here: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` service: e.g. `business plan`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('DATA_ANALYSIS_REQUEST_CREATED', 'whatsapp', 'DATA_ANALYSIS_REQUEST_CREATED',
  'Hello {{name}}, thank you for your {{service}} request. Upload your data and follow the project here: {{link}}',
  'HX…', ARRAY['name', 'service', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## DELIVERY_COMPLETED

Delivery completed (customer). Template name: `isoko_delivery_completed`

```
Your delivery to {{1}} was completed. {{2}}
Thank you, Isoko.
```

- `{{1}}` dropoff: e.g. `Kimironko`
- `{{2}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('DELIVERY_COMPLETED', 'whatsapp', 'DELIVERY_COMPLETED',
  'Your delivery to {{dropoff}} was completed. {{link}}',
  'HX…', ARRAY['dropoff', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## DELIVERY_DRIVER_ASSIGNED

A driver was assigned (customer). Template name: `isoko_delivery_driver_assigned`

```
A driver has been assigned to your delivery to {{1}}. {{2}}
Thank you, Isoko.
```

- `{{1}}` dropoff: e.g. `Kimironko`
- `{{2}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('DELIVERY_DRIVER_ASSIGNED', 'whatsapp', 'DELIVERY_DRIVER_ASSIGNED',
  'A driver has been assigned to your delivery to {{dropoff}}. {{link}}',
  'HX…', ARRAY['dropoff', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## DELIVERY_JOB_ASSIGNED

A delivery was assigned (driver). Template name: `isoko_delivery_job_assigned`

```
Pickup: {{1}} → {{2}}. {{3}}
Thank you, Isoko.
```

- `{{1}}` pickup: e.g. `Nyabugogo`
- `{{2}}` dropoff: e.g. `Kimironko`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('DELIVERY_JOB_ASSIGNED', 'whatsapp', 'DELIVERY_JOB_ASSIGNED',
  'Pickup: {{pickup}} → {{dropoff}}. {{link}}',
  'HX…', ARRAY['pickup', 'dropoff', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## ORDER_PAID

Order paid, ready to ship (seller). Template name: `isoko_order_paid`

```
The buyer's payment of {{1}} for order #{{2}} is confirmed. Please prepare and ship it. {{3}}
Thank you, Isoko.
```

- `{{1}}` amount: e.g. `150,000 RWF`
- `{{2}}` order: e.g. `a1b2c3d4`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('ORDER_PAID', 'whatsapp', 'ORDER_PAID',
  'The buyer''s payment of {{amount}} for order #{{order}} is confirmed. Please prepare and ship it. {{link}}',
  'HX…', ARRAY['amount', 'order', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## ORDER_SHIPPED

Order shipped (buyer). Template name: `isoko_order_shipped`

```
Order #{{1}} has shipped. Confirm delivery when it arrives: {{2}}
Thank you, Isoko.
```

- `{{1}}` order: e.g. `a1b2c3d4`
- `{{2}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('ORDER_SHIPPED', 'whatsapp', 'ORDER_SHIPPED',
  'Order #{{order}} has shipped. Confirm delivery when it arrives: {{link}}',
  'HX…', ARRAY['order', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## PAYMENT_FAILED

A provider payment failed. Template name: `isoko_payment_failed`

```
Hello {{1}}, your payment of {{2}} for {{3}} did not go through ({{4}}). Please try again. {{5}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` label: e.g. `ISO-TRIP-00123 · Aline Uwase`
- `{{4}}` reason: e.g. `wrong reference`
- `{{5}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('PAYMENT_FAILED', 'whatsapp', 'PAYMENT_FAILED',
  'Hello {{name}}, your payment of {{amount}} for {{label}} did not go through ({{reason}}). Please try again. {{link}}',
  'HX…', ARRAY['name', 'amount', 'label', 'reason', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## PAYMENT_REFUNDED

Money was refunded. Template name: `isoko_payment_refunded`

```
Hello {{1}}, Isoko refunded {{2}} for {{3}}. {{4}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` label: e.g. `ISO-TRIP-00123 · Aline Uwase`
- `{{4}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('PAYMENT_REFUNDED', 'whatsapp', 'PAYMENT_REFUNDED',
  'Hello {{name}}, Isoko refunded {{amount}} for {{label}}. {{link}}',
  'HX…', ARRAY['name', 'amount', 'label', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## PAYMENT_REPORT_REJECTED

A reported payment could not be found. Template name: `isoko_payment_report_rejected`

```
Hello {{1}}, we could not confirm the payment you reported ({{2}}, {{3}}) for {{4}}: {{5}}. Please check it or contact us. {{6}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` reference: e.g. `ISO-TRIP-00123`
- `{{3}}` amount: e.g. `150,000 RWF`
- `{{4}}` label: e.g. `ISO-TRIP-00123 · Aline Uwase`
- `{{5}}` reason: e.g. `wrong reference`
- `{{6}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('PAYMENT_REPORT_REJECTED', 'whatsapp', 'PAYMENT_REPORT_REJECTED',
  'Hello {{name}}, we could not confirm the payment you reported ({{reference}}, {{amount}}) for {{label}}: {{reason}}. Please check it or contact us. {{link}}',
  'HX…', ARRAY['name', 'reference', 'amount', 'label', 'reason', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## PAYMENT_SUCCESSFUL

A payment was received. Template name: `isoko_payment_successful`

```
Hello {{1}}, we received your payment of {{2}} for {{3}}. Balance: {{4}}. {{5}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` label: e.g. `ISO-TRIP-00123 · Aline Uwase`
- `{{4}}` balance: e.g. `0 RWF`
- `{{5}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('PAYMENT_SUCCESSFUL', 'whatsapp', 'PAYMENT_SUCCESSFUL',
  'Hello {{name}}, we received your payment of {{amount}} for {{label}}. Balance: {{balance}}. {{link}}',
  'HX…', ARRAY['name', 'amount', 'label', 'balance', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## PAYOUT_PAID

Payout sent (seller). Template name: `isoko_payout_paid`

```
Your payout of {{1}} was sent to your {{2}}. {{3}}
Thank you, Isoko.
```

- `{{1}}` amount: e.g. `150,000 RWF`
- `{{2}}` method: e.g. `MoMo`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('PAYOUT_PAID', 'whatsapp', 'PAYOUT_PAID',
  'Your payout of {{amount}} was sent to your {{method}}. {{link}}',
  'HX…', ARRAY['amount', 'method', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## TRIP_CANCELLED

The trip was cancelled. Template name: `isoko_trip_cancelled`

```
Hello {{1}}, your trip {{2}} was cancelled. Contact us with any questions. {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` reference: e.g. `ISO-TRIP-00123`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('TRIP_CANCELLED', 'whatsapp', 'TRIP_CANCELLED',
  'Hello {{name}}, your trip {{reference}} was cancelled. Contact us with any questions. {{link}}',
  'HX…', ARRAY['name', 'reference', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## TRIP_CHANGED

The price of a confirmed trip changed. Template name: `isoko_trip_changed`

```
Hello {{1}}, the total for your trip is now {{2}}. Details: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('TRIP_CHANGED', 'whatsapp', 'TRIP_CHANGED',
  'Hello {{name}}, the total for your trip is now {{amount}}. Details: {{link}}',
  'HX…', ARRAY['name', 'amount', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## TRIP_CONFIRMED

The trip is confirmed. Template name: `isoko_trip_confirmed`

```
Hello {{1}}, your trip is confirmed. Total {{2}}. Details and payment: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('TRIP_CONFIRMED', 'whatsapp', 'TRIP_CONFIRMED',
  'Hello {{name}}, your trip is confirmed. Total {{amount}}. Details and payment: {{link}}',
  'HX…', ARRAY['name', 'amount', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## TRIP_QUOTE_READY

The trip quote is ready. Template name: `isoko_trip_quote_ready`

```
Hello {{1}}, your trip plan and quote ({{2}}) are ready. Review and accept it here: {{3}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` amount: e.g. `150,000 RWF`
- `{{3}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('TRIP_QUOTE_READY', 'whatsapp', 'TRIP_QUOTE_READY',
  'Hello {{name}}, your trip plan and quote ({{amount}}) are ready. Review and accept it here: {{link}}',
  'HX…', ARRAY['name', 'amount', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```

## TRIP_REQUESTED

Trip request received. Template name: `isoko_trip_requested`

```
Hello {{1}}, thank you! We are planning your trip and will send you a quote. Follow it here: {{2}}
Thank you, Isoko.
```

- `{{1}}` name: e.g. `Aline`
- `{{2}}` link: e.g. `https://isokogroup.com/travel/trip/…`

```sql
INSERT INTO public.notification_templates (event_type, channel, subject, body, provider_template, provider_variables)
VALUES ('TRIP_REQUESTED', 'whatsapp', 'TRIP_REQUESTED',
  'Hello {{name}}, thank you! We are planning your trip and will send you a quote. Follow it here: {{link}}',
  'HX…', ARRAY['name', 'link'])
ON CONFLICT (event_type, channel) DO UPDATE
SET provider_template = EXCLUDED.provider_template, provider_variables = EXCLUDED.provider_variables;
```


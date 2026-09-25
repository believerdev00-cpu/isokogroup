-- One payment engine for every Isoko service
--
-- Before: six payment models (orders.payment_status, subscriptions, three
-- *_payments tables, software booking flags), each with its own rules. A
-- customer could report any amount, the same transaction reference twice, and
-- one staff member could insert a payment already "confirmed", edit or delete
-- payment history; there were no refunds.
--
-- Now every billable thing (a trip, a consultancy or data request, an order, a
-- subscription, a software booking) has one finance account:
--
--   finance_ledger       append-only: charge, payment, refund, discount, waiver,
--                        adjustment, void. The balance is always the sum of the
--                        ledger (positive = the customer owes Isoko).
--   finance_submissions  what a customer SAYS they paid (a reference number).
--                        Never money until staff verify it.
--   finance_payments     money Isoko actually received: verified submissions,
--                        payments staff record, and payment-provider payments
--                        confirmed by webhook. Refunds and voids happen here.
--
-- Rules, enforced here in the database:
--   * amounts are checked against the outstanding balance (no overpayment
--     unless the account allows it); the browser's amount is never trusted
--   * a mobile-money / bank / card reference can be reported or recorded once;
--     a provider transaction id is recorded once; retries with the same
--     idempotency key return the first result
--   * service staff verify and record payments for their own service; only
--     finance staff and admins refund, void, discount, waive or adjust, always
--     with a reason
--   * nothing is ever deleted; the ledger can't be changed at all
--   * charges follow the price: an accepted trip quote, an accepted proposal,
--     a data-analysis fee, an order total, an agreed software price
--
-- The old *_payments tables stay, read-only, as history; their rows are copied
-- in below. The customer-facing functions keep their names and arguments.

-- ============== TABLES ==============
CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN ('travel', 'consultancy', 'data', 'marketplace', 'subscriptions', 'software')),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency IN ('RWF', 'USD', 'EUR')),
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT '',
  allow_overpayment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_table, entity_id)
);
CREATE INDEX finance_accounts_customer_idx ON public.finance_accounts (customer_user_id);
CREATE INDEX finance_accounts_module_idx ON public.finance_accounts (module, created_at DESC);

CREATE TABLE public.finance_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'other')),
  reference text NOT NULL CHECK (length(reference) BETWEEN 3 AND 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  -- 'portal' (customer link), 'account' (signed in), 'checkout' (marketplace)
  via text NOT NULL DEFAULT 'portal' CHECK (via IN ('portal', 'account', 'checkout')),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  payment_id uuid,
  legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_submissions_account_idx ON public.finance_submissions (account_id, created_at);
CREATE INDEX finance_submissions_pending_idx ON public.finance_submissions (created_at) WHERE status = 'pending';

CREATE TABLE public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'cash', 'other')),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  provider_txn_id text,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'voided')),
  refunded_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  voided_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_id uuid REFERENCES public.finance_submissions(id),
  idempotency_key text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_payments_account_idx ON public.finance_payments (account_id, created_at);
ALTER TABLE public.finance_submissions
  ADD CONSTRAINT finance_submissions_payment_fk FOREIGN KEY (payment_id) REFERENCES public.finance_payments(id);
CREATE TRIGGER finance_payments_updated_at BEFORE UPDATE ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One provider transaction = one payment
CREATE UNIQUE INDEX finance_payments_provider_txn_uq ON public.finance_payments (provider, provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;
-- A mobile-money / bank / card reference is money received once. (Rows copied
-- from the old tables are exempt: their history is kept as it was.)
CREATE UNIQUE INDEX finance_payments_reference_uq ON public.finance_payments (method, upper(reference))
  WHERE provider = 'manual' AND method IN ('momo', 'bank', 'card') AND reference <> ''
    AND status <> 'voided' AND NOT legacy;
-- ... and can be reported once: anywhere for momo/bank/card (except a
-- marketplace checkout, where one payment covers the orders of several
-- sellers), and once per account in any case.
CREATE UNIQUE INDEX finance_submissions_reference_uq ON public.finance_submissions (method, upper(reference))
  WHERE status <> 'rejected' AND method IN ('momo', 'bank', 'card') AND via <> 'checkout' AND NOT legacy;
CREATE UNIQUE INDEX finance_submissions_account_reference_uq ON public.finance_submissions (account_id, upper(reference))
  WHERE status <> 'rejected' AND NOT legacy;

CREATE TABLE public.finance_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  kind text NOT NULL CHECK (kind IN ('charge', 'payment', 'refund', 'discount', 'waiver', 'adjustment', 'void')),
  -- positive: the customer owes more; negative: owes less
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  currency text NOT NULL,
  -- 'price' entries follow the price of the service (quote, fee, total)
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('price', 'manual', 'provider', 'legacy')),
  description text NOT NULL DEFAULT '',
  reason text,
  payment_id uuid REFERENCES public.finance_payments(id),
  reverses_entry_id bigint REFERENCES public.finance_ledger(id),
  idempotency_key text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (CASE kind
    WHEN 'charge' THEN amount > 0
    WHEN 'payment' THEN amount < 0
    WHEN 'refund' THEN amount > 0
    WHEN 'discount' THEN amount < 0
    WHEN 'waiver' THEN amount < 0
    ELSE true END)
);
CREATE INDEX finance_ledger_account_idx ON public.finance_ledger (account_id, id);

-- Payment-provider webhooks, kept once per provider event (duplicates ignored)
CREATE TABLE public.finance_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  payment_id uuid REFERENCES public.finance_payments(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ============== NOTHING DISAPPEARS ==============
-- The ledger never changes. Payments, submissions and accounts change only
-- inside the finance functions below, and are never deleted, not even by the
-- service role or the database owner.
CREATE OR REPLACE FUNCTION public.finance_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Website and service-role sessions never write directly; the finance
  -- functions run as their owner and switch the flag on first.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'finance_ledger'
     AND current_user NOT IN ('anon', 'authenticated', 'service_role')
     AND current_setting('isoko.finance_internal', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Financial records can''t be changed or deleted directly. Use a refund, void or adjustment.'
    USING ERRCODE = '42501';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_accounts', 'finance_submissions', 'finance_payments', 'finance_ledger', 'finance_provider_events'] LOOP
    EXECUTE format('CREATE TRIGGER finance_guard BEFORE UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.finance_guard()', t);
    EXECUTE format('CREATE TRIGGER finance_guard_truncate BEFORE TRUNCATE ON public.%I
                      FOR EACH STATEMENT EXECUTE FUNCTION public.finance_guard()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['finance_accounts', 'finance_submissions', 'finance_payments'] LOOP
    EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- ============== WHO MAY DO WHAT ==============
-- Travel, consultancy and data staff handle their own service's payments;
-- marketplace, subscriptions and software are for finance staff and admins.
CREATE OR REPLACE FUNCTION public.finance_can_collect(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
      OR public.has_role(auth.uid(), 'finance')
      OR (_module IN ('travel', 'consultancy', 'data') AND public.is_service_staff(_module));
$$;

-- Refunds, voids, discounts, waivers and adjustments
CREATE OR REPLACE FUNCTION public.finance_can_reverse()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.has_role(auth.uid(), 'finance');
$$;

CREATE OR REPLACE FUNCTION public.finance_account_visible(_account uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.finance_accounts a
    WHERE a.id = _account AND (a.customer_user_id = auth.uid() OR public.finance_can_collect(a.module))
  );
$$;

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customer or finance staff view accounts" ON public.finance_accounts
  FOR SELECT TO authenticated USING (customer_user_id = auth.uid() OR public.finance_can_collect(module));
CREATE POLICY "Customer or finance staff view submissions" ON public.finance_submissions
  FOR SELECT TO authenticated USING (public.finance_account_visible(account_id));
CREATE POLICY "Customer or finance staff view payments" ON public.finance_payments
  FOR SELECT TO authenticated USING (public.finance_account_visible(account_id));
CREATE POLICY "Customer or finance staff view ledger" ON public.finance_ledger
  FOR SELECT TO authenticated USING (public.finance_account_visible(account_id));
CREATE POLICY "Finance staff view provider events" ON public.finance_provider_events
  FOR SELECT TO authenticated USING (public.finance_can_reverse());

-- Reads only, for everyone including the service role: writes go through the
-- finance functions.
REVOKE ALL ON public.finance_accounts, public.finance_submissions, public.finance_payments,
  public.finance_ledger, public.finance_provider_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.finance_accounts, public.finance_submissions, public.finance_payments,
  public.finance_ledger, public.finance_provider_events TO authenticated, service_role;

-- ============== INTERNALS (not callable from the website) ==============
CREATE OR REPLACE FUNCTION public.finance_module_of(_entity_table text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _entity_table
    WHEN 'travel_trips' THEN 'travel'
    WHEN 'consult_requests' THEN 'consultancy'
    WHEN 'data_requests' THEN 'data'
    WHEN 'orders' THEN 'marketplace'
    WHEN 'subscriptions' THEN 'subscriptions'
    WHEN 'software_bookings' THEN 'software'
  END;
$$;

-- Unlocks writes to payments/submissions/accounts for this transaction
CREATE OR REPLACE FUNCTION public.finance_begin()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('isoko.finance_internal', 'on', true);
$$;

CREATE OR REPLACE FUNCTION public.finance_open_account(
  _entity_table text, _entity_id uuid, _currency text, _customer uuid, _label text
) RETURNS public.finance_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.finance_accounts;
  v_module text := public.finance_module_of(_entity_table);
BEGIN
  IF v_module IS NULL THEN
    RAISE EXCEPTION 'Not a billable record: %', _entity_table USING ERRCODE = '22023';
  END IF;
  PERFORM public.finance_begin();
  INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
  VALUES (v_module, _entity_table, _entity_id, _currency, _customer, coalesce(_label, ''))
  ON CONFLICT (entity_table, entity_id) DO NOTHING;
  SELECT * INTO v FROM public.finance_accounts
  WHERE entity_table = _entity_table AND entity_id = _entity_id FOR UPDATE;
  IF v.currency <> _currency THEN
    IF EXISTS (SELECT 1 FROM public.finance_ledger WHERE account_id = v.id)
       OR EXISTS (SELECT 1 FROM public.finance_submissions WHERE account_id = v.id) THEN
      RAISE EXCEPTION 'The currency can''t change once charges or payments are recorded' USING ERRCODE = '22023';
    END IF;
    UPDATE public.finance_accounts SET currency = _currency WHERE id = v.id RETURNING * INTO v;
  END IF;
  IF _customer IS NOT NULL AND v.customer_user_id IS NULL THEN
    UPDATE public.finance_accounts SET customer_user_id = _customer WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.finance_account_of(_entity_table text, _entity_id uuid)
RETURNS public.finance_accounts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.finance_accounts WHERE entity_table = _entity_table AND entity_id = _entity_id;
$$;

-- charged: the price (charges and price changes); paid: money received less
-- refunds; pending: reported or in-progress payments not yet verified;
-- balance: what the customer still owes (negative = Isoko owes them).
CREATE OR REPLACE FUNCTION public.finance_totals(_account uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'charged', coalesce((SELECT sum(amount) FROM public.finance_ledger WHERE account_id = _account
                          AND (kind = 'charge' OR (kind = 'adjustment' AND source = 'price'))), 0),
    'credits', coalesce((SELECT -sum(amount) FROM public.finance_ledger WHERE account_id = _account
                          AND (kind IN ('discount', 'waiver') OR (kind = 'adjustment' AND source <> 'price'))), 0),
    'paid', coalesce((SELECT sum(amount - refunded_amount) FROM public.finance_payments WHERE account_id = _account
                       AND status IN ('successful', 'partially_refunded', 'refunded')), 0),
    'refunded', coalesce((SELECT sum(refunded_amount) FROM public.finance_payments WHERE account_id = _account), 0),
    'pending', coalesce((SELECT sum(amount) FROM public.finance_submissions WHERE account_id = _account AND status = 'pending'), 0)
             + coalesce((SELECT sum(amount) FROM public.finance_payments WHERE account_id = _account
                          AND status IN ('pending', 'processing')), 0),
    'balance', coalesce((SELECT sum(amount) FROM public.finance_ledger WHERE account_id = _account), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.finance_totals_for(_entity_table text, _entity_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT public.finance_totals(id) || jsonb_build_object('currency', currency)
     FROM public.finance_accounts WHERE entity_table = _entity_table AND entity_id = _entity_id),
    '{"charged":0,"credits":0,"paid":0,"refunded":0,"pending":0,"balance":0}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.finance_post(
  _account public.finance_accounts, _kind text, _amount numeric, _source text, _description text,
  _payment uuid DEFAULT NULL, _reverses bigint DEFAULT NULL, _reason text DEFAULT NULL, _key text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, reason,
                                     payment_id, reverses_entry_id, idempotency_key, created_by)
  VALUES (_account.id, _kind, round(_amount, 2), _account.currency, _source, coalesce(_description, ''), _reason,
          _payment, _reverses, _key, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Brings the charged amount to the service's current price
CREATE OR REPLACE FUNCTION public.finance_set_price(_account public.finance_accounts, _total numeric, _description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_charged numeric := (public.finance_totals(_account.id) ->> 'charged')::numeric;
  v_diff numeric := round(coalesce(_total, 0), 2) - v_charged;
BEGIN
  IF v_diff = 0 THEN
    RETURN;
  END IF;
  IF v_charged = 0 AND v_diff > 0 AND NOT EXISTS (
    SELECT 1 FROM public.finance_ledger WHERE account_id = _account.id AND kind = 'charge'
  ) THEN
    PERFORM public.finance_post(_account, 'charge', v_diff, 'price', _description);
  ELSE
    PERFORM public.finance_post(_account, 'adjustment', v_diff, 'price',
      format('Price changed from %s to %s %s', v_charged, round(coalesce(_total, 0), 2), _account.currency));
  END IF;
  PERFORM public.finance_sync_entity(_account);
END $$;

-- Keeps the payment fields other screens read in step with the ledger
CREATE OR REPLACE FUNCTION public.finance_sync_entity(_account public.finance_accounts)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t jsonb := public.finance_totals(_account.id);
  v_charged numeric := (t ->> 'charged')::numeric;
  v_paid numeric := (t ->> 'paid')::numeric;
  v_balance numeric := (t ->> 'balance')::numeric;
  v_status text;
BEGIN
  PERFORM public.finance_begin();
  IF _account.entity_table = 'orders' THEN
    v_status := CASE
      WHEN v_paid > 0 AND v_balance <= 0 THEN 'paid'
      WHEN (t ->> 'pending')::numeric > 0 THEN 'awaiting_confirmation'
      WHEN v_paid = 0 AND (t ->> 'refunded')::numeric > 0 THEN 'refunded'
      ELSE 'unpaid' END;
    UPDATE public.orders
    SET payment_status = v_status,
        payment_confirmed_at = CASE WHEN v_status = 'paid' THEN coalesce(payment_confirmed_at, now()) ELSE NULL END
    WHERE id = _account.entity_id AND payment_status IS DISTINCT FROM v_status;
  ELSIF _account.entity_table = 'software_bookings' THEN
    UPDATE public.software_bookings
    SET deposit_paid = v_charged > 0 AND v_paid * 2 >= v_charged,
        deposit_paid_at = CASE WHEN v_charged > 0 AND v_paid * 2 >= v_charged THEN coalesce(deposit_paid_at, now()) END,
        final_paid = v_charged > 0 AND v_balance <= 0,
        final_paid_at = CASE WHEN v_charged > 0 AND v_balance <= 0 THEN coalesce(final_paid_at, now()) END
    WHERE id = _account.entity_id;
  END IF;
END $$;

-- A customer reports a payment. Checked against what is left to pay.
CREATE OR REPLACE FUNCTION public.finance_submit(
  _account public.finance_accounts, _amount numeric, _method text, _reference text, _via text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t jsonb;
  v_left numeric;
  v_ref text := btrim(coalesce(_reference, ''));
  v_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount you paid';
  END IF;
  IF _method NOT IN ('momo', 'bank', 'card', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how you paid';
  END IF;
  IF length(v_ref) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the payment reference or transaction ID';
  END IF;
  -- one at a time per account, so two reports can't both pass the check
  PERFORM 1 FROM public.finance_accounts WHERE id = _account.id FOR UPDATE;
  t := public.finance_totals(_account.id);
  v_left := (t ->> 'balance')::numeric - (t ->> 'pending')::numeric;
  IF NOT _account.allow_overpayment AND round(_amount, 2) > v_left THEN
    IF (t ->> 'balance')::numeric <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nothing is left to pay';
    ELSIF v_left <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The payments you reported already cover the balance. We are checking them.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = format('The amount is more than the %s %s left to pay', v_left, _account.currency);
  END IF;

  PERFORM public.finance_begin();
  BEGIN
    INSERT INTO public.finance_submissions (account_id, amount, currency, method, reference, via, submitted_by)
    VALUES (_account.id, round(_amount, 2), _account.currency, _method, v_ref, _via, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'This payment reference was already reported';
  END;
  PERFORM public.finance_sync_entity(_account);
  RETURN v_id;
END $$;

-- Money received: one payment row and its ledger entry
CREATE OR REPLACE FUNCTION public.finance_receive(
  _account public.finance_accounts, _amount numeric, _method text, _reference text, _provider text,
  _provider_txn text, _submission uuid, _key text, _metadata jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_begin();
  BEGIN
    INSERT INTO public.finance_payments (account_id, amount, currency, method, provider, provider_txn_id, reference,
      status, confirmed_at, submission_id, idempotency_key, created_by, confirmed_by, metadata)
    VALUES (_account.id, round(_amount, 2), _account.currency, _method, _provider, _provider_txn,
      coalesce(btrim(_reference), ''), 'successful', now(), _submission, _key, auth.uid(), auth.uid(), coalesce(_metadata, '{}'))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'A payment with this reference or transaction ID is already recorded';
  END;
  PERFORM public.finance_post(_account, 'payment', -round(_amount, 2), 'manual',
    format('Payment received (%s%s)', _method, CASE WHEN coalesce(_reference, '') <> '' THEN ' ' || btrim(_reference) ELSE '' END),
    v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.finance_require(_ok boolean, _what text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _ok IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = _what;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finance_reason(_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := nullif(btrim(coalesce(_reason, '')), '');
BEGIN
  IF v IS NULL OR length(v) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give a reason';
  END IF;
  IF length(v) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The reason is too long';
  END IF;
  PERFORM set_config('isoko.audit_reason', v, true);
  RETURN v;
END $$;

-- ============== STAFF: SEE AND HANDLE PAYMENTS ==============
-- Everything about one billable record, for the staff payment panel
CREATE OR REPLACE FUNCTION public.finance_account_summary(p_entity_table text, p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v_module text := public.finance_module_of(p_entity_table);
BEGIN
  PERFORM public.finance_require(v_module IS NOT NULL AND public.finance_can_collect(v_module),
    'You don''t have access to these payments');
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'totals', public.finance_totals_for(p_entity_table, p_entity_id),
      'can_reverse', public.finance_can_reverse(), 'submissions', '[]'::jsonb, 'payments', '[]'::jsonb, 'entries', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'exists', true,
    'account_id', a.id,
    'currency', a.currency,
    'allow_overpayment', a.allow_overpayment,
    'totals', public.finance_totals(a.id),
    'can_reverse', public.finance_can_reverse(),
    'submissions', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'legacy' ORDER BY s.created_at DESC)
                             FROM public.finance_submissions s WHERE s.account_id = a.id), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'legacy' - 'idempotency_key' ORDER BY p.created_at DESC)
                          FROM public.finance_payments p WHERE p.account_id = a.id), '[]'::jsonb),
    'entries', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'amount', l.amount,
                            'description', l.description, 'reason', l.reason, 'created_at', l.created_at) ORDER BY l.id)
                         FROM public.finance_ledger l WHERE l.account_id = a.id), '[]'::jsonb)
  );
END $$;

-- Payments customers reported that wait for a check, for one service
CREATE OR REPLACE FUNCTION public.finance_pending_submissions(p_module text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.finance_require(public.finance_can_collect(p_module), 'You don''t have access to these payments');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'amount', s.amount, 'currency', s.currency, 'method', s.method, 'reference', s.reference,
      'created_at', s.created_at, 'entity_table', a.entity_table, 'entity_id', a.entity_id, 'label', a.label,
      'balance', (public.finance_totals(a.id) ->> 'balance')::numeric) ORDER BY s.created_at)
    FROM public.finance_submissions s JOIN public.finance_accounts a ON a.id = s.account_id
    WHERE s.status = 'pending' AND a.module = p_module), '[]'::jsonb);
END $$;

-- The money arrived: the reported payment becomes a payment. p_amount is what
-- actually arrived when it differs from what the customer reported.
CREATE OR REPLACE FUNCTION public.finance_verify_submission(p_submission_id uuid, p_amount numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.finance_submissions;
  a public.finance_accounts;
  v_amount numeric;
  v_payment uuid;
BEGIN
  SELECT * INTO s FROM public.finance_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = s.account_id FOR UPDATE;
  PERFORM public.finance_require(public.finance_can_collect(a.module), 'You can''t confirm payments for this service');
  SELECT * INTO s FROM public.finance_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This payment was already ' || s.status;
  END IF;
  v_amount := round(coalesce(p_amount, s.amount), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount that arrived';
  END IF;
  IF NOT a.allow_overpayment AND v_amount > (public.finance_totals(a.id) ->> 'balance')::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format(
      'This is more than the %s %s balance. Confirm the amount up to the balance, or ask finance to allow overpayment.',
      (public.finance_totals(a.id) ->> 'balance')::numeric, a.currency);
  END IF;

  v_payment := public.finance_receive(a, v_amount, s.method, s.reference, 'manual', NULL, s.id, NULL,
    jsonb_build_object('reported_amount', s.amount));
  UPDATE public.finance_submissions
  SET status = 'verified', reviewed_by = auth.uid(), reviewed_at = now(), payment_id = v_payment,
      review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''),
                             CASE WHEN v_amount <> s.amount THEN format('%s arrived (reported %s)', v_amount, s.amount) END)
  WHERE id = s.id;
  PERFORM public.finance_sync_entity(a);
  RETURN v_payment;
END $$;

CREATE OR REPLACE FUNCTION public.finance_reject_submission(p_submission_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.finance_submissions;
  a public.finance_accounts;
  v_reason text;
BEGIN
  SELECT * INTO s FROM public.finance_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = s.account_id FOR UPDATE;
  PERFORM public.finance_require(public.finance_can_collect(a.module), 'You can''t review payments for this service');
  v_reason := public.finance_reason(p_reason);
  SELECT * INTO s FROM public.finance_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This payment was already ' || s.status;
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_submissions
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_reason
  WHERE id = s.id;
  PERFORM public.finance_sync_entity(a);
END $$;

-- Staff record money they received (e.g. cash at the office)
CREATE OR REPLACE FUNCTION public.finance_record_payment(
  p_entity_table text, p_entity_id uuid, p_amount numeric, p_method text, p_reference text,
  p_note text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v_existing public.finance_payments;
  v_payment uuid;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect(public.finance_module_of(p_entity_table)),
    'You can''t record payments for this service');
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price to pay yet';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.finance_payments WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.account_id <> a.id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This request key was already used for another payment';
      END IF;
      RETURN v_existing.id; -- a retry of the same request
    END IF;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount received';
  END IF;
  IF p_method NOT IN ('momo', 'bank', 'card', 'cash', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how it was paid';
  END IF;
  IF p_method IN ('momo', 'bank', 'card') AND length(btrim(coalesce(p_reference, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the transaction reference';
  END IF;
  IF length(coalesce(p_reference, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The reference is too long';
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  IF NOT a.allow_overpayment AND round(p_amount, 2) > (public.finance_totals(a.id) ->> 'balance')::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('This is more than the %s %s balance',
      (public.finance_totals(a.id) ->> 'balance')::numeric, a.currency);
  END IF;
  v_payment := public.finance_receive(a, p_amount, p_method, p_reference, 'manual', NULL, NULL, p_idempotency_key,
    CASE WHEN nullif(btrim(coalesce(p_note, '')), '') IS NOT NULL THEN jsonb_build_object('note', left(btrim(p_note), 500)) END);
  PERFORM public.finance_sync_entity(a);
  RETURN v_payment;
END $$;

-- ============== FINANCE: REFUND, VOID, DISCOUNT, WAIVE, ADJUST ==============
-- Money goes back to the customer (all or part of a payment)
CREATE OR REPLACE FUNCTION public.finance_refund_payment(
  p_payment_id uuid, p_amount numeric, p_reason text, p_idempotency_key text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.finance_payments;
  a public.finance_accounts;
  v_reason text;
  v_amount numeric := round(p_amount, 2);
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can refund payments');
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_ledger WHERE idempotency_key = p_idempotency_key AND payment_id = p_payment_id AND kind = 'refund'
  ) THEN
    RETURN; -- a retry of the same refund
  END IF;
  v_reason := public.finance_reason(p_reason);
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id FOR UPDATE;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id FOR UPDATE;
  IF p.status NOT IN ('successful', 'partially_refunded') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only received payments can be refunded';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > p.amount - p.refunded_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = format('Refund between 0 and %s %s', p.amount - p.refunded_amount, p.currency);
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments
  SET refunded_amount = refunded_amount + v_amount,
      status = CASE WHEN refunded_amount + v_amount = amount THEN 'refunded' ELSE 'partially_refunded' END,
      refunded_at = now()
  WHERE id = p.id;
  PERFORM public.finance_post(a, 'refund', v_amount, 'manual', 'Refund', p.id, NULL, v_reason, p_idempotency_key);
  PERFORM public.finance_sync_entity(a);
END $$;

-- A payment recorded by mistake (the money never arrived). Not a refund.
CREATE OR REPLACE FUNCTION public.finance_void_payment(p_payment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.finance_payments;
  a public.finance_accounts;
  v_reason text;
  v_entry public.finance_ledger;
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can void payments');
  v_reason := public.finance_reason(p_reason);
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id FOR UPDATE;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id FOR UPDATE;
  IF p.status <> 'successful' OR p.refunded_amount > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only a received payment with no refunds can be voided';
  END IF;
  SELECT * INTO v_entry FROM public.finance_ledger WHERE payment_id = p.id AND kind = 'payment' ORDER BY id LIMIT 1;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments SET status = 'voided', voided_at = now() WHERE id = p.id;
  PERFORM public.finance_post(a, 'void', -v_entry.amount, 'manual', 'Payment voided', p.id, v_entry.id, v_reason);
  PERFORM public.finance_sync_entity(a);
END $$;

-- discount / waiver: the customer owes less (p_amount > 0).
-- adjustment: a correction either way (p_amount > 0 owes more, < 0 owes less).
CREATE OR REPLACE FUNCTION public.finance_adjust(
  p_entity_table text, p_entity_id uuid, p_kind text, p_amount numeric, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v_reason text;
  v_amount numeric := round(p_amount, 2);
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can change what a customer owes');
  v_reason := public.finance_reason(p_reason);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price to adjust yet';
  END IF;
  IF p_kind NOT IN ('discount', 'waiver', 'adjustment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown kind of change';
  END IF;
  IF v_amount IS NULL OR v_amount = 0 OR (p_kind <> 'adjustment' AND v_amount < 0) OR abs(v_amount) > 1000000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount';
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  PERFORM public.finance_post(a, p_kind, CASE WHEN p_kind = 'adjustment' THEN v_amount ELSE -v_amount END,
    'manual', initcap(p_kind), NULL, NULL, v_reason);
  PERFORM public.finance_sync_entity(a);
END $$;

-- Lets an account take more than it owes (the extra becomes a credit)
CREATE OR REPLACE FUNCTION public.finance_set_overpayment(p_entity_table text, p_entity_id uuid, p_allow boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
BEGIN
  PERFORM public.finance_require(public.finance_can_reverse(), 'Only finance staff can allow overpayment');
  PERFORM public.finance_reason(p_reason);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price yet';
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_accounts SET allow_overpayment = coalesce(p_allow, false) WHERE id = a.id;
END $$;

-- ============== PAYMENT PROVIDERS (service role only) ==============
-- The payments-webhook Edge Function starts provider payments here...
CREATE OR REPLACE FUNCTION public.finance_create_intent(
  p_entity_table text, p_entity_id uuid, p_amount numeric, p_method text, p_provider text, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of(p_entity_table, p_entity_id);
  v public.finance_payments;
  t jsonb;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  IF coalesce(p_idempotency_key, '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An idempotency key is required';
  END IF;
  SELECT * INTO v FROM public.finance_payments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v.id;
  END IF;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no price to pay yet';
  END IF;
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  t := public.finance_totals(a.id);
  IF p_amount IS NULL OR p_amount <= 0
     OR (NOT a.allow_overpayment AND round(p_amount, 2) > (t ->> 'balance')::numeric - (t ->> 'pending')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The amount is more than what is left to pay';
  END IF;
  PERFORM public.finance_begin();
  INSERT INTO public.finance_payments (account_id, amount, currency, method, provider, status, idempotency_key)
  VALUES (a.id, round(p_amount, 2), a.currency, p_method, p_provider, 'pending', p_idempotency_key)
  RETURNING * INTO v;
  RETURN v.id;
END $$;

-- ... and applies what the provider reports. The same event twice does nothing.
CREATE OR REPLACE FUNCTION public.finance_apply_provider_event(
  p_provider text, p_event_id text, p_payment_id uuid, p_provider_txn_id text, p_status text,
  p_amount numeric, p_currency text, p_failure_reason text, p_payload jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.finance_payments;
  a public.finance_accounts;
  v_event uuid;
  v_outcome text;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  PERFORM public.finance_begin();
  INSERT INTO public.finance_provider_events (provider, event_id, payment_id, payload)
  VALUES (p_provider, p_event_id, p_payment_id, coalesce(p_payload, '{}'))
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_event;
  IF v_event IS NULL THEN
    RETURN 'duplicate';
  END IF;

  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id;
  IF NOT FOUND OR p.provider <> p_provider THEN
    v_outcome := 'unknown_payment';
  ELSE
    SELECT * INTO a FROM public.finance_accounts WHERE id = p.account_id FOR UPDATE;
    SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id FOR UPDATE;
    IF p_status = 'successful' AND (p_amount IS DISTINCT FROM p.amount OR p_currency IS DISTINCT FROM p.currency) THEN
      v_outcome := 'needs_review'; -- money moved, but not what was asked: finance checks it
    ELSIF p.status IN ('successful', 'partially_refunded', 'refunded', 'voided', 'failed', 'cancelled') THEN
      v_outcome := CASE WHEN p.status = p_status THEN 'already_applied' ELSE 'ignored_final_state' END;
    ELSIF p_status = 'successful' THEN
      BEGIN
        UPDATE public.finance_payments
        SET status = 'successful', confirmed_at = now(), provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id)
        WHERE id = p.id;
      EXCEPTION WHEN unique_violation THEN
        -- this provider transaction is already recorded on another payment
        UPDATE public.finance_provider_events SET outcome = 'duplicate_transaction' WHERE id = v_event;
        RETURN 'duplicate_transaction';
      END;
      -- Money that arrived is always recorded; beyond the balance it becomes a credit
      PERFORM public.finance_post(a, 'payment', -p.amount, 'provider',
        format('Payment received (%s %s)', p_provider, coalesce(p_provider_txn_id, '')), p.id);
      PERFORM public.finance_sync_entity(a);
      v_outcome := 'applied';
    ELSIF p_status IN ('processing', 'failed', 'cancelled') THEN
      UPDATE public.finance_payments
      SET status = p_status,
          failed_at = CASE WHEN p_status = 'failed' THEN now() END,
          failure_reason = CASE WHEN p_status IN ('failed', 'cancelled') THEN left(p_failure_reason, 500) END,
          provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id)
      WHERE id = p.id;
      PERFORM public.finance_sync_entity(a);
      v_outcome := 'applied';
    ELSE
      v_outcome := 'ignored_status';
    END IF;
  END IF;
  UPDATE public.finance_provider_events SET outcome = v_outcome WHERE id = v_event;
  RETURN v_outcome;
END $$;

-- ============== PRICES BECOME CHARGES ==============
CREATE OR REPLACE FUNCTION public.finance_price_from_travel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'completed') AND NEW.quote_total IS NOT NULL THEN
    PERFORM public.finance_set_price(
      public.finance_open_account('travel_trips', NEW.id, NEW.currency, NEW.user_id, NEW.reference || ' · ' || NEW.customer_name),
      NEW.quote_total, 'Trip ' || NEW.reference);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER finance_price AFTER INSERT OR UPDATE OF status, quote_total, currency ON public.travel_trips
  FOR EACH ROW EXECUTE FUNCTION public.finance_price_from_travel();

CREATE OR REPLACE FUNCTION public.finance_price_from_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT * INTO r FROM public.consult_requests WHERE id = NEW.request_id;
    PERFORM public.finance_set_price(
      public.finance_open_account('consult_requests', r.id, NEW.currency, r.user_id, r.reference || ' · ' || r.client_name),
      NEW.fee, NEW.service_title);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER finance_price AFTER INSERT OR UPDATE OF status, fee, currency ON public.consult_proposals
  FOR EACH ROW EXECUTE FUNCTION public.finance_price_from_proposal();

CREATE OR REPLACE FUNCTION public.finance_price_from_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fee IS NOT NULL OR (public.finance_account_of('data_requests', NEW.id)).id IS NOT NULL THEN
    PERFORM public.finance_set_price(
      public.finance_open_account('data_requests', NEW.id, NEW.currency, NEW.user_id, NEW.reference || ' · ' || NEW.client_name),
      coalesce(NEW.fee, 0), NEW.service_name);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER finance_price AFTER INSERT OR UPDATE OF fee, currency ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.finance_price_from_data();

CREATE OR REPLACE FUNCTION public.finance_price_from_software()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agreed_price IS NOT NULL OR (public.finance_account_of('software_bookings', NEW.id)).id IS NOT NULL THEN
    PERFORM public.finance_set_price(
      public.finance_open_account('software_bookings', NEW.id, 'RWF', NEW.user_id, NEW.full_name || ' · ' || NEW.service_type),
      coalesce(NEW.agreed_price, 0), 'Software project: ' || NEW.service_type);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER finance_price AFTER INSERT OR UPDATE OF agreed_price ON public.software_bookings
  FOR EACH ROW EXECUTE FUNCTION public.finance_price_from_software();

-- An order is charged when placed; the reference given at checkout is the
-- buyer's payment report.
CREATE OR REPLACE FUNCTION public.finance_charge_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.finance_accounts;
BEGIN
  a := public.finance_open_account('orders', NEW.id, 'RWF', NEW.buyer_id, 'Order ' || left(NEW.id::text, 8));
  PERFORM public.finance_set_price(a, NEW.total_amount, 'Marketplace order');
  IF length(btrim(coalesce(NEW.payment_reference, ''))) >= 3 AND NEW.payment_method IN ('momo', 'bank', 'card') THEN
    PERFORM public.finance_submit(a, NEW.total_amount, NEW.payment_method, NEW.payment_reference, 'checkout');
  END IF;
  RETURN NULL;
END $$;

-- ============== COPY THE EXISTING PAYMENT HISTORY ==============
-- As it was (no amount checks): charges for prices already agreed, confirmed
-- payments as payments, pending ones as reports waiting for a check.
SELECT public.finance_begin();

INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
SELECT 'travel', 'travel_trips', t.id, t.currency, t.user_id, t.reference || ' · ' || t.customer_name
FROM public.travel_trips t
WHERE (t.status IN ('confirmed', 'completed') AND t.quote_total IS NOT NULL)
   OR EXISTS (SELECT 1 FROM public.travel_payments p WHERE p.trip_id = t.id);
INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
SELECT 'consultancy', 'consult_requests', r.id,
       coalesce((SELECT currency FROM public.consult_proposals WHERE request_id = r.id AND status = 'accepted'
                 ORDER BY responded_at DESC NULLS LAST LIMIT 1), 'USD'),
       r.user_id, r.reference || ' · ' || r.client_name
FROM public.consult_requests r
WHERE EXISTS (SELECT 1 FROM public.consult_proposals WHERE request_id = r.id AND status = 'accepted')
   OR EXISTS (SELECT 1 FROM public.consult_payments p WHERE p.request_id = r.id);
INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
SELECT 'data', 'data_requests', r.id, r.currency, r.user_id, r.reference || ' · ' || r.client_name
FROM public.data_requests r
WHERE r.fee IS NOT NULL OR EXISTS (SELECT 1 FROM public.data_payments p WHERE p.request_id = r.id);
INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
SELECT 'marketplace', 'orders', o.id, 'RWF', o.buyer_id, 'Order ' || left(o.id::text, 8) FROM public.orders o;
INSERT INTO public.finance_accounts (module, entity_table, entity_id, currency, customer_user_id, label)
SELECT 'software', 'software_bookings', b.id, 'RWF', b.user_id, b.full_name || ' · ' || b.service_type
FROM public.software_bookings b WHERE b.agreed_price IS NOT NULL AND b.agreed_price > 0;

-- charges
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description)
SELECT a.id, 'charge', t.quote_total, a.currency, 'price', 'Trip ' || t.reference
FROM public.travel_trips t JOIN public.finance_accounts a ON a.entity_table = 'travel_trips' AND a.entity_id = t.id
WHERE t.status IN ('confirmed', 'completed') AND t.quote_total > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description)
SELECT a.id, 'charge', pr.fee, a.currency, 'price', pr.service_title
FROM public.finance_accounts a
JOIN LATERAL (SELECT * FROM public.consult_proposals WHERE request_id = a.entity_id AND status = 'accepted'
              ORDER BY responded_at DESC NULLS LAST LIMIT 1) pr ON true
WHERE a.entity_table = 'consult_requests' AND pr.fee > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description)
SELECT a.id, 'charge', r.fee, a.currency, 'price', r.service_name
FROM public.data_requests r JOIN public.finance_accounts a ON a.entity_table = 'data_requests' AND a.entity_id = r.id
WHERE r.fee > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description)
SELECT a.id, 'charge', o.total_amount, 'RWF', 'price', 'Marketplace order'
FROM public.orders o JOIN public.finance_accounts a ON a.entity_table = 'orders' AND a.entity_id = o.id
WHERE o.total_amount > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description)
SELECT a.id, 'charge', b.agreed_price, 'RWF', 'price', 'Software project: ' || b.service_type
FROM public.software_bookings b JOIN public.finance_accounts a ON a.entity_table = 'software_bookings' AND a.entity_id = b.id;

-- the old travel / consultancy / data payments
CREATE TEMP TABLE legacy_payments ON COMMIT DROP AS
SELECT 'travel_trips'::text AS entity_table, trip_id AS entity_id, * FROM public.travel_payments
UNION ALL SELECT 'consult_requests', request_id, * FROM public.consult_payments
UNION ALL SELECT 'data_requests', request_id, * FROM public.data_payments;
ALTER TABLE legacy_payments DROP COLUMN trip_id;

INSERT INTO public.finance_payments (id, account_id, amount, currency, method, reference, status, initiated_at,
  confirmed_at, created_by, confirmed_by, legacy, metadata)
SELECT l.id, a.id, l.amount, a.currency, l.method, l.reference, 'successful', l.created_at,
       coalesce(l.confirmed_at, l.created_at), l.confirmed_by, l.confirmed_by, true,
       jsonb_build_object('copied_from', l.entity_table, 'from_customer', l.from_customer)
FROM legacy_payments l JOIN public.finance_accounts a ON a.entity_table = l.entity_table AND a.entity_id = l.entity_id
WHERE l.status = 'confirmed';
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, payment_id, created_at)
SELECT p.account_id, 'payment', -p.amount, p.currency, 'legacy', format('Payment received (%s %s)', p.method, p.reference), p.id, p.confirmed_at
FROM public.finance_payments p WHERE p.legacy;
INSERT INTO public.finance_submissions (id, account_id, amount, currency, method, reference, status, via,
  reviewed_by, reviewed_at, legacy, created_at)
SELECT l.id, a.id, l.amount, a.currency,
       CASE WHEN l.method IN ('momo', 'bank', 'card') THEN l.method ELSE 'other' END,
       CASE WHEN length(btrim(l.reference)) >= 3 THEN left(btrim(l.reference), 100) ELSE 'not given' END,
       CASE l.status WHEN 'pending' THEN 'pending' ELSE 'rejected' END, 'portal',
       l.confirmed_by, l.confirmed_at, true, l.created_at
FROM legacy_payments l JOIN public.finance_accounts a ON a.entity_table = l.entity_table AND a.entity_id = l.entity_id
WHERE l.status IN ('pending', 'rejected');

-- marketplace orders: paid, or waiting for the admin to check the reference
INSERT INTO public.finance_payments (account_id, amount, currency, method, reference, status, confirmed_at, legacy, metadata)
SELECT a.id, o.total_amount, 'RWF', CASE WHEN o.payment_method IN ('momo', 'bank', 'card', 'cash') THEN o.payment_method ELSE 'other' END,
       coalesce(o.payment_reference, ''), 'successful',
       coalesce(o.payment_confirmed_at, o.updated_at), true, '{"copied_from":"orders"}'
FROM public.orders o JOIN public.finance_accounts a ON a.entity_table = 'orders' AND a.entity_id = o.id
WHERE o.payment_status = 'paid' AND o.total_amount > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, payment_id, created_at)
SELECT p.account_id, 'payment', -p.amount, 'RWF', 'legacy', 'Payment received (' || p.method || ')', p.id, p.confirmed_at
FROM public.finance_payments p WHERE p.legacy AND p.metadata ->> 'copied_from' = 'orders';
INSERT INTO public.finance_submissions (account_id, amount, currency, method, reference, via, legacy, created_at)
SELECT a.id, o.total_amount, 'RWF',
       CASE WHEN o.payment_method IN ('momo', 'bank', 'card') THEN o.payment_method ELSE 'other' END,
       CASE WHEN length(btrim(coalesce(o.payment_reference, ''))) >= 3 THEN left(btrim(o.payment_reference), 100) ELSE 'not given' END,
       'checkout', true, o.created_at
FROM public.orders o JOIN public.finance_accounts a ON a.entity_table = 'orders' AND a.entity_id = o.id
WHERE o.payment_status = 'awaiting_confirmation' AND o.total_amount > 0;

-- software: the 50% deposit and final payment were only flags
INSERT INTO public.finance_payments (account_id, amount, currency, method, status, confirmed_at, legacy, metadata)
SELECT a.id, ceil(b.agreed_price / 2.0), 'RWF', 'other', 'successful', coalesce(b.deposit_paid_at, b.updated_at), true,
       '{"copied_from":"software_bookings.deposit_paid"}'
FROM public.software_bookings b JOIN public.finance_accounts a ON a.entity_table = 'software_bookings' AND a.entity_id = b.id
WHERE b.deposit_paid;
INSERT INTO public.finance_payments (account_id, amount, currency, method, status, confirmed_at, legacy, metadata)
SELECT a.id, b.agreed_price - CASE WHEN b.deposit_paid THEN ceil(b.agreed_price / 2.0) ELSE 0 END, 'RWF', 'other', 'successful',
       coalesce(b.final_paid_at, b.updated_at), true, '{"copied_from":"software_bookings.final_paid"}'
FROM public.software_bookings b JOIN public.finance_accounts a ON a.entity_table = 'software_bookings' AND a.entity_id = b.id
WHERE b.final_paid AND b.agreed_price - CASE WHEN b.deposit_paid THEN ceil(b.agreed_price / 2.0) ELSE 0 END > 0;
INSERT INTO public.finance_ledger (account_id, kind, amount, currency, source, description, payment_id, created_at)
SELECT p.account_id, 'payment', -p.amount, 'RWF', 'legacy', 'Payment received', p.id, p.confirmed_at
FROM public.finance_payments p WHERE p.legacy AND p.metadata ->> 'copied_from' LIKE 'software_bookings.%';

SELECT set_config('isoko.finance_internal', '', true);

-- From now on (after the copy, so the copy isn't charged twice)
CREATE TRIGGER finance_charge AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.finance_charge_order();

-- The old payment tables are history now: staff read them, nobody writes.
DROP POLICY IF EXISTS "Travel staff manage payments" ON public.travel_payments;
DROP POLICY IF EXISTS "Consultancy staff manage payments" ON public.consult_payments;
DROP POLICY IF EXISTS "Analysts manage data payments" ON public.data_payments;
CREATE POLICY "Travel staff read old payments" ON public.travel_payments FOR SELECT TO authenticated
  USING (public.is_service_staff('travel'));
CREATE POLICY "Consultancy staff read old payments" ON public.consult_payments FOR SELECT TO authenticated
  USING (public.is_service_staff('consultancy'));
CREATE POLICY "Analysts read old payments" ON public.data_payments FOR SELECT TO authenticated
  USING (public.is_service_staff('data'));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.travel_payments, public.consult_payments, public.data_payments
  FROM anon, authenticated;

-- ============== CUSTOMER-FACING FUNCTIONS, NOW ON THE ENGINE ==============
CREATE OR REPLACE FUNCTION public.travel_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.travel_trips := public.travel_trip_by_token(p_token);
  a public.finance_accounts := public.finance_account_of('travel_trips', t.id);
BEGIN
  IF t.status NOT IN ('confirmed', 'completed') OR a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payments open once you accept the trip';
  END IF;
  PERFORM public.finance_submit(a, p_amount, p_method, p_reference, 'portal');
END $$;

CREATE OR REPLACE FUNCTION public.consult_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.consult_requests := public.consult_request_by_token(p_token);
  a public.finance_accounts := public.finance_account_of('consult_requests', r.id);
BEGIN
  IF r.status NOT IN ('approved', 'in_progress', 'completed') OR a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payments open once you accept the proposal';
  END IF;
  PERFORM public.finance_submit(a, p_amount, p_method, p_reference, 'portal');
END $$;

CREATE OR REPLACE FUNCTION public.data_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.data_requests := public.data_request_by_token(p_token);
  a public.finance_accounts := public.finance_account_of('data_requests', r.id);
BEGIN
  IF r.fee IS NULL OR r.status = 'cancelled' OR a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Isoko will share the price before you pay';
  END IF;
  PERFORM public.finance_submit(a, p_amount, p_method, p_reference, 'portal');
END $$;

-- Customer views: paid / pending / balance now come from the engine
CREATE OR REPLACE FUNCTION public.finance_customer_payments(_entity_table text, _entity_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.at), '[]'::jsonb) FROM (
    SELECT s.created_at AS at, jsonb_build_object('amount', s.amount, 'method', s.method, 'status', 'pending', 'created_at', s.created_at) AS item
    FROM public.finance_submissions s JOIN public.finance_accounts a ON a.id = s.account_id
    WHERE a.entity_table = _entity_table AND a.entity_id = _entity_id AND s.status = 'pending'
    UNION ALL
    SELECT p.created_at, jsonb_build_object('amount', p.amount, 'method', p.method,
      'status', CASE p.status WHEN 'successful' THEN 'confirmed' ELSE p.status END,
      'refunded_amount', p.refunded_amount, 'created_at', p.created_at)
    FROM public.finance_payments p JOIN public.finance_accounts a ON a.id = p.account_id
    WHERE a.entity_table = _entity_table AND a.entity_id = _entity_id
      AND p.status IN ('successful', 'partially_refunded', 'refunded')
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.travel_trip_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reference', t.reference,
    'destination', t.destination,
    'travelling_from', t.travelling_from,
    'arrival_date', t.arrival_date,
    'departure_date', t.departure_date,
    'travelers', t.travelers,
    'needs', to_jsonb(t.needs),
    'customer_name', t.customer_name,
    'status', t.status,
    'currency', t.currency,
    'quote_total', CASE WHEN t.status IN ('quoted', 'changes_requested', 'confirmed', 'completed') THEN t.quote_total END,
    'quote_sent_at', t.quote_sent_at,
    'accepted_at', t.accepted_at,
    'change_request', t.change_request,
    'change_requested_at', t.change_requested_at,
    'today', current_date,
    'items', CASE WHEN t.status IN ('quoted', 'changes_requested', 'confirmed', 'completed') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'section', i.section, 'title', i.title, 'details', i.details, 'location', i.location,
        'start_date', i.start_date, 'end_date', i.end_date, 'start_time', i.start_time, 'pickup_time', i.pickup_time,
        'driver_name', i.driver_name,
        'driver_phone', CASE WHEN t.status = 'confirmed' THEN i.driver_phone END,
        'status', i.status
      ) ORDER BY array_position(ARRAY['arrival','hotel','transport','experience','departure'], i.section),
                 i.start_date NULLS LAST, i.start_time NULLS LAST, i.created_at)
      FROM public.travel_items i WHERE i.trip_id = t.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'paid', (f ->> 'paid')::numeric,
    'pending_payment', (f ->> 'pending')::numeric,
    'balance', (f ->> 'balance')::numeric,
    'payments', public.finance_customer_payments('travel_trips', t.id),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'label', d.label, 'status', d.status) ORDER BY d.created_at)
      FROM public.travel_documents d WHERE d.trip_id = t.id), '[]'::jsonb)
  )
  FROM public.travel_trips t, LATERAL public.finance_totals_for('travel_trips', t.id) f
  WHERE t.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.consult_request_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reference', r.reference,
    'service_name', r.service_name,
    'description', r.description,
    'client_name', r.client_name,
    'organization', r.organization,
    'status', r.status,
    'start_date', r.start_date,
    'expected_completion', r.expected_completion,
    'consultant', (SELECT full_name FROM public.profiles WHERE user_id = r.assigned_to),
    'change_request', r.change_request,
    'created_at', r.created_at,
    'proposal', (
      SELECT jsonb_build_object('service_title', pr.service_title, 'scope', to_jsonb(pr.scope), 'fee', pr.fee,
                                'currency', pr.currency, 'timeline', pr.timeline, 'status', pr.status, 'sent_at', pr.sent_at)
      FROM public.consult_proposals pr
      WHERE pr.request_id = r.id AND pr.status IN ('sent', 'accepted', 'declined')
      ORDER BY pr.created_at DESC LIMIT 1),
    'tasks_total', (SELECT count(*) FROM public.consult_tasks WHERE request_id = r.id),
    'tasks_done', (SELECT count(*) FROM public.consult_tasks WHERE request_id = r.id AND done),
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'kind', f.kind,
                                          'path', CASE WHEN f.kind = 'client' THEN f.path ELSE f.shared_path END,
                                          'created_at', coalesce(f.shared_at, f.created_at)) ORDER BY f.created_at)
      FROM public.consult_files f
      WHERE f.request_id = r.id AND (f.kind = 'client' OR f.shared_path IS NOT NULL)), '[]'::jsonb),
    'paid', (fin ->> 'paid')::numeric,
    'pending_payment', (fin ->> 'pending')::numeric,
    'balance', (fin ->> 'balance')::numeric
  )
  FROM public.consult_requests r, LATERAL public.finance_totals_for('consult_requests', r.id) fin
  WHERE r.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.data_request_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reference', r.reference,
    'service_name', r.service_name,
    'description', r.description,
    'client_name', r.client_name,
    'organization', r.organization,
    'status', r.status,
    'data_later', r.data_later,
    'deadline', r.deadline,
    'fee', r.fee,
    'currency', r.currency,
    'analyst', (SELECT full_name FROM public.profiles WHERE user_id = r.assigned_to),
    'client_feedback', r.client_feedback,
    'created_at', r.created_at,
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path, 'created_at', f.created_at) ORDER BY f.created_at)
      FROM public.data_files f WHERE f.request_id = r.id AND f.from_client), '[]'::jsonb),
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'description', d.description,
                                          'status', d.status, 'completed_at', d.completed_at,
                                          'path', d.shared_path, 'file_name', d.file_name) ORDER BY d.created_at)
      FROM public.data_deliverables d WHERE d.request_id = r.id), '[]'::jsonb),
    'paid', (fin ->> 'paid')::numeric,
    'pending_payment', (fin ->> 'pending')::numeric,
    'balance', (fin ->> 'balance')::numeric
  )
  FROM public.data_requests r, LATERAL public.finance_totals_for('data_requests', r.id) fin
  WHERE r.access_token = p_token;
$$;

-- ============== MARKETPLACE, SUBSCRIPTIONS, SOFTWARE ==============
-- Finance staff see the orders and subscriptions whose payments they check
CREATE POLICY "Finance staff view orders" ON public.orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));
CREATE POLICY "Finance staff view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'finance'));

-- The admin checked the buyer's reference: the order's report becomes a payment
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_submission uuid;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect('marketplace'), 'Only finance staff can confirm order payments');
  SELECT s.id INTO v_submission
  FROM public.finance_submissions s JOIN public.finance_accounts a ON a.id = s.account_id
  WHERE a.entity_table = 'orders' AND a.entity_id = p_order_id AND s.status = 'pending'
  ORDER BY s.created_at LIMIT 1;
  IF v_submission IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No payment was reported for this order';
  END IF;
  PERFORM public.finance_verify_submission(v_submission);
  UPDATE public.orders SET status = 'processing' WHERE id = p_order_id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.submit_subscription_payment(p_reference text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  a public.finance_accounts;
  t jsonb;
  v_admin record;
BEGIN
  IF coalesce(trim(p_reference), '') = '' THEN
    RAISE EXCEPTION 'Payment reference required';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Start your free trial first';
  END IF;

  a := public.finance_open_account('subscriptions', v_sub.id, 'RWF', v_sub.user_id, 'Subscription ' || v_sub.plan);
  t := public.finance_totals(a.id);
  IF (t ->> 'pending')::numeric > 0 THEN
    RAISE EXCEPTION 'Your last payment is still being checked';
  END IF;
  -- One period at a time: charge it if nothing is owed yet
  IF (t ->> 'balance')::numeric <= 0 THEN
    PERFORM public.finance_post(a, 'charge', v_sub.amount, 'price', 'Subscription: 30 days (' || v_sub.plan || ')');
  END IF;
  PERFORM public.finance_submit(a, (public.finance_totals(a.id) ->> 'balance')::numeric, 'momo', p_reference, 'account');

  UPDATE public.subscriptions
  SET payment_reference = trim(p_reference), payment_submitted_at = now()
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;

  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'finance') LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_admin.user_id, 'Subscription payment submitted', 'Reference: ' || trim(p_reference), 'warning', '/admin');
  END LOOP;
  RETURN v_sub;
END $$;

CREATE OR REPLACE FUNCTION public.activate_subscription(p_subscription_id uuid)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_submission uuid;
BEGIN
  IF NOT public.finance_can_collect('subscriptions') THEN
    RAISE EXCEPTION 'Only admins can activate subscriptions' USING ERRCODE = '42501';
  END IF;
  -- the reported payment, if any, becomes a payment
  SELECT s.id INTO v_submission
  FROM public.finance_submissions s JOIN public.finance_accounts a ON a.id = s.account_id
  WHERE a.entity_table = 'subscriptions' AND a.entity_id = p_subscription_id AND s.status = 'pending'
  ORDER BY s.created_at LIMIT 1;
  IF v_submission IS NOT NULL THEN
    PERFORM public.finance_verify_submission(v_submission);
  END IF;

  UPDATE public.subscriptions
  SET status = 'active',
      starts_at = now(),
      -- renewing early adds 30 days on top of the time left
      expires_at = CASE WHEN status = 'active' AND expires_at > now()
                        THEN expires_at ELSE now() END + interval '30 days',
      payment_submitted_at = NULL
  WHERE id = p_subscription_id
  RETURNING * INTO v_sub;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    v_sub.user_id, 'Subscription active',
    'Your payment was confirmed. You have 30 days of full access.',
    'success', '/subscription'
  );
  RETURN v_sub;
END $$;

-- Software: the 50% deposit, then the rest. Amounts come from the agreed price.
CREATE OR REPLACE FUNCTION public.software_record_installment(p_booking_id uuid, p_part text, p_method text, p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts := public.finance_account_of('software_bookings', p_booking_id);
  t jsonb;
  v_amount numeric;
BEGIN
  PERFORM public.finance_require(public.finance_can_collect('software'), 'Only finance staff can record software payments');
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Set the agreed price first';
  END IF;
  t := public.finance_totals(a.id);
  v_amount := CASE p_part
    WHEN 'deposit' THEN ceil((t ->> 'charged')::numeric / 2) - (t ->> 'paid')::numeric
    WHEN 'final' THEN (t ->> 'balance')::numeric
  END;
  IF v_amount IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose the deposit or the final payment';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nothing is left to pay for this part';
  END IF;
  RETURN public.finance_record_payment('software_bookings', p_booking_id, v_amount, coalesce(p_method, 'other'), p_reference);
END $$;

-- Payment fields shown on orders and software bookings follow the ledger;
-- nobody sets them directly any more, admins included.
CREATE OR REPLACE FUNCTION public.finance_derived_columns_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (current_user IN ('anon', 'authenticated', 'service_role')
      OR current_setting('isoko.finance_internal', true) IS DISTINCT FROM 'on')
     AND (to_jsonb(NEW) - (SELECT coalesce(array_agg(k), '{}') FROM jsonb_object_keys(to_jsonb(NEW)) k WHERE k <> ALL (TG_ARGV)))
         IS DISTINCT FROM
         (to_jsonb(OLD) - (SELECT coalesce(array_agg(k), '{}') FROM jsonb_object_keys(to_jsonb(OLD)) k WHERE k <> ALL (TG_ARGV))) THEN
    RAISE EXCEPTION 'Payment status follows the recorded payments. Confirm, record or refund a payment instead.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_payment_fields BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.finance_derived_columns_guard('payment_status', 'payment_confirmed_at');
CREATE TRIGGER software_bookings_payment_fields BEFORE UPDATE ON public.software_bookings
  FOR EACH ROW EXECUTE FUNCTION public.finance_derived_columns_guard('deposit_paid', 'deposit_paid_at', 'final_paid', 'final_paid_at');

-- ============== FUNCTION PERMISSIONS ==============
DO $$
DECLARE f text;
BEGIN
  -- internals: nobody from the website
  FOREACH f IN ARRAY ARRAY[
    'finance_guard()', 'finance_begin()',
    'finance_open_account(text, uuid, text, uuid, text)', 'finance_account_of(text, uuid)',
    'finance_totals(uuid)', 'finance_totals_for(text, uuid)', 'finance_customer_payments(text, uuid)',
    'finance_post(public.finance_accounts, text, numeric, text, text, uuid, bigint, text, text)',
    'finance_set_price(public.finance_accounts, numeric, text)', 'finance_sync_entity(public.finance_accounts)',
    'finance_submit(public.finance_accounts, numeric, text, text, text)',
    'finance_receive(public.finance_accounts, numeric, text, text, text, text, uuid, text, jsonb)',
    'finance_require(boolean, text)', 'finance_reason(text)', 'finance_derived_columns_guard()',
    'finance_price_from_travel()', 'finance_price_from_proposal()', 'finance_price_from_data()',
    'finance_price_from_software()', 'finance_charge_order()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- staff and finance (each checks the caller's role itself)
  FOREACH f IN ARRAY ARRAY[
    'finance_can_collect(text)', 'finance_can_reverse()', 'finance_account_visible(uuid)',
    'finance_account_summary(text, uuid)', 'finance_pending_submissions(text)',
    'finance_verify_submission(uuid, numeric, text)', 'finance_reject_submission(uuid, text)',
    'finance_record_payment(text, uuid, numeric, text, text, text, text)',
    'finance_refund_payment(uuid, numeric, text, text)', 'finance_void_payment(uuid, text)',
    'finance_adjust(text, uuid, text, numeric, text)', 'finance_set_overpayment(text, uuid, boolean, text)',
    'confirm_order_payment(uuid)', 'software_record_installment(uuid, text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  -- payment providers: the payments-webhook Edge Function
  FOREACH f IN ARRAY ARRAY[
    'finance_create_intent(text, uuid, numeric, text, text, text)',
    'finance_apply_provider_event(text, text, uuid, text, text, numeric, text, text, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

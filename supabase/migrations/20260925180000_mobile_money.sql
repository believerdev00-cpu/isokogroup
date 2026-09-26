-- Paying from the phone: MTN Mobile Money, Airtel Money and SPENN through ItecPay
-- (docs/ITECPAY_INTEGRATION.md)
--
--   1. The customer asks to pay (mobile_money_start): the same checks as the
--      rest of the site (their own record when signed in, or the private
--      link's token), the amount checked against what is left to pay, one
--      attempt waiting at a time. A pending payment is recorded; nothing is
--      paid yet.
--   2. The payments-itecpay Edge Function sends that payment, once, to ItecPay
--      (the customer approves it on their phone) and keeps ItecPay's
--      transaction id.
--   3. Only ItecPay's own status check, asked by our server, marks it paid.
--      ItecPay's callbacks carry no signature, so a callback only makes the
--      function ask. finance_apply_provider_event does the rest: each result
--      once, the amount checked, the ledger entry, the customer's message.
--
-- platform_settings.mobile_money switches the option on for everyone ('on'),
-- for admins and finance staff only while testing with ItecPay ('staff'), or
-- off (default).

INSERT INTO public.platform_settings (key, value) VALUES ('mobile_money', 'off')
ON CONFLICT (key) DO NOTHING;

-- Whether the person asking may see "Pay from your phone"
CREATE OR REPLACE FUNCTION public.mobile_money_available()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE coalesce((SELECT value FROM public.platform_settings WHERE key = 'mobile_money'), 'off')
    WHEN 'on' THEN true
    WHEN 'staff' THEN public.is_admin() OR public.has_role(auth.uid(), 'finance')
    ELSE false END;
$$;

-- 07XXXXXXXX from the ways Rwandan numbers are written; NULL if it isn't one
CREATE OR REPLACE FUNCTION public.mobile_money_phone(_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^2507[0-9]{8}$' THEN '0' || substr(d, 4)
    WHEN d ~ '^7[0-9]{8}$' THEN '0' || d
    WHEN d ~ '^07[0-9]{8}$' THEN d
  END
  FROM (SELECT regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g') AS d) x;
$$;

-- ============== LATE APPROVALS ARE STILL MONEY ==============
-- When nobody approves a request in time, Isoko stops waiting and marks the
-- payment cancelled. The customer can still approve it on their phone
-- afterwards; that money arrived, so a cancelled payment can still become
-- successful. A payment the provider reported as failed stays failed (a later
-- "successful" for it is refused, as before). Everything else is as in
-- 20260925120100_payment_engine.sql.
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
    ELSIF p.status IN ('successful', 'partially_refunded', 'refunded', 'voided', 'failed')
       OR (p.status = 'cancelled' AND p_status <> 'successful') THEN
      v_outcome := CASE WHEN p.status = p_status THEN 'already_applied' ELSE 'ignored_final_state' END;
    ELSIF p_status = 'successful' THEN
      BEGIN
        UPDATE public.finance_payments
        SET status = 'successful', confirmed_at = now(), provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id),
            failure_reason = CASE WHEN status = 'cancelled'
                                  THEN 'Approved late (' || coalesce(failure_reason, 'cancelled') || ')' ELSE failure_reason END
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

-- ============== 1. THE CUSTOMER ASKS TO PAY ==============
-- p_token: the private link's token (travel, consultancy, data); otherwise the
-- signed-in customer's own record. p_amount: defaults to what is left to pay.
CREATE OR REPLACE FUNCTION public.mobile_money_start(
  p_entity_table text, p_entity_id uuid, p_token text, p_network text, p_phone text, p_amount numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.finance_accounts;
  v_entity uuid;
  v_phone text := public.mobile_money_phone(p_phone);
  v_network text := lower(btrim(coalesce(p_network, '')));
  t jsonb;
  v_left numeric;
  v_amount numeric;
  v_open public.finance_payments;
  v_id uuid;
BEGIN
  IF NOT public.mobile_money_available() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Paying from your phone isn''t available yet';
  END IF;
  PERFORM public.rate_limit('mobile-money:start', 20, 3600);

  -- Whose record, and may they pay for it
  IF nullif(btrim(coalesce(p_token, '')), '') IS NOT NULL THEN
    CASE p_entity_table
      WHEN 'travel_trips' THEN
        SELECT id INTO v_entity FROM public.travel_trip_by_token(p_token) WHERE status IN ('confirmed', 'completed');
      WHEN 'consult_requests' THEN
        SELECT id INTO v_entity FROM public.consult_request_by_token(p_token) WHERE status IN ('approved', 'in_progress', 'completed');
      WHEN 'data_requests' THEN
        SELECT id INTO v_entity FROM public.data_request_by_token(p_token) WHERE fee IS NOT NULL AND status <> 'cancelled';
      ELSE
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Not something you can pay for here';
    END CASE;
    a := public.finance_account_of(p_entity_table, v_entity);
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Please sign in to pay';
    END IF;
    a := public.finance_account_of(p_entity_table, p_entity_id);
    IF a.id IS NOT NULL AND a.customer_user_id IS DISTINCT FROM auth.uid() THEN
      a := NULL;
    END IF;
  END IF;
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is nothing to pay here yet';
  END IF;
  PERFORM public.rate_limit('mobile-money:account', 6, 3600, a.id::text);

  IF a.currency <> 'RWF' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Mobile money is for amounts in RWF. Please pay by bank transfer.';
  END IF;
  IF v_network NOT IN ('mtn', 'airtel', 'spenn') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose MTN Mobile Money, Airtel Money or SPENN';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter a Rwandan phone number, e.g. 0788 123 456';
  END IF;
  IF (v_network = 'mtn' AND v_phone !~ '^07[89]') OR (v_network = 'airtel' AND v_phone !~ '^07[23]') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('%s isn''t an %s number', v_phone,
      CASE v_network WHEN 'mtn' THEN 'MTN' ELSE 'Airtel' END);
  END IF;

  -- One at a time per account, so two requests can't both pass the check
  PERFORM 1 FROM public.finance_accounts WHERE id = a.id FOR UPDATE;
  SELECT * INTO v_open FROM public.finance_payments
  WHERE account_id = a.id AND provider = 'itecpay' AND status IN ('pending', 'processing')
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', HINT = v_open.id::text,
      MESSAGE = 'A payment is already waiting for approval on your phone';
  END IF;
  t := public.finance_totals(a.id);
  v_left := (t ->> 'balance')::numeric - (t ->> 'pending')::numeric;
  v_amount := coalesce(p_amount, v_left);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> trunc(v_amount) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount in whole francs';
  END IF;
  IF NOT a.allow_overpayment AND v_amount > v_left THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = CASE WHEN v_left <= 0 THEN 'Nothing is left to pay'
      ELSE format('The amount is more than the %s RWF left to pay', v_left) END;
  END IF;

  PERFORM public.finance_begin();
  INSERT INTO public.finance_payments (account_id, amount, currency, method, provider, status, created_by, metadata)
  VALUES (a.id, v_amount, a.currency, 'momo', 'itecpay', 'pending', auth.uid(),
          jsonb_build_object('network', v_network, 'phone', v_phone))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('payment_id', v_id, 'amount', v_amount, 'currency', a.currency, 'network', v_network,
    'phone', v_phone);
END $$;

-- What the customer's screen shows while they approve. The payment id (only
-- ever given to the person who started the payment) is the key.
CREATE OR REPLACE FUNCTION public.mobile_money_status(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.finance_payments;
BEGIN
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id AND provider = 'itecpay';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Payment not found';
  END IF;
  RETURN jsonb_build_object('status', CASE p.status WHEN 'partially_refunded' THEN 'successful' WHEN 'refunded' THEN 'successful'
                                                    ELSE p.status END,
    'amount', p.amount, 'currency', p.currency, 'network', p.metadata ->> 'network',
    'message', CASE WHEN p.status IN ('failed', 'cancelled') THEN p.failure_reason END);
END $$;

-- ============== 2. THE EDGE FUNCTION (service role) ==============
-- Hands a new payment to the sender, once
CREATE OR REPLACE FUNCTION public.mobile_money_claim_send(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.finance_payments;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id AND provider = 'itecpay' FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' OR p.metadata ? 'sent_at' OR p.created_at < now() - interval '5 minutes' THEN
    RETURN NULL;
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments SET metadata = metadata || jsonb_build_object('sent_at', now()) WHERE id = p.id;
  RETURN jsonb_build_object('payment_id', p.id, 'amount', p.amount, 'currency', p.currency,
    'network', p.metadata ->> 'network', 'phone', p.metadata ->> 'phone');
END $$;

-- ItecPay accepted the request: the customer has the prompt on their phone
CREATE OR REPLACE FUNCTION public.mobile_money_sent(p_payment_id uuid, p_transaction_id text, p_financial_transaction_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.finance_payments;
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  SELECT * INTO p FROM public.finance_payments WHERE id = p_payment_id AND provider = 'itecpay' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM public.finance_begin();
  UPDATE public.finance_payments
  SET provider_txn_id = coalesce(provider_txn_id, nullif(left(p_transaction_id, 100), '')),
      status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object('financial_transaction_id', left(p_financial_transaction_id, 100)))
  WHERE id = p.id;
END $$;

-- When each waiting payment was last asked about (kept apart from the payment,
-- so the audit log doesn't record every check)
CREATE TABLE IF NOT EXISTS public.mobile_money_checks (
  payment_id uuid PRIMARY KEY REFERENCES public.finance_payments(id),
  checked_at timestamptz NOT NULL
);
ALTER TABLE public.mobile_money_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_money_checks FROM PUBLIC, anon, authenticated;

-- Payments to ask ItecPay about: waiting ones at most every 20 seconds, and
-- ones given up on in the last day every 10 minutes (a late approval)
-- (p_payment_id: just that one, when the customer taps "check"; p_now: right
-- away, for ItecPay's callback)
CREATE OR REPLACE FUNCTION public.mobile_money_due(p_limit integer DEFAULT 50, p_payment_id uuid DEFAULT NULL, p_now boolean DEFAULT false)
RETURNS TABLE (payment_id uuid, network text, amount numeric, provider_txn_id text, sent boolean, age_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT fp.id, fp.metadata, fp.amount, fp.provider_txn_id, fp.created_at
    FROM public.finance_payments fp LEFT JOIN public.mobile_money_checks c ON c.payment_id = fp.id
    WHERE fp.provider = 'itecpay' AND (p_payment_id IS NULL OR fp.id = p_payment_id)
      AND (
        -- waiting for approval
        (fp.status IN ('pending', 'processing')
         AND (p_now OR coalesce(c.checked_at, '-infinity') < now() - interval '20 seconds'))
        -- given up on in the last day, but perhaps approved late on the phone
        OR (fp.status = 'cancelled' AND fp.created_at > now() - interval '1 day'
            AND (p_now OR coalesce(c.checked_at, '-infinity') < now() - interval '10 minutes')))
    ORDER BY fp.created_at
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    FOR UPDATE OF fp SKIP LOCKED
  ), marked AS (
    INSERT INTO public.mobile_money_checks (payment_id, checked_at)
    SELECT id, now() FROM due
    ON CONFLICT ON CONSTRAINT mobile_money_checks_pkey DO UPDATE SET checked_at = EXCLUDED.checked_at
  )
  SELECT d.id, d.metadata ->> 'network', d.amount, d.provider_txn_id, d.metadata ? 'sent_at',
         extract(epoch FROM now() - d.created_at)::integer
  FROM due d;
END $$;

-- The callback only carries ItecPay's transaction id
CREATE OR REPLACE FUNCTION public.mobile_money_by_transaction(p_transaction_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role only';
  END IF;
  RETURN (SELECT id FROM public.finance_payments WHERE provider = 'itecpay' AND provider_txn_id = p_transaction_id);
END $$;

-- ============== PERMISSIONS ==============
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['mobile_money_available()', 'mobile_money_start(text, uuid, text, text, text, numeric)',
                           'mobile_money_status(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['mobile_money_claim_send(uuid)', 'mobile_money_sent(uuid, text, text)',
                           'mobile_money_due(integer, uuid, boolean)', 'mobile_money_by_transaction(text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mobile_money_phone(text) FROM PUBLIC, anon, authenticated';
END $$;

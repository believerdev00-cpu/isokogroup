-- Schema-wide security rules, checked across every table, function and bucket
-- (not one exploit at a time like the other suites), so a table or function
-- added later can't quietly skip them:
--
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/schema_guards.test.sql
--
-- A failure names what broke the rule. If the new thing is meant to be that
-- way, add it to the allowlist here, in the same change, with a reason.
BEGIN;

CREATE PROCEDURE pg_temp.none(p_sql text, p_what text) LANGUAGE plpgsql AS $$
DECLARE offenders text;
BEGIN
  EXECUTE 'SELECT string_agg(x::text, E''\n    '') FROM (' || p_sql || ') q(x)' INTO offenders;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'FAILED: %\n    %', p_what, offenders;
  END IF;
  RAISE NOTICE 'ok  %', p_what;
END $$;

-- ---------- Tables ----------
CALL pg_temp.none($$
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
$$, 'every public table has row-level security');

CALL pg_temp.none($$
  SELECT table_name || ': ' || grantee || ' ' || privilege_type FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
$$, 'the website roles can''t truncate tables or add triggers (row-level security doesn''t cover those)');

-- A write policy that applies to visitors must depend on who is signed in
CALL pg_temp.none($$
  SELECT tablename || ': ' || policyname FROM pg_policies
  WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND roles && ARRAY['anon', 'public']::name[]
    AND coalesce(qual, '') || coalesce(with_check, '') !~ '(auth\.uid\(\)|is_admin\(\)|has_role\()'
$$, 'no write policy lets anonymous visitors change data');

-- Money and history can't be rewritten, even by the database owner
CALL pg_temp.none($$
  SELECT t FROM unnest(ARRAY['finance_accounts', 'finance_submissions', 'finance_payments', 'finance_ledger',
                             'finance_provider_events']) t
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'finance_guard')
$$, 'every finance table has its guard');
CALL pg_temp.none($$
  SELECT 'audit_log' WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid
    WHERE g.tgrelid = 'public.audit_log'::regclass AND NOT g.tgisinternal AND g.tgtype & 24 <> 0)
$$, 'the audit log refuses updates and deletes');
CALL pg_temp.none($$
  SELECT grantee || ' ' || privilege_type || ' on ' || table_name FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
    AND table_name IN ('finance_accounts', 'finance_submissions', 'finance_payments', 'finance_ledger',
                       'finance_provider_events', 'audit_log', 'notification_secrets')
    AND privilege_type <> 'SELECT'
$$, 'money, the audit log and message secrets are written only through their functions');
CALL pg_temp.none($$
  SELECT grantee FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'notification_secrets' AND grantee IN ('anon', 'authenticated', 'service_role')
$$, 'nobody on the website or in an Edge Function reads message secrets');

-- ---------- Functions ----------
CALL pg_temp.none($$
  SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'training') AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
$$, 'every SECURITY DEFINER function fixes its search_path');

CALL pg_temp.none($$
  SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
$$, 'trigger functions can''t be called from the website');

-- What visitors without an account can run with elevated rights: the private-link
-- portals (the link's token is the key, rate-limited), shipment tracking by
-- number, and role checks used by policies.
CALL pg_temp.none($$
  SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
  EXCEPT SELECT unnest(ARRAY[
    'is_admin()', 'is_service_staff(text)', 'track_shipment(text)',
    'travel_request_trip(jsonb)', 'travel_trip_view(text)', 'travel_accept_quote(text)',
    'travel_request_changes(text,text)', 'travel_submit_payment(text,numeric,text,text)',
    'travel_document_uploaded(text,uuid,text)',
    'consult_submit_request(jsonb)', 'consult_request_view(text)', 'consult_accept_proposal(text)',
    'consult_request_changes(text,text)', 'consult_submit_payment(text,numeric,text,text)',
    'consult_client_file(text,text,text,bigint)',
    'data_submit_request(jsonb)', 'data_request_view(text)', 'data_client_file(text,text,text,bigint)',
    'data_review(text,boolean,text)', 'data_submit_payment(text,numeric,text,text)'])
$$, 'anonymous visitors can run only the intended elevated functions');

-- Internals of the engines: never callable from the website
CALL pg_temp.none($$
  SELECT f FROM unnest(ARRAY[
    'finance_open_account(text,uuid,text,uuid,text)', 'finance_post(finance_accounts,text,numeric,text,text,uuid,bigint,text,text)',
    'finance_receive(finance_accounts,numeric,text,text,text,text,uuid,text,jsonb)', 'finance_begin()',
    'finance_set_price(finance_accounts,numeric,text)', 'finance_sync_entity(finance_accounts)',
    'notify_event(text,text,text,uuid,jsonb,jsonb)', 'notification_attach_secret(uuid,text)',
    'notification_claim(integer)', 'notification_result(uuid,boolean,text,text,text,boolean)',
    'audit_event(text,text,text,jsonb,text)', 'rate_limit(text,integer,integer,text)',
    'training_is_admin()', 'finance_can_reverse_module(text)']) f
  WHERE to_regprocedure('public.' || f) IS NULL
     OR has_function_privilege('anon', to_regprocedure('public.' || f), 'EXECUTE')
     OR has_function_privilege('authenticated', to_regprocedure('public.' || f), 'EXECUTE')
$$, 'engine internals exist and aren''t callable from the website');

-- ---------- Storage ----------
CALL pg_temp.none($$
  SELECT id FROM storage.buckets WHERE public AND id NOT IN ('product-images')
$$, 'only product images are served publicly');

-- ---------- Training Center ----------
CALL pg_temp.none($$
  SELECT 'schema usage: ' || r FROM unnest(ARRAY['anon', 'authenticated']) r WHERE has_schema_privilege(r, 'training', 'USAGE')
  UNION ALL
  SELECT table_name || ': ' || grantee FROM information_schema.role_table_grants
  WHERE table_schema = 'training' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
$$, 'the Training Center schema is reachable only through its API');

ROLLBACK;

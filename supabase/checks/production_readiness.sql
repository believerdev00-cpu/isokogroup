-- Production readiness check. Read-only: safe to run against production.
--
--   psql "<production connection string>" -f supabase/checks/production_readiness.sql
--
-- Prints one line per check: ok, WARN (look at it) or FAIL (fix before taking
-- real customers), then a summary. docs/DEPLOYMENT.md says what to do about each.
-- Run it after applying the migrations: before that, most checks can't run.
BEGIN READ ONLY;

WITH
-- The hardening migrations, in the order they are applied
expected(version, name) AS (VALUES
  ('20260922090000', 'security_hardening'), ('20260922100000', 'training_center'),
  ('20260922110000', 'service_staff_roles'), ('20260922110100', 'client_services'),
  ('20260923120000', 'travel_bnb_need'), ('20260923130000', 'training_media_programs'),
  ('20260925100000', 'block_forged_state'), ('20260925110000', 'seller_role'),
  ('20260925110100', 'roles_and_audit_log'), ('20260925120000', 'finance_role'),
  ('20260925120100', 'payment_engine'), ('20260925130000', 'notification_engine'),
  ('20260925140000', 'files_and_links'), ('20260925150000', 'module_fixes'),
  ('20260925150100', 'training_hardening'), ('20260925160000', 'training_on_engines'),
  ('20260925170000', 'privilege_hygiene'), ('20260925180000', 'mobile_money')),
missing AS (
  SELECT e.* FROM expected e
  WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = e.version)),
settings AS (
  SELECT coalesce((SELECT value FROM public.platform_settings WHERE key = 'site_url'), '') AS site_url,
         coalesce((SELECT value FROM public.platform_settings WHERE key = 'rate_limit_multiplier'), '1') AS rate_multiplier,
         (SELECT value ->> 'currency' FROM training.settings WHERE key = 'center') AS training_currency),
overdue AS (
  SELECT count(*) AS n, min(next_attempt_at) AS oldest FROM public.notification_deliveries
  WHERE channel <> 'in_app' AND status IN ('pending', 'sending') AND next_attempt_at < now() - interval '15 minutes'),
unconfigured AS (
  SELECT count(*) AS n, string_agg(DISTINCT error, '; ') AS reasons FROM public.notification_deliveries
  WHERE status = 'skipped' AND created_at > now() - interval '7 days'
    AND (error ILIKE '%provider%' OR error ILIKE '%SMTP%' OR error = 'site_url is not set')),
stale_reports AS (
  SELECT count(*) AS n, min(created_at) AS oldest FROM public.finance_submissions
  WHERE status = 'pending' AND created_at < now() - interval '3 days'),
no_rls AS (
  SELECT string_agg(c.relname, ', ') AS names FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
-- ok: passes; fail: whether not passing blocks going live (else it's a warning)
checks(n, ok, fail, area, check_, detail) AS (
  SELECT 1, NOT EXISTS (SELECT 1 FROM missing), true, 'migrations', 'all hardening migrations applied',
         (SELECT 'missing: ' || string_agg(version || '_' || name, ', ' ORDER BY version) FROM missing)
  UNION ALL SELECT 2, site_url ~ '^https://[^/]+$', true, 'settings', 'platform_settings.site_url is the https site address, no trailing slash',
         'value: ' || coalesce(nullif(site_url, ''), '(empty: emails and messages with links are skipped)') FROM settings
  UNION ALL SELECT 3, rate_multiplier = '1', false, 'settings', 'rate limits at normal strength',
         'rate_limit_multiplier = ' || rate_multiplier FROM settings
  UNION ALL SELECT 4, coalesce(training_currency, 'RWF') IN ('RWF', 'USD', 'EUR'), true, 'settings',
         'Training Center currency is one the ledger keeps', 'currency: ' || coalesce(training_currency, '(default RWF)') FROM settings
  UNION ALL SELECT 5, count(DISTINCT user_id) > 0, true, 'people', 'at least one Isoko admin', count(DISTINCT user_id) || ' admin(s)'
         FROM public.user_roles WHERE role = 'admin'
  UNION ALL SELECT 6, count(*) > 0, false, 'people', 'at least one active Training Center admin', count(*) || ' admin(s)'
         FROM training.users WHERE role = 'admin' AND is_active
  UNION ALL SELECT 7, count(DISTINCT user_id) > 0, false, 'people', 'someone has the finance role',
         count(DISTINCT user_id) || ' finance staff (admins can also handle money)' FROM public.user_roles WHERE role = 'finance'
  UNION ALL SELECT 8, count(*) = 0, false, 'people', 'no test accounts left', count(*) || ' account(s) at @test.local, @example.* or .invalid'
         FROM auth.users WHERE email ~* '@(test\.local|example\.(com|org|net|test))$' OR email ~* '\.invalid$'
  UNION ALL SELECT 9, (SELECT count(*) FROM public.finance_payments WHERE provider = 'mock')
                    + (SELECT count(*) FROM public.finance_provider_events WHERE provider = 'mock') = 0, true, 'money',
         'no mock-provider payments', ((SELECT count(*) FROM public.finance_payments WHERE provider = 'mock')
                    + (SELECT count(*) FROM public.finance_provider_events WHERE provider = 'mock')) || ' found'
  UNION ALL SELECT 10, n = 0, false, 'money', 'no customer payment reports waiting more than 3 days',
         n || ' waiting; oldest ' || coalesce(to_char(oldest, 'YYYY-MM-DD'), '-') FROM stale_reports
  UNION ALL SELECT 11, count(*) = 0, false, 'money', 'no provider events needing review', count(*) || ' marked needs_review'
         FROM public.finance_provider_events WHERE outcome = 'needs_review'
  UNION ALL SELECT 12, count(*) = 0, false, 'notifications', 'no messages "sent" by the mock provider', count(*) || ' found'
         FROM public.notification_deliveries WHERE provider = 'mock'
  UNION ALL SELECT 13, n = 0, true, 'notifications', 'notifications-dispatch is sending (nothing overdue by 15 minutes)',
         n || ' overdue; oldest due ' || coalesce(to_char(oldest, 'YYYY-MM-DD HH24:MI'), '-') FROM overdue
  UNION ALL SELECT 14, n = 0, false, 'notifications', 'every channel in use has a provider (last 7 days)',
         n || ' skipped' || coalesce(': ' || reasons, '') FROM unconfigured
  UNION ALL SELECT 15, count(*) = 0, false, 'notifications', 'no messages failed for good in the last 7 days', count(*) || ' failed'
         FROM public.notification_deliveries WHERE status = 'failed' AND failed_at > now() - interval '7 days'
  UNION ALL SELECT 16, count(*) = 0, false, 'notifications', 'no one-time secrets older than a day (is the sender running?)',
         count(*) || ' found' FROM public.notification_secrets WHERE created_at < now() - interval '1 day'
  UNION ALL SELECT 16.1, v IN ('off', 'staff', 'on'), false, 'money',
         'paying from the phone (ItecPay): off, staff (testing) or on', 'mobile_money = ' || v
         FROM (SELECT coalesce((SELECT value FROM public.platform_settings WHERE key = 'mobile_money'), '(not set)') AS v) m
  UNION ALL SELECT 16.2, count(*) = 0, true, 'money', 'no phone payments waiting over 30 minutes (is the payments-itecpay sweep running?)',
         count(*) || ' waiting' FROM public.finance_payments
         WHERE provider = 'itecpay' AND status IN ('pending', 'processing') AND created_at < now() - interval '30 minutes'
  UNION ALL SELECT 17, names IS NULL, true, 'security', 'row-level security on every public table', names FROM no_rls
  UNION ALL SELECT 18, count(*) = 0, true, 'security', 'only product images are public in Storage',
         'public: ' || string_agg(id, ', ') FROM storage.buckets WHERE public AND id <> 'product-images'
  UNION ALL SELECT 19, NOT has_schema_privilege('anon', 'training', 'USAGE') AND NOT has_schema_privilege('authenticated', 'training', 'USAGE'),
         true, 'security', 'Training Center data reachable only through its API', NULL
),
graded AS (
  SELECT n, CASE WHEN ok THEN 'ok' WHEN fail THEN 'FAIL' ELSE 'WARN' END AS status, area, check_, coalesce(detail, '') AS detail
  FROM checks)
SELECT status, area, check_ AS check, detail FROM (
  SELECT n, status, area, check_, detail FROM graded
  UNION ALL
  SELECT 99, '==', 'summary', format('%s ok, %s WARN, %s FAIL', count(*) FILTER (WHERE status = 'ok'),
    count(*) FILTER (WHERE status = 'WARN'), count(*) FILTER (WHERE status = 'FAIL')), '' FROM graded
) r ORDER BY n;

-- The schedule for notifications-dispatch, when it was set up with Supabase Cron
-- (pg_cron). None found: check the schedule by hand (docs/DEPLOYMENT.md).
DO $$
DECLARE j record; found boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR j IN EXECUTE $q$SELECT jobname, schedule, active FROM cron.job WHERE command ILIKE '%notifications-dispatch%'$q$ LOOP
      RAISE NOTICE 'schedule: % runs notifications-dispatch at "%" (active: %)', j.jobname, j.schedule, j.active;
      found := true;
    END LOOP;
  END IF;
  IF NOT found THEN
    RAISE NOTICE 'schedule: no Supabase Cron job found for notifications-dispatch; if it is scheduled elsewhere, check it there';
  END IF;
END $$;

ROLLBACK;

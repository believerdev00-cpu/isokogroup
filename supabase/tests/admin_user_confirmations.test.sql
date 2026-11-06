-- Regression test for 20261105120000_admin_user_confirmations.sql, run against the
-- local Supabase database as the real 'anon' / 'authenticated' roles. Everything
-- runs in one transaction that is rolled back.
BEGIN;

INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'uc-admin@test.local', 'authenticated', 'authenticated', now(), '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'uc-buyer@test.local', 'authenticated', 'authenticated', now(), '{}'),
  ('00000000-0000-4000-8000-0000000000c3', 'uc-waiting@test.local', 'authenticated', 'authenticated', NULL, '{"register_as":"seller"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000c1', 'admin');

CREATE FUNCTION pg_temp.refused(p_user text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_role text := CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN json_build_object('role', v_role)::text
         ELSE json_build_object('sub', p_user, 'role', v_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', v_role);
  BEGIN
    PERFORM * FROM public.admin_user_confirmations();
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN true;
  END;
  RESET ROLE;
  RETURN false;
END $$;

DO $$
BEGIN
  IF NOT pg_temp.refused(NULL) THEN RAISE EXCEPTION 'FAILED: a visitor could read the list'; END IF;
  IF NOT pg_temp.refused('00000000-0000-4000-8000-0000000000c2') THEN RAISE EXCEPTION 'FAILED: a buyer could read the list'; END IF;
  IF NOT pg_temp.refused('00000000-0000-4000-8000-0000000000c3') THEN RAISE EXCEPTION 'FAILED: an unconfirmed account could read the list'; END IF;
  IF pg_temp.refused('00000000-0000-4000-8000-0000000000c1') THEN RAISE EXCEPTION 'FAILED: an admin could not read the list'; END IF;
END $$;

-- As the admin: the answers themselves
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_rows integer;
  v_waiting public.profiles.role%TYPE;
BEGIN
  SELECT count(*) INTO v_rows FROM public.admin_user_confirmations() c WHERE c.email LIKE 'uc-%@test.local';
  IF v_rows <> 3 THEN RAISE EXCEPTION 'FAILED: expected each account once, got %', v_rows; END IF;
  SELECT c.account_type INTO v_waiting FROM public.admin_user_confirmations() c
  WHERE c.email_confirmed_at IS NULL AND c.email = 'uc-waiting@test.local';
  IF v_waiting IS DISTINCT FROM 'seller' THEN RAISE EXCEPTION 'FAILED: waiting seller shown as %', v_waiting; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_user_confirmations() c WHERE c.email = 'uc-admin@test.local' AND c.is_admin) THEN
    RAISE EXCEPTION 'FAILED: the admin is not marked as admin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_user_confirmations() c WHERE c.email = 'uc-buyer@test.local' AND (c.is_admin OR c.email_confirmed_at IS NULL)) THEN
    RAISE EXCEPTION 'FAILED: the confirmed buyer is shown wrongly';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;

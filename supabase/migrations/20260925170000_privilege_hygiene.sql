-- Privileges nobody on the website needs
--
-- Supabase gives the website roles (anon, authenticated) every table privilege
-- by default and relies on row-level security. RLS covers SELECT, INSERT,
-- UPDATE and DELETE, but not TRUNCATE (empties a table, skipping row triggers
-- and policies), TRIGGER or REFERENCES. The website never needs them, so they
-- are removed, now and for tables created later. Trigger functions are only
-- ever run by their triggers, so nobody needs to call them directly either.
--
-- supabase/tests/schema_guards.test.sql keeps these rules in place.

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

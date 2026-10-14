-- Close the trigger functions added since the last sweep.
--
-- 20260925170000_privilege_hygiene.sql revoked EXECUTE on every trigger
-- function in public, on the grounds that a trigger function is only ever run
-- by its trigger and nobody needs to call one directly. That was true of the
-- functions which existed that day. Twenty-one have been added since -- the
-- Global Initiative, comments, contact messages, private messages, advert
-- requests, the packaging price guard -- and PostgreSQL grants EXECUTE on a
-- new function to PUBLIC by default, so each one arrived open.
--
-- Nothing was exposed by it: PL/pgSQL refuses a direct call outright with
-- "trigger functions can only be called as triggers", whoever makes it. What
-- was lost is the guarantee. schema_guards.test.sql has been asserting this
-- rule the whole time and failing, unnoticed, because the local database the
-- suite runs against was fifteen migrations behind the repository.
--
-- The sweep is repeated rather than the twenty-one being named: the next one
-- added will be caught by the same guard, which is how this was meant to work,
-- and now the suite that holds it actually runs.
--
-- Default privileges are deliberately not changed for functions as a class.
-- That would close every future function, RPCs included, and the website calls
-- those -- a change that belongs with the grants to match it, not here.

DO $$
DECLARE f regprocedure;
  opened integer := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    opened := opened + 1;
  END LOOP;
  RAISE NOTICE 'closed % trigger function(s) that the website could reach', opened;
END $$;

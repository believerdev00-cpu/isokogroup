-- The previous migration tried to stop the public reading the initiative's
-- balance and did not finish the job. It revoked EXECUTE on the two summing
-- functions from anon and authenticated, which left them callable anyway:
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, and every
-- role inherits it. Revoking the named roles removed their explicit grants and
-- changed nothing else, so /rpc/initiative_raised still answered 200 with the
-- figure in it.
--
-- PUBLIC has to be revoked too. service_role keeps its own explicit grant, so
-- anything server-side that legitimately needs a total still has one.
REVOKE EXECUTE ON FUNCTION public.initiative_raised(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initiative_raised_by_area(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initiative_raised(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.initiative_raised_by_area(text) TO service_role;

-- Stop telling the public how much has been collected, or how much is wanted.
--
-- The public project list carried amount_raised, the Initiative page showed a
-- running "Confirmed contributions" figure, and both functions that compute
-- those sums were executable by anyone holding the publishable key. A visitor
-- could therefore read the initiative's balance whether or not the site chose to
-- display it. Taking it out of the page alone would not have been enough.
--
-- The funding target goes too. A target invites someone to measure their gift
-- against a number, and a project shown as fully funded quietly tells people to
-- stop giving. Contributions are not capped and the public page no longer
-- implies they are. The figure stays on the table for the review desk and for
-- the applicant who proposed it; it simply is not public.
--
-- Admins are unaffected: they read the projects and donations tables directly.

-- A view cannot have a column removed in place, so it is rebuilt. Everything
-- else about it is unchanged.
DROP VIEW IF EXISTS public.initiative_public_projects;

CREATE VIEW public.initiative_public_projects AS
  SELECT id, title, description, focus_area, subcategory, item, location,
         status, completion_summary, completed_at, created_at
    FROM public.initiative_projects
   WHERE published;

-- Re-applied, and the reason is worth repeating because dropping the view threw
-- it away: Supabase grants every new object in this schema to anon and
-- authenticated by default, and a view over a single table is auto-updatable, so
-- that default alone would let a visitor INSERT, UPDATE or DELETE through this
-- view. A write through it runs as the view owner, which bypasses row-level
-- security on the table underneath. The default has to be taken away before
-- SELECT is granted back.
REVOKE ALL ON public.initiative_public_projects FROM anon, authenticated;
GRANT SELECT ON public.initiative_public_projects TO anon, authenticated;

COMMENT ON VIEW public.initiative_public_projects IS
  'Published projects as the public sees them. Deliberately carries neither the amount raised nor the amount required: what has been collected is not public, and a target would imply a ceiling on giving.';

-- The sums themselves stop being callable by the public. Both are left in place
-- for the review desk and anything server-side that legitimately needs them.
REVOKE EXECUTE ON FUNCTION public.initiative_raised(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initiative_raised_by_area(text) FROM anon, authenticated;

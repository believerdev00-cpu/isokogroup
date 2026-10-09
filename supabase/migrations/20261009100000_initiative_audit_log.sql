-- Audit logging for the Global Initiative.
-- The Global Initiative is the only money-handling feature in this schema with
-- no audit trail. Marketplace, logistics, travel, consultancy, payments,
-- settings and entertainment tables all carry an 'audit_changes' trigger;
-- initiative_projects, initiative_donations and initiative_allocations carry
-- none. That is why nobody can say who created or approved the existing
-- 'entrepreneurship' project, and the same would be true of any future dispute
-- over a confirmed donation.
--
-- It matters more here than the row columns suggest. reviewed_by on both
-- initiative tables is ON DELETE SET NULL, so if the admin who approved
-- something later leaves and their account is removed, the row forgets who
-- decided. audit_log.actor_id carries no foreign key, so the log remembers.
--
-- Projects and allocations reuse the shared public.audit_row_change(). Donations
-- do not: a donation row carries the donor's name and email address, and the
-- audit log is append-only -- not even the service role can delete from it -- so
-- anything written there is permanent.

-- ============== PROJECTS AND ALLOCATIONS ==============
-- Checked before reusing the shared function: document_path is
-- '<user id>/<random uuid>.<ext>' -- the uploader's own filename is discarded at
-- upload time -- so no name travels in it. The remaining columns are the project
-- record itself, which is what an audit of a project is for.
DROP TRIGGER IF EXISTS audit_changes ON public.initiative_projects;
CREATE TRIGGER audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.initiative_projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Allocations are already append-only for everyone (UPDATE and DELETE are
-- revoked from anon and authenticated and no policy grants them), so in practice
-- only the insert arm will ever fire. The other arms cost nothing and mean a
-- future grant cannot quietly become unlogged.
DROP TRIGGER IF EXISTS audit_changes ON public.initiative_allocations;
CREATE TRIGGER audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.initiative_allocations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ============== DONATIONS ==============
-- Same record, same destination, but the columns are chosen by an allow-list
-- rather than by naming the ones to drop. A deny-list is wrong for a log that
-- can never be edited: the day somebody adds donor_phone to this table, a
-- deny-list starts copying it into permanent storage and nothing complains. An
-- allow-list fails closed -- a new column is excluded until someone decides it
-- belongs here.
--
-- What is kept and why:
--   reference      the transaction an admin checked against the statement. An
--                  audit that cannot say which payment was confirmed records
--                  nothing worth having, and this is a transaction identifier,
--                  not a credential.
--   user_id        the link to the account. donations.user_id is ON DELETE SET
--                  NULL, so the row forgets the donor if they close the account;
--                  the log does not. That is the point of an audit, and it is
--                  also the sharpest edge of this design -- see the migration
--                  notes about erasure requests.
--   review_note    the reviewer's stated reason, which is the substance of the
--                  decision being audited.
-- What is never kept: donor_name, donor_email, and anything added later.
CREATE OR REPLACE FUNCTION public.initiative_audit_donation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_allowed text[] := ARRAY[
    'id', 'amount', 'user_id', 'anonymous', 'payment_method', 'reference',
    'project_id', 'designated_by_donor', 'status', 'submitted_at',
    'reviewed_by', 'reviewed_at', 'review_note'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    -- Only what actually changed. 'updated_at' is excluded the way the shared
    -- function excludes it; this table has no such column today, and if one is
    -- ever added this will not start logging every untouched row.
    SELECT jsonb_object_agg(n.key, n.value) INTO v_new
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key <> 'updated_at'
       AND n.value IS DISTINCT FROM v_old -> n.key;
    IF v_new IS NULL THEN
      RETURN NULL;                       -- nothing meaningful changed
    END IF;
    SELECT jsonb_object_agg(k, v_old -> k) INTO v_old FROM jsonb_object_keys(v_new) k;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
  END IF;
  v_row := coalesce(to_jsonb(NEW), to_jsonb(OLD));

  -- Keep only the allowed columns on both sides. If every changed column was a
  -- withheld one, both sides come back empty and the row still records that
  -- this actor changed this donation at this time: hiding that a change
  -- happened would defeat the log.
  SELECT jsonb_object_agg(e.key, e.value) INTO v_old
    FROM jsonb_each(coalesce(v_old, '{}'::jsonb)) e WHERE e.key = ANY (v_allowed);
  SELECT jsonb_object_agg(e.key, e.value) INTO v_new
    FROM jsonb_each(coalesce(v_new, '{}'::jsonb)) e WHERE e.key = ANY (v_allowed);

  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_table, entity_id,
                                old_data, new_data, reason)
  VALUES (
    auth.uid(), public.audit_actor_role(), lower(TG_OP), TG_TABLE_NAME, v_row ->> 'id',
    v_old, v_new,
    nullif(current_setting('isoko.audit_reason', true), '')
  );
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.initiative_audit_donation_change() IS
  'Audits donation rows like audit_row_change(), but by an allow-list of columns: the audit log is append-only, so a donor name or email written there could never be erased, and a column added later must be allowed in deliberately.';

DROP TRIGGER IF EXISTS audit_changes ON public.initiative_donations;
CREATE TRIGGER audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.initiative_donations
  FOR EACH ROW EXECUTE FUNCTION public.initiative_audit_donation_change();

-- ============== ROLLBACK ==============
-- DROP TRIGGER IF EXISTS audit_changes ON public.initiative_donations;
-- DROP TRIGGER IF EXISTS audit_changes ON public.initiative_allocations;
-- DROP TRIGGER IF EXISTS audit_changes ON public.initiative_projects;
-- DROP FUNCTION IF EXISTS public.initiative_audit_donation_change();
-- Rows already written cannot be removed: the log refuses UPDATE, DELETE and
-- TRUNCATE to everyone. Rolling back stops future logging; it does not undo it.

-- Giving to a focus area, not only to a project.
--
-- Until now a donor could choose "wherever it is needed most" or one published
-- project, and nothing in between. Most people who want to help have a sector in
-- mind -- agriculture, the arts -- long before they have an opinion about a
-- particular project, and there is rarely a published project in every area at
-- once. A donation can now name one of the five areas.
--
-- The column records what the donor asked for. It does not ring-fence the money:
-- the database cannot make anyone spend it there. It is a stated wish, visible
-- on the review desk, and honouring it is an operational promise.

ALTER TABLE public.initiative_donations
  ADD COLUMN IF NOT EXISTS focus_area text;

ALTER TABLE public.initiative_donations
  DROP CONSTRAINT IF EXISTS initiative_donations_focus_area;
ALTER TABLE public.initiative_donations
  ADD CONSTRAINT initiative_donations_focus_area CHECK (
    focus_area IS NULL OR focus_area IN (
      'entrepreneurship', 'arts', 'agriculture', 'unemployment_reduction', 'research'
    )
  );

COMMENT ON COLUMN public.initiative_donations.focus_area IS
  'The area the donor asked their contribution to go to, or NULL for wherever it is needed most. Derived from the project when one is chosen, so the two can never disagree.';

-- The donor may say which area; they may not say which area a project belongs
-- to. When a project is chosen the area is read from that project, so a crafted
-- request cannot file a donation under a sector the project is not in.
CREATE OR REPLACE FUNCTION public.initiative_new_donation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  waiting integer;
  project_area text;
BEGIN
  -- A new donation is always an unreviewed claim by the account that sent it.
  NEW.user_id := auth.uid();
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_note := NULL;
  NEW.submitted_at := now();

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a donation'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A donor may choose a project only from the ones the public page offers.
  -- Anything else -- unapproved, unpublished, already completed -- is refused
  -- rather than silently accepted against a hidden row.
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.focus_area INTO project_area
      FROM public.initiative_projects p
     WHERE p.id = NEW.project_id
       AND p.published
       AND p.status IN ('seeking_support', 'funded', 'in_progress');
    IF project_area IS NULL THEN
      RAISE EXCEPTION 'That project is not open for support'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.focus_area := project_area;            -- read, never taken on trust
    NEW.designated_by_donor := true;
  ELSIF NEW.focus_area IS NOT NULL THEN
    NEW.designated_by_donor := true;           -- an area was asked for
  ELSE
    NEW.designated_by_donor := false;          -- wherever it is needed most
  END IF;

  -- Each unconfirmed claim is a job for a person, so one account cannot queue
  -- an unbounded number of them. Confirmed and rejected rows do not count.
  SELECT count(*) INTO waiting
    FROM public.initiative_donations d
   WHERE d.user_id = NEW.user_id AND d.status = 'pending';
  IF waiting >= 3 THEN
    RAISE EXCEPTION 'You already have three donations waiting to be confirmed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.initiative_new_donation() IS
  'Forces a new donation to be an unreviewed claim by the signed-in account, refuses a project the public page does not offer, and derives the focus area from the project when one is chosen.';

-- A donor cannot move their own donation to another area afterwards: they have
-- no update policy at all. Keeping the area out of the review path as well means
-- an admin confirming a payment cannot quietly re-file it either.
CREATE OR REPLACE FUNCTION public.initiative_guard_donation_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.focus_area := OLD.focus_area;
  NEW.project_id := OLD.project_id;
  NEW.designated_by_donor := OLD.designated_by_donor;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'A % donation has already been reviewed', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  ELSE
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
  END IF;
  RETURN NEW;
END $$;

-- The audit log records the area too: what a donor asked for is part of what
-- was decided about their money.
CREATE OR REPLACE FUNCTION public.initiative_audit_donation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_allowed text[] := ARRAY[
    'id', 'amount', 'user_id', 'anonymous', 'payment_method', 'reference',
    'project_id', 'focus_area', 'designated_by_donor', 'status', 'submitted_at',
    'reviewed_by', 'reviewed_at', 'review_note'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    SELECT jsonb_object_agg(n.key, n.value) INTO v_new
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key <> 'updated_at'
       AND n.value IS DISTINCT FROM v_old -> n.key;
    IF v_new IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT jsonb_object_agg(k, v_old -> k) INTO v_old FROM jsonb_object_keys(v_new) k;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
  END IF;
  v_row := coalesce(to_jsonb(NEW), to_jsonb(OLD));

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

-- What has been given to each area, counting only confirmed money.
CREATE OR REPLACE FUNCTION public.initiative_raised_by_area(_area text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(d.amount), 0)::bigint
    FROM public.initiative_donations d
   WHERE d.status = 'confirmed' AND d.focus_area = _area;
$$;

GRANT EXECUTE ON FUNCTION public.initiative_raised_by_area(text) TO anon, authenticated;

-- ISOKO Groups Global Initiative — opening donations.
--
-- The previous migration deliberately left no way for anyone but an admin to
-- write a donation, because the company's real Mobile Money and bank details
-- had not been settled. They are settled: they come from site_settings, which
-- an admin edits in Admin > Settings, and the website shows them through the
-- same PayToCompany block every other payment page uses.
--
-- Nothing here moves money. The donor pays the company directly, out of band,
-- and then tells us the transaction reference. An admin checks that reference
-- against the real statement and confirms it. Only a confirmed row is money, so
-- an unconfirmed claim can never inflate what a project has raised.
--
-- A donation is recorded by a signed-in account, not anonymously. That is not
-- about who deserves to give: an open insert on a money table has no rate limit
-- the database can apply, a donor needs somewhere to come back and see whether
-- their payment was confirmed, and a reference submitted by nobody cannot be
-- chased when it does not match the statement. Giving without being named in
-- public is the 'anonymous' column, which is a display choice, not a missing
-- account.

-- ============== WHAT A DONOR MAY CLAIM ==============
-- The smallest contribution. The campaign is called "$1 One Project"; this is a
-- round figure in Rwandan francs in that spirit and is not an exchange rate.
-- The site never claims the two amounts are equal.
ALTER TABLE public.initiative_donations
  ADD CONSTRAINT initiative_donations_minimum CHECK (amount >= 1000);

-- A transaction reference is what the admin will look for on the statement, so
-- an empty or one-character claim is not one. The unique index from the first
-- migration already stops the same reference being credited twice.
ALTER TABLE public.initiative_donations
  ADD CONSTRAINT initiative_donations_reference_given
  CHECK (length(btrim(reference)) BETWEEN 4 AND 120);

-- ============== WHAT THE DATABASE DECIDES ==============
-- Everything about a donation except the donor's own claim is set here, so the
-- browser cannot send a confirmed donation, attribute one to another account,
-- backdate it, or designate a project the public cannot even see.
CREATE OR REPLACE FUNCTION public.initiative_new_donation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  waiting integer;
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
  -- Anything else -- unapproved, unpublished, already completed -- is treated as
  -- a general donation rather than silently accepted against a hidden row.
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.initiative_projects p
       WHERE p.id = NEW.project_id
         AND p.published
         AND p.status IN ('seeking_support', 'funded', 'in_progress')
    ) THEN
      RAISE EXCEPTION 'That project is not open for support'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.designated_by_donor := true;
  ELSE
    NEW.designated_by_donor := false;
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

CREATE TRIGGER initiative_donations_new
  BEFORE INSERT ON public.initiative_donations
  FOR EACH ROW EXECUTE FUNCTION public.initiative_new_donation();

-- ============== WHO MAY DO WHAT ==============
-- A signed-in visitor records their own donation and reads it back to see
-- whether it was confirmed. They cannot change it afterwards: there is no
-- update or delete policy for them, and confirming is an admin act that the
-- review trigger attributes to the admin who performed it.
CREATE POLICY "Signed-in visitors record their own donation" ON public.initiative_donations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Donors read their own donations" ON public.initiative_donations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- The table stays closed to a visitor who is not signed in, as it was.
REVOKE ALL ON public.initiative_donations FROM anon;

COMMENT ON FUNCTION public.initiative_new_donation() IS
  'Forces a new donation to be an unreviewed claim by the signed-in account, and refuses a project the public page does not offer.';

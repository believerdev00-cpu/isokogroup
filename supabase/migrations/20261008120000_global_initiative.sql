-- ISOKO Groups Global Initiative — "$1 One Project"
--
-- A giving programme that funds one real project at a time across five focus
-- areas. This migration adds only what the initiative needs; nothing existing
-- is altered, and no row of customer data is read or written.
--
-- What it creates:
--   initiative_projects     an application, and the project it becomes
--   initiative_donations    manually verified contributions (not collected yet)
--   initiative_allocations  append-only record of how a donation was allocated
--   initiative_public_projects  the only columns the public may ever read
--
-- Money is whole Rwandan francs, like every other amount on the site. "$1" is
-- the campaign's name, not a currency: no US dollars are stored, and nothing
-- here converts between currencies.
--
-- A project's funding raised is deliberately NOT a column. It is always summed
-- from confirmed donations, so the donation records remain the single source of
-- financial truth and can never drift from what the site shows.
--
-- Donations are closed. The tables exist so the admin work can be built and
-- reviewed, but no policy lets anyone insert a donation from the website, and
-- the public page says donations are not yet open.

-- ============== CLASSIFICATION ==============
-- Focus area -> subcategory -> item. The third level is optional and only
-- Unemployment Reduction uses it. The website holds the same list in
-- src/lib/initiative.ts to draw the menus; this function is what actually
-- decides, so a bad combination cannot be stored by any route into the
-- database. Keep the two in step when the areas change.
CREATE OR REPLACE FUNCTION public.initiative_valid_classification(
  _area text, _subcategory text, _item text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('entrepreneurship', 'logistics',                 NULL),
      ('entrepreneurship', 'packaging',                 NULL),
      ('entrepreneurship', 'travel_agency',             NULL),
      ('entrepreneurship', 'undergraduates',            NULL),
      ('entrepreneurship', 'innovative_business_ideas', NULL),

      ('arts', 'music',              NULL),
      ('arts', 'cinema_film',        NULL),
      ('arts', 'architecture',       NULL),
      ('arts', 'literature',         NULL),
      ('arts', 'painting',           NULL),
      ('arts', 'other_related_arts', NULL),

      ('agriculture', 'agroforestry',             NULL),
      ('agriculture', 'regenerative_agriculture', NULL),
      ('agriculture', 'conservation_agriculture', NULL),

      ('unemployment_reduction', 'technical_upskilling',    'bootcamps'),
      ('unemployment_reduction', 'technical_upskilling',    'vocational_trades'),
      ('unemployment_reduction', 'technical_upskilling',    'carpentry'),
      ('unemployment_reduction', 'technical_upskilling',    'plumbing'),
      ('unemployment_reduction', 'technical_upskilling',    'coding'),
      ('unemployment_reduction', 'technical_upskilling',    'digital_literacy'),
      ('unemployment_reduction', 'soft_skills_development', 'workplace_communication'),
      ('unemployment_reduction', 'soft_skills_development', 'time_management'),
      ('unemployment_reduction', 'soft_skills_development', 'professional_adaptability'),
      ('unemployment_reduction', 'certifications',          'certification_exam_fees'),
      ('unemployment_reduction', 'certifications',          'recognized_credentials'),

      ('research', 'economy',          NULL),
      ('research', 'education',        NULL),
      ('research', 'population',       NULL),
      ('research', 'agriculture',      NULL),
      ('research', 'tourism',          NULL),
      ('research', 'business',         NULL),
      ('research', 'housing_property', NULL),
      ('research', 'health',           NULL),
      ('research', 'technology',       NULL),
      ('research', 'logistics_trade',  NULL)
    ) AS allowed(area, subcategory, item)
    WHERE allowed.area = _area
      AND allowed.subcategory = _subcategory
      AND allowed.item IS NOT DISTINCT FROM _item
  );
$$;

COMMENT ON FUNCTION public.initiative_valid_classification(text, text, text) IS
  'True when focus area -> subcategory -> item is one of the approved combinations. The third level is required only under Unemployment Reduction, and must be absent elsewhere.';

-- ============== PROJECTS ==============
-- A row starts as an application ('submitted') and becomes the project itself.
-- ISOKO's own projects are the same shape with user_id NULL.
CREATE TABLE public.initiative_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The applicant. SET NULL so closing an account never erases a public
  -- project record; NULL also means a project ISOKO runs itself.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  focus_area text NOT NULL,
  subcategory text NOT NULL,
  item text,

  title text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,

  -- The funding target, in whole RWF. What has been raised is summed from
  -- confirmed donations by initiative_raised(), never stored here.
  amount_required integer NOT NULL CHECK (amount_required > 0),

  status text NOT NULL DEFAULT 'submitted' CHECK (status IN
    ('submitted', 'rejected', 'approved', 'seeking_support', 'funded', 'in_progress', 'completed')),

  -- Publication is separate from status: an approved project stays invisible
  -- until an admin publishes it, and can be hidden again without losing its
  -- place in the lifecycle. Hiding is how a project is paused.
  published boolean NOT NULL DEFAULT false,

  -- The applicant's supporting file, in the private 'initiative' bucket, always
  -- under their own folder. A project picture is not part of this phase: there
  -- is nowhere for anyone to upload one, so there is no column to misuse.
  document_path text,

  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  completion_summary text,
  completed_at timestamptz,
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT initiative_projects_classification
    CHECK (public.initiative_valid_classification(focus_area, subcategory, item)),
  -- A rejection must say why; the applicant is shown this reason.
  CONSTRAINT initiative_projects_rejection_reason
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  -- A completed project must carry what it achieved, when, and who verified it.
  CONSTRAINT initiative_projects_completion
    CHECK (status <> 'completed'
           OR (completed_at IS NOT NULL AND completion_summary IS NOT NULL AND verified_by IS NOT NULL)),
  -- Nothing unapproved is ever publicly visible, whatever the website does.
  CONSTRAINT initiative_projects_publish_requires_approval
    CHECK (published = false
           OR status IN ('seeking_support', 'funded', 'in_progress', 'completed'))
);

CREATE INDEX initiative_projects_public_idx
  ON public.initiative_projects (status, created_at DESC) WHERE published;
CREATE INDEX initiative_projects_user_idx
  ON public.initiative_projects (user_id, created_at DESC);
CREATE INDEX initiative_projects_queue_idx
  ON public.initiative_projects (created_at) WHERE status = 'submitted';

CREATE TRIGGER initiative_projects_updated_at
  BEFORE UPDATE ON public.initiative_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One application under review at a time, the same rule seller applications use.
CREATE UNIQUE INDEX initiative_projects_one_open_application
  ON public.initiative_projects (user_id) WHERE status = 'submitted' AND user_id IS NOT NULL;

-- ============== LIFECYCLE ==============
-- The website cannot be trusted to move a project correctly, so the database
-- decides. A project goes forward only, and 'rejected' and 'completed' are
-- final. Who reviewed, when, and who verified a completion are stamped here
-- rather than sent by the browser, so they cannot be claimed falsely.
CREATE OR REPLACE FUNCTION public.initiative_guard_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'submitted'       THEN ARRAY['approved', 'rejected']
      WHEN 'approved'        THEN ARRAY['seeking_support']
      WHEN 'seeking_support' THEN ARRAY['funded']
      WHEN 'funded'          THEN ARRAY['in_progress']
      WHEN 'in_progress'     THEN ARRAY['completed']
      ELSE ARRAY[]::text[]
    END;

    IF NOT (NEW.status = ANY (allowed)) THEN
      RAISE EXCEPTION 'A % project cannot become %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'rejected' THEN
      IF NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '' THEN
        RAISE EXCEPTION 'Give a reason for the rejection' USING ERRCODE = 'check_violation';
      END IF;
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    ELSIF NEW.status = 'approved' THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
      NEW.rejection_reason := NULL;
    ELSIF NEW.status = 'completed' THEN
      IF NEW.completion_summary IS NULL OR btrim(NEW.completion_summary) = '' THEN
        RAISE EXCEPTION 'Record what the project achieved before completing it' USING ERRCODE = 'check_violation';
      END IF;
      NEW.completed_at := now();
      NEW.verified_by := auth.uid();
    END IF;
  END IF;

  -- An applicant's own account is never reassigned by an edit.
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END $$;

CREATE TRIGGER initiative_projects_lifecycle
  BEFORE UPDATE ON public.initiative_projects
  FOR EACH ROW EXECUTE FUNCTION public.initiative_guard_lifecycle();

-- A new row always starts at the beginning, whoever creates it.
--
-- The attached file is checked here too. The browser chooses the path it sends,
-- so without this an applicant could point their application at a file in
-- someone else's folder: they still could not read it, but an admin opening the
-- application would be shown another applicant's private document believing it
-- belonged to this one. A path must therefore sit in the applicant's own folder.
CREATE OR REPLACE FUNCTION public.initiative_new_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.status := 'submitted';
  NEW.published := false;
  NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.rejection_reason := NULL;
  NEW.completion_summary := NULL; NEW.completed_at := NULL; NEW.verified_by := NULL;

  IF NEW.document_path IS NOT NULL
     AND NEW.document_path <> COALESCE(NEW.user_id::text, '') || '/' ||
         split_part(NEW.document_path, '/', 2)
  THEN
    RAISE EXCEPTION 'A supporting document must be your own upload'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Two levels exactly: "<user id>/<file>", nothing deeper and nothing at the root.
  IF NEW.document_path IS NOT NULL
     AND (array_length(string_to_array(NEW.document_path, '/'), 1) <> 2
          OR split_part(NEW.document_path, '/', 2) = '')
  THEN
    RAISE EXCEPTION 'A supporting document must be your own upload'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER initiative_projects_new
  BEFORE INSERT ON public.initiative_projects
  FOR EACH ROW EXECUTE FUNCTION public.initiative_new_project();

-- ============== DONATIONS ==============
-- Manual payments only: a donor sends the money, submits the transaction
-- reference, and an admin confirms it against the real statement. Nothing is
-- ever confirmed automatically, and only 'confirmed' rows count as money.
--
-- Collection is not open. No policy below lets anon or a signed-in visitor
-- insert a row, so the website cannot take a donation even by accident. When
-- the company's real Mobile Money and bank details are confirmed, a later
-- migration adds the insert policy and the page opens.
CREATE TABLE public.initiative_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Whole Rwandan francs.
  amount integer NOT NULL CHECK (amount > 0),

  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  donor_name text,
  donor_email text,
  anonymous boolean NOT NULL DEFAULT false,

  payment_method text NOT NULL CHECK (payment_method IN ('momo', 'bank')),
  reference text NOT NULL,

  -- NULL = a general donation, confirmed but not yet given to a project.
  project_id uuid REFERENCES public.initiative_projects (id) ON DELETE SET NULL,
  -- true when the donor chose the project; false when an admin allocated it.
  designated_by_donor boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),

  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,

  -- Leaving 'pending' is an admin's act, and is always attributed.
  CONSTRAINT initiative_donations_reviewed
    CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

-- One transaction can never be credited twice. Rejected rows are excluded so a
-- genuine reference can be sent again after a mistaken rejection.
CREATE UNIQUE INDEX initiative_donations_reference_key
  ON public.initiative_donations (lower(btrim(reference))) WHERE status <> 'rejected';
CREATE INDEX initiative_donations_queue_idx
  ON public.initiative_donations (status, submitted_at);
CREATE INDEX initiative_donations_project_idx
  ON public.initiative_donations (project_id) WHERE status = 'confirmed';

-- ============== ALLOCATIONS ==============
-- Append-only. A general donation can never be moved to a project, or between
-- projects, without leaving this record of who moved it and why.
CREATE TABLE public.initiative_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL REFERENCES public.initiative_donations (id) ON DELETE CASCADE,
  from_project_id uuid REFERENCES public.initiative_projects (id) ON DELETE SET NULL,
  to_project_id uuid REFERENCES public.initiative_projects (id) ON DELETE SET NULL,
  allocated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX initiative_allocations_donation_idx
  ON public.initiative_allocations (donation_id, created_at);

-- ============== WHAT HAS BEEN RAISED ==============
-- Summed from confirmed donations every time it is asked for. It returns one
-- number and never a donation row, so the public page can show a project's
-- progress without any donor's details being readable.
-- It answers for a published project, or for an admin asking about any of them.
-- Anything else is 0, so the figure for a project that is still being reviewed
-- cannot be read by asking for it directly.
CREATE OR REPLACE FUNCTION public.initiative_raised(_project uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(d.amount), 0)::bigint
    FROM public.initiative_donations d
   WHERE d.project_id = _project
     AND d.status = 'confirmed'
     AND EXISTS (
       SELECT 1 FROM public.initiative_projects p
        WHERE p.id = _project AND (p.published OR public.is_admin())
     );
$$;

COMMENT ON FUNCTION public.initiative_raised(uuid) IS
  'Whole RWF confirmed for a published project. Pending and rejected donations never count.';

-- ============== ROW-LEVEL SECURITY ==============
ALTER TABLE public.initiative_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiative_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiative_allocations ENABLE ROW LEVEL SECURITY;

-- Projects: an applicant reads their own rows and an admin reads them all.
-- Nobody reads this table to see what is published — the public goes through
-- initiative_public_projects below, which is the only place the whole row is
-- narrowed down to the columns a visitor may see. A signed-in visitor must not
-- be able to read another applicant's document, rejection reason or account id
-- just because their project is on the website.
CREATE POLICY "Applicants and admins read projects" ON public.initiative_projects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Applying. The triggers force a new row to 'submitted' and unpublished, so
-- the only thing this has to settle is that the row belongs to the applicant.
CREATE POLICY "Signed-in visitors apply for themselves" ON public.initiative_projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- An applicant cannot edit or withdraw an application; an admin corrects it.
CREATE POLICY "Admins manage projects" ON public.initiative_projects
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Donations and allocations are admin-only, and nobody can insert a donation:
-- there is no insert policy, and collection is closed.
CREATE POLICY "Admins read donations" ON public.initiative_donations
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins manage donations" ON public.initiative_donations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins read allocations" ON public.initiative_allocations
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins record allocations" ON public.initiative_allocations
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- The log is never rewritten, not even by an admin.
REVOKE UPDATE, DELETE ON public.initiative_allocations FROM anon, authenticated;
-- A visitor who is not signed in never touches these tables at all: the public
-- page reads the view below, and nothing else.
REVOKE ALL ON public.initiative_projects FROM anon;
REVOKE ALL ON public.initiative_donations FROM anon;
REVOKE ALL ON public.initiative_allocations FROM anon;

-- ============== WHAT THE PUBLIC MAY READ ==============
-- Row-level security chooses rows, not columns, so the public reads projects
-- through this view and never through the table. The applicant's account, their
-- document, the reason a project was rejected and every reviewer's name are not
-- columns of it, so there is no query that returns them to a visitor.
--
-- The view runs as its owner on purpose: that is what lets a visitor who is not
-- signed in read it at all, now that the table itself is closed to them. Its
-- own WHERE is therefore the whole of the rule, and it is the narrow one —
-- published projects only.
CREATE VIEW public.initiative_public_projects AS
  SELECT id, title, description, focus_area, subcategory, item, location,
         amount_required, status,
         public.initiative_raised(id) AS amount_raised,
         completion_summary, completed_at, created_at
    FROM public.initiative_projects
   WHERE published;

GRANT SELECT ON public.initiative_public_projects TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiative_raised(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiative_valid_classification(text, text, text) TO anon, authenticated;

COMMENT ON VIEW public.initiative_public_projects IS
  'The only columns of a Global Initiative project the website may show publicly.';

-- ============== SUPPORTING DOCUMENTS ==============
-- An applicant may attach a plan or a quote. It is private: the applicant and
-- an admin can open it, nobody else, and it is never served from a public URL.
-- Objects are stored under <user id>/<file>, the same shape as ID documents.
--
-- The size and the kinds of file are settled here, not in the browser: the
-- website's own limits can be stepped around by calling storage directly, and
-- an upload needs no project row, so without these an account could fill the
-- bucket with anything.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('initiative', 'initiative', false, 5242880,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Applicants upload their own initiative documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'initiative' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Applicants read their own initiative documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'initiative'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY "Admins manage initiative documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'initiative' AND public.is_admin())
  WITH CHECK (bucket_id = 'initiative' AND public.is_admin());

-- ============== NOTIFICATIONS ==============
-- Admins are told about a new application, and the applicant is told what was
-- decided, through the notifications the site already uses. Nothing here sends
-- an email or a message: it writes the same in-app notice as everything else.
CREATE OR REPLACE FUNCTION public.initiative_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  notice text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      SELECT ur.user_id, 'New Global Initiative application', NEW.title, 'warning', '/admin'
        FROM public.user_roles ur WHERE ur.role = 'admin';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
    notice := CASE NEW.status
      WHEN 'approved'        THEN 'Your Global Initiative project has been approved.'
      WHEN 'rejected'        THEN 'Your application was not approved. Reason: ' || COALESCE(NEW.rejection_reason, '')
      WHEN 'seeking_support' THEN 'Your project is now seeking support.'
      WHEN 'funded'          THEN 'Funding for your project is complete.'
      WHEN 'in_progress'     THEN 'Work on your project has started.'
      WHEN 'completed'       THEN 'Your project has been recorded as completed.'
      ELSE NULL
    END;
    IF notice IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (NEW.user_id, 'Global Initiative', notice,
              CASE WHEN NEW.status = 'rejected' THEN 'warning' ELSE 'success' END,
              '/global-initiative');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER initiative_projects_notify
  AFTER INSERT OR UPDATE ON public.initiative_projects
  FOR EACH ROW EXECUTE FUNCTION public.initiative_notify();

COMMENT ON TABLE public.initiative_projects IS 'Global Initiative applications and the projects they become.';
COMMENT ON TABLE public.initiative_donations IS 'Contributions to the Global Initiative. Confirmed by an admin against the real payment; collection is not open yet.';
COMMENT ON TABLE public.initiative_allocations IS 'Append-only record of how a confirmed donation was allocated.';

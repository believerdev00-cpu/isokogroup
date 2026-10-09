-- Comments on the things the public can actually see: Information Hub articles,
-- published Global Initiative projects, and marketplace products.
--
-- Nothing appears until somebody approves it. That is the whole design: an
-- unmoderated comment box on a company site becomes a spam board within days,
-- and the cost of moderation is paid once by staff instead of forever by
-- readers.

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What is being commented on. The pair is checked by
  -- comment_subject_is_open() below, so a comment cannot be attached to
  -- something the commenter could not see in the first place.
  subject_type text NOT NULL
    CHECK (subject_type IN ('research_item', 'initiative_project', 'product')),
  subject_id uuid NOT NULL,

  -- One level of replies, no deeper. A thread that nests forever is a thread
  -- nobody can read on a phone.
  parent_id uuid REFERENCES public.comments (id) ON DELETE CASCADE,

  -- Null for someone not signed in.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  display_name text NOT NULL,
  -- Optional, and never public: it exists so staff can reply to a question.
  email text,

  body text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'hidden', 'removed')),

  -- 'admin' or 'owner' when the author was one at the time of writing, so a
  -- reply from the company reads as one. Decided by the server, never sent.
  author_badge text CHECK (author_badge IS NULL OR author_badge IN ('admin', 'owner')),

  moderated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  moderated_at timestamptz,
  moderation_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_subject_idx ON public.comments (subject_type, subject_id, created_at DESC)
  WHERE status = 'approved';
CREATE INDEX comments_queue_idx ON public.comments (created_at DESC) WHERE status = 'pending';
CREATE INDEX comments_mine_idx ON public.comments (user_id, created_at DESC);
CREATE INDEX comments_parent_idx ON public.comments (parent_id);

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== WHAT MAY BE COMMENTED ON ==============
-- True when the thing exists and the public can see it. Commenting on a hidden
-- row would otherwise tell somebody it exists.
CREATE OR REPLACE FUNCTION public.comment_subject_is_open(_type text, _id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF _type = 'research_item' THEN
    RETURN EXISTS (SELECT 1 FROM public.research_items i
                    WHERE i.id = _id AND public.ent_is_public(i.status, i.publish_at));
  ELSIF _type = 'initiative_project' THEN
    RETURN EXISTS (SELECT 1 FROM public.initiative_projects p
                    WHERE p.id = _id AND p.published);
  ELSIF _type = 'product' THEN
    RETURN EXISTS (SELECT 1 FROM public.products pr
                    WHERE pr.id = _id AND pr.status = 'active');
  END IF;
  RETURN false;
END $fn$;

-- 'owner' when the signed-in person owns the thing being discussed, so their
-- reply can be marked as coming from the seller or the project holder.
CREATE OR REPLACE FUNCTION public.comment_author_badge(_type text, _id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF public.is_admin() THEN RETURN 'admin'; END IF;
  IF _type = 'product' AND EXISTS (
       SELECT 1 FROM public.products p WHERE p.id = _id AND p.seller_id = auth.uid())
  THEN RETURN 'owner'; END IF;
  IF _type = 'initiative_project' AND EXISTS (
       SELECT 1 FROM public.initiative_projects p WHERE p.id = _id AND p.user_id = auth.uid())
  THEN RETURN 'owner'; END IF;
  RETURN NULL;
END $fn$;

-- ============== WHO MAY DO WHAT ==============
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins moderate comments" ON public.comments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- An author can see their own while it waits, so "awaiting approval" is honest
-- rather than a comment that seems to vanish.
CREATE POLICY "Authors read their own comments" ON public.comments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- The table itself is closed. The public reads the view below.
REVOKE ALL ON public.comments FROM anon;

-- ============== WHAT THE PUBLIC READS ==============
-- Approved comments only, and without the author email or account id: a
-- comment is a thing somebody said, not a way to enumerate who said it.
CREATE VIEW public.public_comments AS
  SELECT id, subject_type, subject_id, parent_id, display_name, body,
         author_badge, created_at
    FROM public.comments
   WHERE status = 'approved';

-- Supabase grants every new object in this schema to anon and authenticated by
-- default, and a view over a single table is auto-updatable, so that default
-- alone would let a visitor INSERT, UPDATE or DELETE through this view -- as
-- the view owner, bypassing row-level security underneath. The default has to
-- be taken away before SELECT is granted back.
REVOKE ALL ON public.public_comments FROM anon, authenticated;
GRANT SELECT ON public.public_comments TO anon, authenticated;

COMMENT ON VIEW public.public_comments IS
  'Approved comments as the public sees them. Carries no author email and no account id.';

-- ============== WRITING ONE ==============
-- The only way in. It decides the status, the account and the badge, so a
-- comment cannot arrive pre-approved or wearing an admin badge it was sent with.
CREATE OR REPLACE FUNCTION public.comment_submit(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.comments;
  v_type text := nullif(btrim(coalesce(p ->> 'subject_type', '')), '');
  v_subject uuid;
  v_parent uuid;
  v_name text;
  v_email text;
BEGIN
  IF v_type NOT IN ('research_item', 'initiative_project', 'product') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That cannot be commented on';
  END IF;

  BEGIN
    v_subject := (p ->> 'subject_id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That cannot be commented on';
  END;

  IF NOT public.comment_subject_is_open(v_type, v_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That cannot be commented on';
  END IF;

  -- A reply must answer an approved, top-level comment on the same thing.
  -- Without all three a reply could be used to reach a hidden comment, to nest
  -- without end, or to appear under something it was not written about.
  IF nullif(btrim(coalesce(p ->> 'parent_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_parent := (p ->> 'parent_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That reply has nowhere to go';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.comments c
       WHERE c.id = v_parent AND c.status = 'approved' AND c.parent_id IS NULL
         AND c.subject_type = v_type AND c.subject_id = v_subject
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That reply has nowhere to go';
    END IF;
  END IF;

  v_name := nullif(btrim(coalesce(p ->> 'display_name', '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please give a name to show with your comment';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That name is too long';
  END IF;

  v_email := nullif(btrim(coalesce(p ->> 'email', '')), '');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please check the email address';
  END IF;

  INSERT INTO public.comments (
    subject_type, subject_id, parent_id, user_id, display_name, email, body,
    status, author_badge
  ) VALUES (
    v_type, v_subject, v_parent, auth.uid(), v_name, v_email,
    public.svc_text(p, 'body', 'Comment', 2000),
    'pending',
    public.comment_author_badge(v_type, v_subject)
  ) RETURNING * INTO r;

  RETURN jsonb_build_object('id', r.id, 'status', r.status);
END $fn$;

COMMENT ON FUNCTION public.comment_submit(jsonb) IS
  'Records a comment, always as pending. Decides the account, the status and the author badge itself, and refuses a subject the public cannot see or a reply that does not answer an approved top-level comment on the same thing.';

GRANT EXECUTE ON FUNCTION public.comment_submit(jsonb) TO anon, authenticated;

-- The same spam protection every other public form uses, tightened: comments
-- are the cheapest thing on the site to abuse.
CREATE TRIGGER rate_limit BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_new_rows('15');

-- What somebody wrote is theirs. Moderating records the decision and who made
-- it; it does not rewrite the comment, its author or what it was about.
CREATE OR REPLACE FUNCTION public.comment_guard_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.subject_type := OLD.subject_type;
  NEW.subject_id := OLD.subject_id;
  NEW.parent_id := OLD.parent_id;
  NEW.user_id := OLD.user_id;
  NEW.display_name := OLD.display_name;
  NEW.email := OLD.email;
  NEW.body := OLD.body;
  NEW.author_badge := OLD.author_badge;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.moderated_by := auth.uid();
    NEW.moderated_at := now();
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER comments_moderation
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comment_guard_moderation();

-- ============== TELLING THE OFFICE ==============
CREATE OR REPLACE FUNCTION public.notify_new_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE admin_user RECORD;
BEGIN
  FOR admin_user IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (admin_user.user_id, 'A comment is waiting',
            NEW.display_name || ' commented: ' || left(NEW.body, 80), 'info', '/admin');
  END LOOP;
  RETURN NEW;
END $fn$;

CREATE TRIGGER comments_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_comment();

-- Who approved what, and when. By an allow-list for the same reason the contact
-- messages use one: the log is append-only, and a comment body and an author
-- email written there could never be erased.
CREATE OR REPLACE FUNCTION public.comment_audit_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old jsonb; v_new jsonb; v_row jsonb;
  v_allowed text[] := ARRAY['id', 'subject_type', 'subject_id', 'parent_id', 'user_id',
                            'status', 'author_badge', 'moderated_by', 'moderated_at', 'created_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    SELECT jsonb_object_agg(n.key, n.value) INTO v_new
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM v_old -> n.key;
    IF v_new IS NULL THEN RETURN NULL; END IF;
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
  VALUES (auth.uid(), public.audit_actor_role(), lower(TG_OP), TG_TABLE_NAME, v_row ->> 'id',
          v_old, v_new, nullif(current_setting('isoko.audit_reason', true), ''));
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS audit_changes ON public.comments;
CREATE TRIGGER audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comment_audit_change();

-- "Contact ISOKO Groups": enquiries, suggestions, complaints and business
-- questions from anyone, without an account.
--
-- A message is private correspondence. Only admins read it, the sender can see
-- their own if they happened to be signed in, and nothing here is ever public.

CREATE SEQUENCE IF NOT EXISTS public.contact_ref_seq;

CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE
    DEFAULT 'ISO-MSG-' || lpad(nextval('public.contact_ref_seq')::text, 5, '0'),

  -- Null for someone who was not signed in. Nobody should have to register to
  -- complain, and a complaint that needs an account is one you never hear.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  full_name text NOT NULL,
  email text NOT NULL,
  phone text,

  topic text NOT NULL
    CHECK (topic IN ('enquiry', 'suggestion', 'complaint', 'business', 'other')),
  subject text NOT NULL,
  message text NOT NULL,

  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'closed')),
  staff_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_messages_new_idx ON public.contact_messages (created_at DESC) WHERE status = 'new';
CREATE INDEX contact_messages_mine_idx ON public.contact_messages (user_id, created_at DESC);

CREATE TRIGGER contact_messages_updated_at
  BEFORE UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== WHO MAY DO WHAT ==============
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contact messages" ON public.contact_messages
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Someone signed in when they wrote can see what they sent and whether it was
-- answered. They cannot change it: there is no update policy for them, and no
-- insert policy either -- writing goes through the function below.
CREATE POLICY "Senders read their own messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Private correspondence: nothing here is readable without signing in, and
-- even then only your own.
REVOKE ALL ON public.contact_messages FROM anon;

-- ============== WRITING ==============
-- The only way in. It decides the account and the status, so a message cannot
-- arrive already marked answered or carrying staff notes.
CREATE OR REPLACE FUNCTION public.contact_submit_message(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.contact_messages;
  v_topic text;
  v_phone text;
BEGIN
  v_topic := lower(coalesce(nullif(btrim(p ->> 'topic'), ''), 'enquiry'));
  IF v_topic NOT IN ('enquiry', 'suggestion', 'complaint', 'business', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what your message is about';
  END IF;

  v_phone := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Phone is too long';
  END IF;

  INSERT INTO public.contact_messages (user_id, full_name, email, phone, topic, subject, message)
  VALUES (
    auth.uid(),
    public.svc_text(p, 'full_name', 'Your name', 120),
    public.svc_email(p),
    v_phone,
    v_topic,
    public.svc_text(p, 'subject', 'Subject', 160),
    public.svc_text(p, 'message', 'Message', 5000)
  ) RETURNING * INTO r;

  RETURN jsonb_build_object('reference', r.reference);
END $fn$;

COMMENT ON FUNCTION public.contact_submit_message(jsonb) IS
  'Records a message to ISOKO Groups. Sets the account and the status itself, so a message cannot arrive pre-answered or carrying staff notes.';

GRANT EXECUTE ON FUNCTION public.contact_submit_message(jsonb) TO anon, authenticated;

-- The same spam protection every other public form uses: per address, and per
-- account as well when there is one.
CREATE TRIGGER rate_limit BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_new_rows('10');

-- ============== TELLING THE OFFICE ==============
CREATE OR REPLACE FUNCTION public.notify_contact_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE admin_user RECORD;
BEGIN
  FOR admin_user IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (admin_user.user_id, 'New message to ISOKO Groups',
            initcap(NEW.topic) || ': ' || left(NEW.subject, 80) || ' (' || NEW.reference || ')',
            CASE WHEN NEW.topic = 'complaint' THEN 'warning' ELSE 'info' END,
            '/admin');
  END LOOP;
  RETURN NEW;
END $fn$;

CREATE TRIGGER contact_messages_notify
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_contact_message();

-- What the sender wrote is theirs. An admin answers it and records how far that
-- got; they do not rewrite the message, the sender or the reference.
CREATE OR REPLACE FUNCTION public.contact_guard_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.reference := OLD.reference;
  NEW.user_id := OLD.user_id;
  NEW.full_name := OLD.full_name;
  NEW.email := OLD.email;
  NEW.phone := OLD.phone;
  NEW.topic := OLD.topic;
  NEW.subject := OLD.subject;
  NEW.message := OLD.message;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER contact_messages_review
  BEFORE UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_guard_review();

-- Somebody complains, and later somebody says nobody ever did. The log should
-- remember who read it, who answered and when.
--
-- But not what they wrote. The shared audit_row_change() copies the whole row,
-- and the audit log is append-only -- nothing, not even the service role, can
-- delete from it. Putting a complainant name, email, phone and the body of
-- their message in there would make every one of those permanent and
-- unerasable, which is a worse problem than the one the log solves. So the
-- columns are chosen by an allow-list, the same way donations are, and a column
-- added later is excluded until somebody decides it belongs.
CREATE OR REPLACE FUNCTION public.contact_audit_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_allowed text[] := ARRAY[
    'id', 'reference', 'user_id', 'topic', 'status',
    'reviewed_by', 'reviewed_at', 'created_at'
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
END $fn$;

COMMENT ON FUNCTION public.contact_audit_change() IS
  'Audits who handled a message and how, by an allow-list: the sender name, email, phone, subject and body never reach the append-only log, where they could not be erased.';

DROP TRIGGER IF EXISTS audit_changes ON public.contact_messages;
CREATE TRIGGER audit_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_audit_change();

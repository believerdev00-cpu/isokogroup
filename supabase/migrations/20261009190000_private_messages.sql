-- Private messages between signed-in people: a buyer and a seller about a
-- product, or anybody and the ISOKO office.
--
-- Everything here turns on one question -- is this person in this conversation
-- -- and that question is answered by in_conversation() below rather than by
-- anything the browser sends. A conversation id in a request proves nothing.
--
-- Anonymous visitors are not part of this. They have the contact form, which is
-- what it is for.

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  -- What it is about, when it is about something. Kept so a seller can see
  -- which product a question refers to.
  about_product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  started_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Moved forward by the trigger below, so an inbox can be sorted without
  -- reading every message.
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Everything after this moment is unread for this person.
  last_read_at timestamptz NOT NULL DEFAULT to_timestamp(0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_recent_idx ON public.conversations (last_message_at DESC);
CREATE INDEX participants_mine_idx ON public.conversation_participants (user_id);
CREATE INDEX messages_thread_idx ON public.messages (conversation_id, created_at);

-- ============== THE ONLY QUESTION THAT MATTERS ==============
-- SECURITY DEFINER on purpose. A policy on conversation_participants that
-- asked conversation_participants the same question would recurse forever;
-- this runs outside row-level security and so breaks the loop. It reads
-- auth.uid() rather than taking a user id from the caller, which is what stops
-- somebody asking about a conversation they are not in.
CREATE OR REPLACE FUNCTION public.in_conversation(_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants p
     WHERE p.conversation_id = _conversation AND p.user_id = auth.uid()
  );
$fn$;

COMMENT ON FUNCTION public.in_conversation(uuid) IS
  'True when the signed-in person is a participant. SECURITY DEFINER so the participants policy can use it without recursing; it never takes a user id from the caller.';

-- ============== WHO MAY SEE WHAT ==============
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- A conversation is visible only to the people in it. Admins are not given a
-- blanket view: being an administrator is not a reason to read somebody else
-- private correspondence, and an admin who needs to be in a conversation is
-- added to it.
CREATE POLICY "Participants read their conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.in_conversation(id));

CREATE POLICY "Participants read who else is here" ON public.conversation_participants
  FOR SELECT TO authenticated USING (public.in_conversation(conversation_id));

-- Marking your own place in a thread. Only your own row, and only the moment.
CREATE POLICY "Participants mark their own place" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants read the messages" ON public.messages
  FOR SELECT TO authenticated USING (public.in_conversation(conversation_id));

-- Writing into a conversation you are in, as yourself. The trigger below pins
-- the sender regardless, so a forged sender_id changes nothing.
CREATE POLICY "Participants write messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.in_conversation(conversation_id) AND sender_id = auth.uid());

-- Nothing is readable or writable without signing in, and a message once sent
-- cannot be edited or withdrawn: there is no update or delete policy for it.
REVOKE ALL ON public.conversations FROM anon;
REVOKE ALL ON public.conversation_participants FROM anon;
REVOKE ALL ON public.messages FROM anon;

-- ============== STARTING ONE ==============
-- Conversations are not created directly: who may talk to whom is a rule, not
-- a preference. A seller may be written to about a product they actually sell;
-- the office may always be written to.
CREATE OR REPLACE FUNCTION public.message_start(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_with text := nullif(btrim(coalesce(p ->> 'with', '')), '');
  v_product uuid;
  v_target uuid;
  v_conv public.conversations;
  v_admin RECORD;
  v_added int := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to send a message';
  END IF;

  IF v_with = 'seller' THEN
    BEGIN
      v_product := (p ->> 'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That product cannot be asked about';
    END;
    -- The seller is read from the product, never taken from the request.
    SELECT pr.seller_id INTO v_target FROM public.products pr
     WHERE pr.id = v_product AND pr.status = 'active';
    IF v_target IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That product cannot be asked about';
    END IF;
    IF v_target = v_me THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That is your own product';
    END IF;
  ELSIF v_with <> 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose who to write to';
  END IF;

  INSERT INTO public.conversations (subject, about_product_id, started_by)
  VALUES (public.svc_text(p, 'subject', 'Subject', 160), v_product, v_me)
  RETURNING * INTO v_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv.id, v_me);

  IF v_with = 'seller' THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv.id, v_target);
    v_added := 1;
  ELSE
    FOR v_admin IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LOOP
      IF v_admin.user_id <> v_me THEN
        INSERT INTO public.conversation_participants (conversation_id, user_id)
        VALUES (v_conv.id, v_admin.user_id)
        ON CONFLICT DO NOTHING;
        v_added := v_added + 1;
      END IF;
    END LOOP;
    IF v_added = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is nobody to receive this just now';
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (v_conv.id, v_me, public.svc_text(p, 'body', 'Message', 5000));

  RETURN jsonb_build_object('conversation_id', v_conv.id);
END $fn$;

GRANT EXECUTE ON FUNCTION public.message_start(jsonb) TO authenticated;

-- Marking a thread read. Only your own row, and only forward.
CREATE OR REPLACE FUNCTION public.message_mark_read(_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.in_conversation(_conversation) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'That conversation is not yours';
  END IF;
  UPDATE public.conversation_participants
     SET last_read_at = now()
   WHERE conversation_id = _conversation AND user_id = auth.uid();
END $fn$;

GRANT EXECUTE ON FUNCTION public.message_mark_read(uuid) TO authenticated;

-- ============== SENDING ==============
-- The sender is whoever is signed in, whatever the request claims.
CREATE OR REPLACE FUNCTION public.message_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.sender_id := auth.uid();
  NEW.created_at := now();
  IF NEW.sender_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to send a message';
  END IF;
  IF length(btrim(coalesce(NEW.body, ''))) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Write something first';
  END IF;
  IF length(NEW.body) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That message is too long';
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER messages_before_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.message_before_insert();

CREATE TRIGGER rate_limit BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_new_rows('60');

-- Move the conversation up the inbox, and tell the others.
CREATE OR REPLACE FUNCTION public.message_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  other RECORD;
  v_subject text;
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  SELECT subject INTO v_subject FROM public.conversations WHERE id = NEW.conversation_id;

  FOR other IN
    SELECT p.user_id FROM public.conversation_participants p
     WHERE p.conversation_id = NEW.conversation_id AND p.user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (other.user_id, 'New message', left(coalesce(v_subject, 'A message'), 80), 'info', '/messages');
  END LOOP;
  RETURN NULL;
END $fn$;

CREATE TRIGGER messages_after_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.message_after_insert();

-- ============== THE INBOX ==============
-- One row per conversation this person is in, with what is unread. Written as
-- a function rather than a view so the unread count is counted once, against
-- this person own last_read_at.
CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (
  id uuid, subject text, about_product_id uuid,
  last_message_at timestamptz, unread integer,
  last_body text, last_sender_id uuid, other_names text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.id, c.subject, c.about_product_id, c.last_message_at,
         (SELECT count(*) FROM public.messages m
           WHERE m.conversation_id = c.id
             AND m.created_at > me.last_read_at
             AND m.sender_id IS DISTINCT FROM auth.uid())::int AS unread,
         (SELECT m.body FROM public.messages m
           WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
         (SELECT m.sender_id FROM public.messages m
           WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id,
         (SELECT string_agg(coalesce(pr.full_name, 'Someone'), ', ')
            FROM public.conversation_participants p2
            LEFT JOIN public.profiles pr ON pr.user_id = p2.user_id
           WHERE p2.conversation_id = c.id AND p2.user_id <> auth.uid()) AS other_names
    FROM public.conversations c
    JOIN public.conversation_participants me
      ON me.conversation_id = c.id AND me.user_id = auth.uid()
   ORDER BY c.last_message_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated;

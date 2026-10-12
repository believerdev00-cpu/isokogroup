-- Video that is too big for this project to hold, and free films that were
-- never actually free.
--
-- Two problems, one migration, because they are the same question asked
-- twice: who is allowed to watch this, and where is the answer decided?
--
-- 1. A film cannot be hosted here. The bucket permits 500 MB, the Supabase
--    project permits 50, the smaller wins, and a two-hour film is hundreds.
--    So the video moves to Bunny Stream and the database keeps a video id
--    instead of a storage path.
--
--    That move takes the enforcement with it. Today the subscription gate is
--    a row-level security policy on storage.objects: Storage refuses to sign
--    a link for anyone without an active subscription, and the check in the
--    browser is only there to explain why. A video on someone else's CDN has
--    no such policy, so the rule has to be written down again somewhere the
--    browser cannot reach -- ent_playback_check below, called by an Edge
--    Function that holds the signing key. If that function is wrong, every
--    film is free to anyone who can read a video id.
--
-- 2. is_free never worked for a stored film. The storage policy asks only
--    whether the viewer subscribes; it has never looked at is_free. So a film
--    marked "Free for everyone" is refused to everyone without a
--    subscription, which is the opposite of what the switch says, and the
--    trailer on the live site has been in that state since it was uploaded.
--    Fixed here for stored films by a policy that reads the flag, and for
--    Bunny films by the same rule inside ent_playback_check -- one sentence
--    about who may watch, written twice only because the bytes live in two
--    places.
--
-- Nothing here changes an existing film. No row is updated, no object moved;
-- the two published titles keep the source they have until somebody chooses
-- otherwise.

-- ============== A THIRD KIND OF SOURCE ==============

ALTER TABLE public.ent_titles DROP CONSTRAINT ent_titles_watch_source_check;
ALTER TABLE public.ent_titles ADD CONSTRAINT ent_titles_watch_source_check
  CHECK (watch_source IN ('storage', 'youtube', 'bunny'));

ALTER TABLE public.ent_episodes DROP CONSTRAINT ent_episodes_watch_source_check;
ALTER TABLE public.ent_episodes ADD CONSTRAINT ent_episodes_watch_source_check
  CHECK (watch_source IN ('storage', 'youtube', 'bunny'));

-- Whether the provider has finished transcoding.
--
-- Deliberately not a CHECK against status. The id is written when the upload
-- starts, so that an upload which drops resumes against the same video
-- instead of leaving a second one behind -- which means a title that is
-- already on the website passes briefly through "not ready", and a CHECK
-- would refuse that edit with an error about a constraint. Readiness gates
-- playback instead: an unfinished video is simply not playable, and the page
-- says it is still processing rather than pretending it is broken.
ALTER TABLE public.ent_titles ADD COLUMN watch_ready boolean NOT NULL DEFAULT true;
ALTER TABLE public.ent_episodes ADD COLUMN watch_ready boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ent_titles.watch_ready IS
  'Bunny has finished transcoding. Always true for storage and youtube sources.';
COMMENT ON COLUMN public.ent_episodes.watch_ready IS
  'Bunny has finished transcoding. Always true for storage and youtube sources.';

-- Both the storage policy and the upload path look a row up by its watch_ref.
CREATE INDEX ent_titles_watch_ref ON public.ent_titles (watch_ref) WHERE watch_ref IS NOT NULL;
CREATE INDEX ent_episodes_watch_ref ON public.ent_episodes (watch_ref) WHERE watch_ref IS NOT NULL;

-- ============== FINDING A: A FREE FILM IS FREE ==============

-- Is this stored file a film that is on the website and marked free?
--
-- SECURITY DEFINER for the same reason as the research evidence check: a
-- storage policy is evaluated as the caller, the caller is anon, and anon
-- cannot read ent_titles rows that are not public -- which is correct, and
-- which would make the policy depend on the very rows it is deciding about.
--
-- An episode is free only when its series is also on the website. A free
-- episode of an unpublished series is not published by implication.
CREATE OR REPLACE FUNCTION public.ent_file_is_free_public(_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ent_titles t
     WHERE t.watch_ref = _path AND t.watch_source = 'storage' AND t.is_free
       AND public.ent_is_public(t.status, t.publish_at)
  ) OR EXISTS (
    SELECT 1 FROM public.ent_episodes e JOIN public.ent_titles t ON t.id = e.title_id
     WHERE e.watch_ref = _path AND e.watch_source = 'storage' AND e.is_free
       AND public.ent_is_public(e.status, e.publish_at)
       AND public.ent_is_public(t.status, t.publish_at)
  );
$$;

-- A policy's function must be executable by the role whose policy calls it
-- (20261009200000). anon is the point: a free film is for people with no
-- account at all.
REVOKE EXECUTE ON FUNCTION public.ent_file_is_free_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ent_file_is_free_public(text) TO anon, authenticated, service_role;

-- Added alongside "Subscribers read library files", not instead of it:
-- policies are OR-ed, so subscribers keep everything they had and a visitor
-- gains exactly the free, published films.
CREATE POLICY "Anyone reads free published films" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'entertainment' AND public.ent_file_is_free_public(name));

-- ============== WHO MAY PLAY A BUNNY VIDEO ==============

-- The whole access rule for provider-hosted video, in one place.
--
-- Returns the video id only when the answer is yes, so a caller that forgets
-- to check `allowed` still cannot sign anything. The reason is returned too,
-- because "still processing", "not published" and "subscribe" are three
-- different things to tell somebody and the page used to say one word for
-- all of them.
--
-- SECURITY DEFINER and reads auth.uid() itself: the Edge Function calls this
-- as the caller, exactly as file-access does, so auth.uid() is the viewer and
-- not the service role. It never takes a video id from the client -- only the
-- id of an Isoko record -- so a client cannot name somebody else's video and
-- be handed a token for it.
CREATE OR REPLACE FUNCTION public.ent_playback_check(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source text; v_ref text; v_free boolean; v_ready boolean; v_minutes integer;
  v_public boolean; v_parent_public boolean := true;
BEGIN
  IF p_kind = 'title' THEN
    SELECT t.watch_source, t.watch_ref, t.is_free, t.watch_ready, t.duration_minutes,
           public.ent_is_public(t.status, t.publish_at)
      INTO v_source, v_ref, v_free, v_ready, v_minutes, v_public
      FROM public.ent_titles t WHERE t.id = p_id;
  ELSIF p_kind = 'episode' THEN
    SELECT e.watch_source, e.watch_ref, e.is_free, e.watch_ready, e.duration_minutes,
           public.ent_is_public(e.status, e.publish_at),
           public.ent_is_public(t.status, t.publish_at)
      INTO v_source, v_ref, v_free, v_ready, v_minutes, v_public, v_parent_public
      FROM public.ent_episodes e JOIN public.ent_titles t ON t.id = e.title_id
     WHERE e.id = p_id;
  ELSE
    RETURN jsonb_build_object('allowed', false, 'reason', 'unknown');
  END IF;

  IF v_source IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing');
  END IF;
  -- A draft tells a stranger nothing, not even that it is a draft.
  IF NOT v_public OR NOT v_parent_public THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing');
  END IF;
  IF v_source <> 'bunny' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_hosted');
  END IF;
  IF NOT v_ready THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'processing');
  END IF;
  -- is_free means free, including to somebody with no account. Everything
  -- else is the subscription rule the storage policy has always applied.
  IF NOT v_free AND NOT public.has_active_access(auth.uid()) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'video_id', v_ref, 'minutes', v_minutes);
END $$;

REVOKE EXECUTE ON FUNCTION public.ent_playback_check(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ent_playback_check(text, uuid) TO anon, authenticated, service_role;

-- ============== WHO MAY UPLOAD ONE ==============

-- May this person attach a video to this record, and what is already on it?
--
-- The provider's own documentation warns that its upload endpoints are
-- public and that the caller must be checked on every request and confirmed
-- to own the video before a signature is re-issued. This is that check. The
-- existing id comes back so an interrupted upload resumes into the same
-- video rather than creating a second one and orphaning the first.
CREATE OR REPLACE FUNCTION public.ent_upload_check(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_source text; v_ref text; v_title text; v_found boolean := false;
BEGIN
  IF NOT public.is_service_staff('entertainment') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'forbidden');
  END IF;
  IF p_kind = 'title' THEN
    SELECT t.watch_source, t.watch_ref, t.title, true INTO v_source, v_ref, v_title, v_found
      FROM public.ent_titles t WHERE t.id = p_id;
  ELSIF p_kind = 'episode' THEN
    SELECT e.watch_source, e.watch_ref, e.name, true INTO v_source, v_ref, v_title, v_found
      FROM public.ent_episodes e WHERE e.id = p_id;
  ELSE
    RETURN jsonb_build_object('allowed', false, 'reason', 'unknown');
  END IF;
  IF NOT v_found THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing');
  END IF;
  RETURN jsonb_build_object(
    'allowed', true,
    'title', v_title,
    -- only a Bunny id may be resumed into; a storage path is not a video id
    'video_id', CASE WHEN v_source = 'bunny' THEN v_ref ELSE NULL END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.ent_upload_check(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ent_upload_check(text, uuid) TO authenticated, service_role;

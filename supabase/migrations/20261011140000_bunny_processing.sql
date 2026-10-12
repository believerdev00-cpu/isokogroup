-- A film that failed to convert is not a film that is still converting.
--
-- 20261011130000 gave hosted video one flag, watch_ready, and anything that
-- was not ready was reported as "still being prepared". That is true for the
-- few minutes a conversion takes and false forever afterwards if the host
-- gave up: the host's status 5 (Error) and 6 (UploadFailed) are final, and a
-- page that keeps saying "this will play once that finishes" about a film
-- that will never finish is the same failure this whole thread started with
-- -- a confident message that sends somebody to look in the wrong place.
--
-- So failure gets its own flag. Three states, not two:
--
--   ready            the host finished; it plays
--   not ready        the host is still working; come back shortly
--   failed           the host gave up; it must be uploaded again
--
-- Both flags are set from the host's own answer and never typed in by the
-- desk, and starting a new upload clears them.

ALTER TABLE public.ent_titles ADD COLUMN watch_failed boolean NOT NULL DEFAULT false;
ALTER TABLE public.ent_episodes ADD COLUMN watch_failed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ent_titles.watch_failed IS
  'The video host could not process this file. Final: it has to be uploaded again.';
COMMENT ON COLUMN public.ent_episodes.watch_failed IS
  'The video host could not process this file. Final: it has to be uploaded again.';

-- Unchanged from 20261011130000 but for the failure branch, which has to come
-- before the readiness branch: a film that failed is not merely "not ready".
CREATE OR REPLACE FUNCTION public.ent_playback_check(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source text; v_ref text; v_free boolean; v_ready boolean; v_failed boolean; v_minutes integer;
  v_public boolean; v_parent_public boolean := true;
BEGIN
  IF p_kind = 'title' THEN
    SELECT t.watch_source, t.watch_ref, t.is_free, t.watch_ready, t.watch_failed, t.duration_minutes,
           public.ent_is_public(t.status, t.publish_at)
      INTO v_source, v_ref, v_free, v_ready, v_failed, v_minutes, v_public
      FROM public.ent_titles t WHERE t.id = p_id;
  ELSIF p_kind = 'episode' THEN
    SELECT e.watch_source, e.watch_ref, e.is_free, e.watch_ready, e.watch_failed, e.duration_minutes,
           public.ent_is_public(e.status, e.publish_at),
           public.ent_is_public(t.status, t.publish_at)
      INTO v_source, v_ref, v_free, v_ready, v_failed, v_minutes, v_public, v_parent_public
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
  IF v_failed THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'failed');
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

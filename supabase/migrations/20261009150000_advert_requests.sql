-- "Advertise Here": a business asks ISOKO GROUPS COMPANY LTD to carry its
-- advertising. The request is a lead, nothing more. Nothing is published and
-- nobody is charged by this table; a person reads every one and replies.

CREATE SEQUENCE IF NOT EXISTS public.advert_ref_seq;

CREATE TABLE public.advert_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE
    DEFAULT 'ISO-ADV-' || lpad(nextval('public.advert_ref_seq')::text, 5, '0'),

  -- Null for someone who is not signed in: an advertiser should not have to
  -- make an account to ask a question.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  full_name text NOT NULL,
  company text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  industry text NOT NULL,
  what_to_advertise text NOT NULL,
  placement text NOT NULL,
  duration text NOT NULL,
  -- Whole Rwandan francs, and only ever a proposal. No money moves here.
  budget_rwf integer CHECK (budget_rwf IS NULL OR budget_rwf > 0),
  message text,

  -- Artwork, in the private 'adverts' bucket, always under the uploader own
  -- folder.
  artwork_path text,

  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'accepted', 'declined', 'closed')),
  staff_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX advert_requests_new_idx ON public.advert_requests (created_at DESC) WHERE status = 'new';
CREATE INDEX advert_requests_mine_idx ON public.advert_requests (user_id, created_at DESC);

CREATE TRIGGER advert_requests_updated_at
  BEFORE UPDATE ON public.advert_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== WHO MAY DO WHAT ==============
ALTER TABLE public.advert_requests ENABLE ROW LEVEL SECURITY;

-- Admins read and manage every request.
CREATE POLICY "Admins manage advert requests" ON public.advert_requests
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Someone who was signed in when they asked can see what they sent and how it
-- is getting on. They cannot change it afterwards: there is no update policy
-- for them, and no insert policy either -- submitting goes through the function
-- below, so a crafted request cannot arrive pre-approved or with staff notes.
CREATE POLICY "Advertisers read their own requests" ON public.advert_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Nothing here is readable without signing in.
REVOKE ALL ON public.advert_requests FROM anon;

-- ============== SUBMITTING ==============
-- The only way in. It validates every field, decides the status and the
-- account itself, and is the reason the table needs no insert policy.
CREATE OR REPLACE FUNCTION public.advert_submit_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.advert_requests;
  v_budget integer;
  v_artwork text;
BEGIN
  IF p ->> 'budget_rwf' IS NOT NULL AND btrim(p ->> 'budget_rwf') <> '' THEN
    IF (p ->> 'budget_rwf') !~ '^[0-9]{1,12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the budget as a whole number of francs';
    END IF;
    v_budget := (p ->> 'budget_rwf')::bigint;
    IF v_budget <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Give the budget as a whole number of francs';
    END IF;
  END IF;

  -- Artwork is only ever the uploader own file, in their own folder. Someone
  -- signed out has nowhere to upload to, so they may not name a path at all.
  v_artwork := nullif(btrim(coalesce(p ->> 'artwork_path', '')), '');
  IF v_artwork IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR array_length(string_to_array(v_artwork, '/'), 1) <> 2
       OR split_part(v_artwork, '/', 1) <> auth.uid()::text
       OR split_part(v_artwork, '/', 2) = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An advert image must be your own upload';
    END IF;
  END IF;

  INSERT INTO public.advert_requests (
    user_id, full_name, company, email, phone, industry,
    what_to_advertise, placement, duration, budget_rwf, message, artwork_path
  ) VALUES (
    auth.uid(),
    public.svc_text(p, 'full_name', 'Your name', 120),
    public.svc_text(p, 'company', 'Company or business name', 160),
    public.svc_email(p),
    public.svc_text(p, 'phone', 'Phone or WhatsApp', 40),
    public.svc_text(p, 'industry', 'Type of business', 120),
    public.svc_text(p, 'what_to_advertise', 'What you want to advertise', 2000),
    public.svc_text(p, 'placement', 'Preferred placement', 120),
    public.svc_text(p, 'duration', 'How long', 120),
    v_budget,
    public.svc_text(p, 'message', 'Message', 2000, false),
    v_artwork
  ) RETURNING * INTO r;

  RETURN jsonb_build_object('reference', r.reference);
END $fn$;

COMMENT ON FUNCTION public.advert_submit_request(jsonb) IS
  'Records an advertising enquiry. Sets the account and the status itself, so a request cannot arrive pre-approved or carrying staff notes.';

GRANT EXECUTE ON FUNCTION public.advert_submit_request(jsonb) TO anon, authenticated;

-- The same spam protection every other public form uses: per address, and per
-- account as well when there is one.
CREATE TRIGGER rate_limit BEFORE INSERT ON public.advert_requests
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_new_rows('10');

-- ============== TELLING THE OFFICE ==============
CREATE OR REPLACE FUNCTION public.notify_advert_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE admin_user RECORD;
BEGIN
  FOR admin_user IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (admin_user.user_id, 'New advertising request',
            NEW.company || ' asked about advertising (' || NEW.reference || ')',
            'info', '/admin');
  END LOOP;
  RETURN NEW;
END $fn$;

CREATE TRIGGER advert_requests_notify
  AFTER INSERT ON public.advert_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_advert_request();

-- Reviewing is attributed to whoever did it, the way a donation review is, and
-- the reference and the account are never reassigned by an edit.
CREATE OR REPLACE FUNCTION public.advert_guard_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.reference := OLD.reference;
  NEW.user_id := OLD.user_id;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER advert_requests_review
  BEFORE UPDATE ON public.advert_requests
  FOR EACH ROW EXECUTE FUNCTION public.advert_guard_review();

-- ============== ARTWORK ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('adverts', 'adverts', false, 10 * 1024 * 1024,
        ARRAY['image/jpeg','image/png','image/webp','image/avif','application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Advertisers upload their own artwork" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'adverts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Advertisers read their own artwork" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'adverts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins manage advert artwork" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'adverts' AND public.is_admin())
  WITH CHECK (bucket_id = 'adverts' AND public.is_admin());

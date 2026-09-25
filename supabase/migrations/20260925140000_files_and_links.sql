-- Secure files and customer links
--
-- CUSTOMER LINKS. The private link of a Travel, Consultancy or Data request
-- (its access token) never expired, could not be revoked, and was also the
-- name of the customer's storage folder, so it could not be changed without
-- losing their files. Now:
--   * each request has a fixed files_key for its folder; the link can be reset
--     by staff (the old link stops working, files stay) and is sent again
--   * a link expires 180 days after the request is closed (completed,
--     cancelled, declined); reopening it or resetting the link renews it
--   * the public functions behind the links are rate limited per address
--
-- FILES. Staff opened customers' uploads (passports, datasets) straight from
-- storage: any staff member of the service, any request, and nothing recorded.
-- Now customer uploads and ID documents are opened only through the
-- file-access Edge Function, which checks the rules below and records every
-- opening in the audit log; staff see the files of requests assigned to them
-- (or not yet assigned). Customers' own downloads are recorded too. Delivery
-- proofs were stored as year-long signed links; now the file path is stored
-- and a two-minute link is made each time someone allowed opens it.
--
-- RATE LIMITS. Public forms, customer-link actions and uploads are limited per
-- address (and per account for signed-in forms), generously enough for normal
-- use.

-- ============== RATE LIMITS ==============
CREATE UNLOGGED TABLE public.rate_limit_counters (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
INSERT INTO public.platform_settings (key, value) VALUES ('rate_limit_multiplier', '1');
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC, anon, authenticated, service_role;

-- The caller's address as the API gateway reports it
CREATE OR REPLACE FUNCTION public.request_ip()
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE h json;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN nullif(btrim(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(h ->> 'x-forwarded-for', ',', 1))), '');
END $$;

-- Counts one attempt and refuses once there are more than p_max in the window.
-- Without a key the caller's address is used; callers with no known address
-- share one generous bucket.
CREATE OR REPLACE FUNCTION public.rate_limit(p_bucket text, p_max integer, p_window_seconds integer, p_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := coalesce(nullif(p_key, ''), public.request_ip());
  -- platform_settings.rate_limit_multiplier loosens every limit (e.g. 2 during
  -- a busy event, or much higher on a local test database)
  v_max integer := ceil(p_max * coalesce((SELECT nullif(value, '')::numeric FROM public.platform_settings
                                          WHERE key = 'rate_limit_multiplier' AND value ~ '^[0-9]+(\.[0-9]+)?$'), 1));
  v_start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
BEGIN
  IF v_key IS NULL THEN
    v_key := 'unknown';
    v_max := v_max * 50;
  END IF;
  INSERT INTO public.rate_limit_counters (bucket, key, window_start, hits)
  VALUES (p_bucket, v_key, v_start, 1)
  ON CONFLICT (bucket, key, window_start) DO UPDATE SET hits = rate_limit_counters.hits + 1
  RETURNING hits INTO v_hits;
  IF v_hits > v_max THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'rate_limited',
      MESSAGE = 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_counters WHERE window_start < now() - interval '1 day';
  END IF;
END $$;

-- Public forms and customer requests, per address (and per account)
CREATE OR REPLACE FUNCTION public.rate_limit_new_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.audit_actor_role() IN ('anon', 'authenticated') AND NOT public.is_admin()
     AND NOT public.is_service_staff('travel') AND NOT public.is_service_staff('consultancy') AND NOT public.is_service_staff('data') THEN
    PERFORM public.rate_limit('new:' || TG_TABLE_NAME, TG_ARGV[0]::int, 3600);
    IF auth.uid() IS NOT NULL THEN
      PERFORM public.rate_limit('new:' || TG_TABLE_NAME, TG_ARGV[0]::int, 3600, auth.uid()::text);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('travel_trips', 10), ('consult_requests', 10), ('data_requests', 10),
    ('software_bookings', 10), ('course_registrations', 10), ('support_requests', 20),
    ('logistics_requests', 20), ('packaging_requests', 20), ('seller_applications', 5)
  ) AS v(tbl, per_hour) LOOP
    EXECUTE format('CREATE TRIGGER rate_limit BEFORE INSERT ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.rate_limit_new_rows(%L)', t.tbl, t.per_hour);
  END LOOP;
END $$;

-- ============== CUSTOMER LINKS ==============
ALTER TABLE public.travel_trips
  ADD COLUMN files_key text, ADD COLUMN access_expires_at timestamptz, ADD COLUMN access_revoked_at timestamptz;
ALTER TABLE public.consult_requests
  ADD COLUMN files_key text, ADD COLUMN access_expires_at timestamptz, ADD COLUMN access_revoked_at timestamptz;
ALTER TABLE public.data_requests
  ADD COLUMN files_key text, ADD COLUMN access_expires_at timestamptz, ADD COLUMN access_revoked_at timestamptz;

-- Existing folders are named after the current link
UPDATE public.travel_trips SET files_key = access_token;
UPDATE public.consult_requests SET files_key = access_token;
UPDATE public.data_requests SET files_key = access_token;
-- Requests already closed keep their link for 180 days from now
UPDATE public.travel_trips SET access_expires_at = now() + interval '180 days' WHERE status IN ('completed', 'cancelled');
UPDATE public.consult_requests SET access_expires_at = now() + interval '180 days' WHERE status IN ('completed', 'declined');
UPDATE public.data_requests SET access_expires_at = now() + interval '180 days' WHERE status IN ('completed', 'cancelled');

ALTER TABLE public.travel_trips ALTER COLUMN files_key SET NOT NULL, ADD CONSTRAINT travel_trips_files_key_uq UNIQUE (files_key);
ALTER TABLE public.consult_requests ALTER COLUMN files_key SET NOT NULL, ADD CONSTRAINT consult_requests_files_key_uq UNIQUE (files_key);
ALTER TABLE public.data_requests ALTER COLUMN files_key SET NOT NULL, ADD CONSTRAINT data_requests_files_key_uq UNIQUE (files_key);

-- The folder of a new request; closing or reopening it sets or clears the expiry.
-- TG_ARGV: the statuses that close a request.
CREATE OR REPLACE FUNCTION public.customer_link_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.files_key := coalesce(NEW.files_key, NEW.access_token);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = ANY (TG_ARGV) AND NOT OLD.status = ANY (TG_ARGV) THEN
      NEW.access_expires_at := now() + interval '180 days';
    ELSIF NOT NEW.status = ANY (TG_ARGV) THEN
      NEW.access_expires_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_link BEFORE INSERT OR UPDATE OF status ON public.travel_trips
  FOR EACH ROW EXECUTE FUNCTION public.customer_link_lifecycle('completed', 'cancelled');
CREATE TRIGGER customer_link BEFORE INSERT OR UPDATE OF status ON public.consult_requests
  FOR EACH ROW EXECUTE FUNCTION public.customer_link_lifecycle('completed', 'declined');
CREATE TRIGGER customer_link BEFORE INSERT OR UPDATE OF status ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.customer_link_lifecycle('completed', 'cancelled');

CREATE OR REPLACE FUNCTION public.customer_link_open(_revoked timestamptz, _expires timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT _revoked IS NULL AND (_expires IS NULL OR _expires > now());
$$;

-- Every action through a link: counted per address, and only while the link works
CREATE OR REPLACE FUNCTION public.travel_trip_by_token(p_token text)
RETURNS public.travel_trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips;
BEGIN
  PERFORM public.rate_limit('portal:action', 120, 3600);
  SELECT * INTO t FROM public.travel_trips
  WHERE access_token = p_token AND public.customer_link_open(access_revoked_at, access_expires_at) FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Trip not found';
  END IF;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.consult_request_by_token(p_token text)
RETURNS public.consult_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests;
BEGIN
  PERFORM public.rate_limit('portal:action', 120, 3600);
  SELECT * INTO r FROM public.consult_requests
  WHERE access_token = p_token AND public.customer_link_open(access_revoked_at, access_expires_at) FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.data_request_by_token(p_token text)
RETURNS public.data_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.data_requests;
BEGIN
  PERFORM public.rate_limit('portal:action', 120, 3600);
  SELECT * INTO r FROM public.data_requests
  WHERE access_token = p_token AND public.customer_link_open(access_revoked_at, access_expires_at) FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Project not found';
  END IF;
  RETURN r;
END $$;

-- Customer views: as before, plus the link's expiry; nothing once it stops working.
-- A wrong link counts towards a small hourly limit per address.
CREATE OR REPLACE FUNCTION public.travel_trip_view(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.rate_limit('portal:view', 600, 3600);
  SELECT jsonb_build_object(
    'reference', t.reference,
    'destination', t.destination,
    'travelling_from', t.travelling_from,
    'arrival_date', t.arrival_date,
    'departure_date', t.departure_date,
    'travelers', t.travelers,
    'needs', to_jsonb(t.needs),
    'customer_name', t.customer_name,
    'status', t.status,
    'currency', t.currency,
    'quote_total', CASE WHEN t.status IN ('quoted', 'changes_requested', 'confirmed', 'completed') THEN t.quote_total END,
    'quote_sent_at', t.quote_sent_at,
    'accepted_at', t.accepted_at,
    'change_request', t.change_request,
    'change_requested_at', t.change_requested_at,
    'today', current_date,
    'link_expires_at', t.access_expires_at,
    'items', CASE WHEN t.status IN ('quoted', 'changes_requested', 'confirmed', 'completed') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'section', i.section, 'title', i.title, 'details', i.details, 'location', i.location,
        'start_date', i.start_date, 'end_date', i.end_date, 'start_time', i.start_time, 'pickup_time', i.pickup_time,
        'driver_name', i.driver_name,
        'driver_phone', CASE WHEN t.status = 'confirmed' THEN i.driver_phone END,
        'status', i.status
      ) ORDER BY array_position(ARRAY['arrival','hotel','transport','experience','departure'], i.section),
                 i.start_date NULLS LAST, i.start_time NULLS LAST, i.created_at)
      FROM public.travel_items i WHERE i.trip_id = t.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'paid', (f ->> 'paid')::numeric,
    'pending_payment', (f ->> 'pending')::numeric,
    'balance', (f ->> 'balance')::numeric,
    'payments', public.finance_customer_payments('travel_trips', t.id),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'label', d.label, 'status', d.status) ORDER BY d.created_at)
      FROM public.travel_documents d WHERE d.trip_id = t.id), '[]'::jsonb)
  ) INTO v
  FROM public.travel_trips t, LATERAL public.finance_totals_for('travel_trips', t.id) f
  WHERE t.access_token = p_token AND public.customer_link_open(t.access_revoked_at, t.access_expires_at);
  IF v IS NULL THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.consult_request_view(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.rate_limit('portal:view', 600, 3600);
  SELECT jsonb_build_object(
    'reference', r.reference,
    'service_name', r.service_name,
    'description', r.description,
    'client_name', r.client_name,
    'organization', r.organization,
    'status', r.status,
    'start_date', r.start_date,
    'expected_completion', r.expected_completion,
    'consultant', (SELECT full_name FROM public.profiles WHERE user_id = r.assigned_to),
    'change_request', r.change_request,
    'created_at', r.created_at,
    'link_expires_at', r.access_expires_at,
    'proposal', (
      SELECT jsonb_build_object('service_title', pr.service_title, 'scope', to_jsonb(pr.scope), 'fee', pr.fee,
                                'currency', pr.currency, 'timeline', pr.timeline, 'status', pr.status, 'sent_at', pr.sent_at)
      FROM public.consult_proposals pr
      WHERE pr.request_id = r.id AND pr.status IN ('sent', 'accepted', 'declined')
      ORDER BY pr.created_at DESC LIMIT 1),
    'tasks_total', (SELECT count(*) FROM public.consult_tasks WHERE request_id = r.id),
    'tasks_done', (SELECT count(*) FROM public.consult_tasks WHERE request_id = r.id AND done),
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'kind', f.kind,
                                          'path', CASE WHEN f.kind = 'client' THEN f.path ELSE f.shared_path END,
                                          'created_at', coalesce(f.shared_at, f.created_at)) ORDER BY f.created_at)
      FROM public.consult_files f
      WHERE f.request_id = r.id AND (f.kind = 'client' OR f.shared_path IS NOT NULL)), '[]'::jsonb),
    'paid', (fin ->> 'paid')::numeric,
    'pending_payment', (fin ->> 'pending')::numeric,
    'balance', (fin ->> 'balance')::numeric
  ) INTO v
  FROM public.consult_requests r, LATERAL public.finance_totals_for('consult_requests', r.id) fin
  WHERE r.access_token = p_token AND public.customer_link_open(r.access_revoked_at, r.access_expires_at);
  IF v IS NULL THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.data_request_view(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.rate_limit('portal:view', 600, 3600);
  SELECT jsonb_build_object(
    'reference', r.reference,
    'service_name', r.service_name,
    'description', r.description,
    'client_name', r.client_name,
    'organization', r.organization,
    'status', r.status,
    'data_later', r.data_later,
    'deadline', r.deadline,
    'fee', r.fee,
    'currency', r.currency,
    'analyst', (SELECT full_name FROM public.profiles WHERE user_id = r.assigned_to),
    'client_feedback', r.client_feedback,
    'created_at', r.created_at,
    'link_expires_at', r.access_expires_at,
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path, 'created_at', f.created_at) ORDER BY f.created_at)
      FROM public.data_files f WHERE f.request_id = r.id AND f.from_client), '[]'::jsonb),
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'description', d.description,
                                          'status', d.status, 'completed_at', d.completed_at,
                                          'path', d.shared_path, 'file_name', d.file_name) ORDER BY d.created_at)
      FROM public.data_deliverables d WHERE d.request_id = r.id), '[]'::jsonb),
    'paid', (fin ->> 'paid')::numeric,
    'pending_payment', (fin ->> 'pending')::numeric,
    'balance', (fin ->> 'balance')::numeric
  ) INTO v
  FROM public.data_requests r, LATERAL public.finance_totals_for('data_requests', r.id) fin
  WHERE r.access_token = p_token AND public.customer_link_open(r.access_revoked_at, r.access_expires_at);
  IF v IS NULL THEN
    PERFORM public.rate_limit('portal:miss', 30, 3600);
  END IF;
  RETURN v;
END $$;

-- A signed-in customer's requests: only those whose link still works
CREATE OR REPLACE FUNCTION public.my_service_requests()
RETURNS TABLE (service text, reference text, token text, title text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'travel', reference, access_token, destination || ' trip', status, created_at
    FROM public.travel_trips WHERE user_id = auth.uid() AND public.customer_link_open(access_revoked_at, access_expires_at)
  UNION ALL
  SELECT 'consultancy', reference, access_token, service_name, status, created_at
    FROM public.consult_requests WHERE user_id = auth.uid() AND public.customer_link_open(access_revoked_at, access_expires_at)
  UNION ALL
  SELECT 'data', reference, access_token, service_name, status, created_at
    FROM public.data_requests WHERE user_id = auth.uid() AND public.customer_link_open(access_revoked_at, access_expires_at)
  ORDER BY created_at DESC;
$$;

-- Uploaded files are registered in the request's folder (files_key)
CREATE OR REPLACE FUNCTION public.travel_document_uploaded(p_token text, p_document_id uuid, p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips := public.travel_trip_by_token(p_token);
BEGIN
  IF p_path IS NULL OR p_path NOT LIKE 'travel/' || t.files_key || '/client/%' OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  UPDATE public.travel_documents
  SET file_path = p_path, uploaded_at = now(), status = 'received'
  WHERE id = p_document_id AND trip_id = t.id AND status <> 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Document not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.consult_client_file(p_token text, p_path text, p_name text, p_size bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests := public.consult_request_by_token(p_token);
BEGIN
  IF p_path IS NULL OR p_path NOT LIKE 'consultancy/' || r.files_key || '/client/%' OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  INSERT INTO public.consult_files (request_id, kind, name, path, size_bytes)
  VALUES (r.id, 'client', left(coalesce(nullif(btrim(p_name), ''), 'file'), 200), p_path, p_size);
END $$;

CREATE OR REPLACE FUNCTION public.data_client_file(p_token text, p_path text, p_name text, p_size bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.data_requests := public.data_request_by_token(p_token);
BEGIN
  IF r.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This project is closed';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE 'data/' || r.files_key || '/client/%' OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  INSERT INTO public.data_files (request_id, name, path, size_bytes, from_client)
  VALUES (r.id, left(coalesce(nullif(btrim(p_name), ''), 'file'), 200), p_path, p_size, true);
  UPDATE public.data_requests SET data_later = false WHERE id = r.id;
END $$;

-- Staff reset a customer's link: the old one stops working at once, the
-- customer gets the new one (email / WhatsApp), and their files stay.
INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  ('CUSTOMER_LINK_RESET', 'A customer''s private link was replaced', ARRAY['in_app', 'email', 'whatsapp'], 'info');
INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('CUSTOMER_LINK_RESET', '*', 'Your new Isoko link ({{reference}})', 'Hello {{name}}, here is your new private link for {{reference}}. The old one no longer works: {{link}}');

CREATE OR REPLACE FUNCTION public.reset_customer_link(p_service text, p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table text := CASE p_service WHEN 'travel' THEN 'travel_trips' WHEN 'consultancy' THEN 'consult_requests' WHEN 'data' THEN 'data_requests' END;
  v_token text := public.new_access_token();
  v_ref text;
BEGIN
  IF v_table IS NULL OR NOT public.is_service_staff(p_service) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only staff of this service can reset its links';
  END IF;
  PERFORM set_config('isoko.audit_reason', 'Customer link reset', true);
  EXECUTE format(
    'UPDATE public.%I SET access_token = $1, access_revoked_at = NULL,
            access_expires_at = CASE WHEN access_expires_at IS NULL THEN NULL ELSE now() + interval ''180 days'' END
     WHERE id = $2 RETURNING reference', v_table)
  INTO v_ref USING v_token, p_id;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found';
  END IF;
  PERFORM public.notify_event('CUSTOMER_LINK_RESET', 'CUSTOMER_LINK_RESET:' || p_id || ':' || now(), v_table, p_id,
    public.notification_customer(v_table, p_id), jsonb_build_object('reference', v_ref));
  RETURN v_token;
END $$;

-- ============== FILES ==============
-- The request a service-files path belongs to:
--   <service>/<files_key>/client/...    uploaded by the customer
--   <service>/<files_key>/shared/...    shared with the customer
--   <service>/internal/<request id>/... staff working files
CREATE OR REPLACE FUNCTION public.service_file_request(_name text)
RETURNS TABLE (service text, area text, request_id uuid, assigned_to uuid, open_for_upload boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[] := string_to_array(_name, '/');
  v_internal boolean := parts[2] = 'internal';
BEGIN
  IF cardinality(parts) < 4 OR _name LIKE '%..%' OR parts[1] NOT IN ('travel', 'consultancy', 'data') THEN
    RETURN;
  END IF;
  IF v_internal AND parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;
  IF NOT v_internal AND parts[3] NOT IN ('client', 'shared') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT parts[1], CASE WHEN v_internal THEN 'internal' ELSE parts[3] END, x.rid, x.owner, x.is_open
  FROM (
    SELECT t.id AS rid, t.assigned_to AS owner, t.files_key AS fkey, t.status NOT IN ('completed', 'cancelled') AS is_open
      FROM public.travel_trips t WHERE parts[1] = 'travel'
    UNION ALL
    SELECT c.id, c.assigned_to, c.files_key, c.status NOT IN ('completed', 'declined')
      FROM public.consult_requests c WHERE parts[1] = 'consultancy'
    UNION ALL
    SELECT d.id, d.assigned_to, d.files_key, d.status NOT IN ('completed', 'cancelled')
      FROM public.data_requests d WHERE parts[1] = 'data'
  ) x
  WHERE CASE WHEN v_internal THEN x.rid = parts[3]::uuid ELSE x.fkey = parts[2] END;
END $$;

-- Staff may open a request's files when it is assigned to them or not assigned
-- yet; admins always. Customer uploads (the 'client' area: passports,
-- datasets) are never opened directly, only through file-access (recorded).
CREATE OR REPLACE FUNCTION public.service_file_staff_access(_name text, _direct boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT (public.is_admin() OR (public.is_service_staff(f.service) AND (f.assigned_to IS NULL OR f.assigned_to = auth.uid())))
       AND NOT (_direct AND f.area = 'client')
    FROM public.service_file_request(_name) f
  ), false);
$$;

DROP POLICY IF EXISTS "Service files: staff read" ON storage.objects;
DROP POLICY IF EXISTS "Service files: staff add" ON storage.objects;
DROP POLICY IF EXISTS "Service files: staff remove" ON storage.objects;
CREATE POLICY "Service files: assigned staff read working and shared files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'service-files' AND public.service_file_staff_access(name, true));
CREATE POLICY "Service files: assigned staff add working and shared files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'service-files' AND public.service_file_staff_access(name, true));
CREATE POLICY "Service files: assigned staff remove working and shared files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'service-files' AND public.service_file_staff_access(name, true));

-- For the service-files Edge Function (customers): the folder of a working
-- link, or NULL. Uploads only while the request is open.
DROP FUNCTION IF EXISTS public.service_file_customer_access(text, boolean);
CREATE OR REPLACE FUNCTION public.service_file_customer_folder(_service text, _token text, _write boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  SELECT files_key INTO v_key FROM (
    SELECT files_key, access_token, access_revoked_at, access_expires_at, status NOT IN ('completed', 'cancelled') AS open
      FROM public.travel_trips WHERE _service = 'travel'
    UNION ALL
    SELECT files_key, access_token, access_revoked_at, access_expires_at, status NOT IN ('completed', 'declined')
      FROM public.consult_requests WHERE _service = 'consultancy'
    UNION ALL
    SELECT files_key, access_token, access_revoked_at, access_expires_at, status NOT IN ('completed', 'cancelled')
      FROM public.data_requests WHERE _service = 'data'
  ) x
  WHERE x.access_token = _token AND public.customer_link_open(x.access_revoked_at, x.access_expires_at) AND (NOT _write OR x.open);
  RETURN v_key;
END $$;

-- ID documents: admins open them through file-access (recorded); applicants
-- keep reading their own. Delivery proofs: drivers read their own folder;
-- admins and the customer open them through file-access.
DROP POLICY IF EXISTS "Admins can view all ID documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers view own proofs, admins view all" ON storage.objects;
CREATE POLICY "Drivers view own proofs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'delivery-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Proofs were stored as year-long signed links; keep just the file path
UPDATE public.logistics_requests
SET proof_url = substring(proof_url FROM '/object/sign/delivery-proofs/([^?]+)')
WHERE proof_url LIKE '%/object/sign/delivery-proofs/%';
UPDATE public.packaging_requests
SET proof_url = substring(proof_url FROM '/object/sign/delivery-proofs/([^?]+)')
WHERE proof_url LIKE '%/object/sign/delivery-proofs/%';

-- Called by the file-access Edge Function as the signed-in person: may they
-- open this file? Every answer is recorded in the audit log.
CREATE OR REPLACE FUNCTION public.file_access_check(p_bucket text, p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok boolean := false;
  v_request uuid;
BEGIN
  IF auth.uid() IS NULL OR p_path IS NULL OR p_path LIKE '%..%' OR length(p_path) > 500 THEN
    RETURN false;
  END IF;
  PERFORM public.rate_limit('file-access', 300, 3600, auth.uid()::text);
  CASE p_bucket
    WHEN 'service-files' THEN
      v_ok := public.service_file_staff_access(p_path, false);
      SELECT request_id INTO v_request FROM public.service_file_request(p_path);
    WHEN 'id-documents' THEN
      v_ok := public.is_admin() OR split_part(p_path, '/', 1) = auth.uid()::text;
    WHEN 'delivery-proofs' THEN
      v_ok := public.is_admin() OR split_part(p_path, '/', 1) = auth.uid()::text
           OR EXISTS (SELECT 1 FROM public.logistics_requests WHERE proof_url = p_path AND user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.packaging_requests WHERE proof_url = p_path AND user_id = auth.uid());
    ELSE
      v_ok := false;
  END CASE;
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_table, entity_id, details)
  VALUES (auth.uid(), public.audit_actor_role(), CASE WHEN v_ok THEN 'file.opened' ELSE 'file.refused' END,
          p_bucket, left(p_path, 500), jsonb_strip_nulls(jsonb_build_object('request_id', v_request, 'ip', public.request_ip())));
  RETURN coalesce(v_ok, false);
END $$;

-- ============== FUNCTION PERMISSIONS ==============
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'request_ip()', 'rate_limit_new_rows()', 'customer_link_lifecycle()', 'customer_link_open(timestamptz, timestamptz)',
    'service_file_request(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- used by storage policies (evaluated as the signed-in person)
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.service_file_staff_access(text, boolean) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.service_file_staff_access(text, boolean) TO authenticated';
  -- Edge Functions
  FOREACH f IN ARRAY ARRAY['rate_limit(text, integer, integer, text)', 'service_file_customer_folder(text, text, boolean)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  -- signed-in people (each checks the caller itself)
  FOREACH f IN ARRAY ARRAY['file_access_check(text, text)', 'reset_customer_link(text, uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  -- the customer views are still public (they need the link)
  FOREACH f IN ARRAY ARRAY['travel_trip_view(text)', 'consult_request_view(text)', 'data_request_view(text)'] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;

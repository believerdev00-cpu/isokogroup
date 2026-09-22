-- Isoko client services: Travel Agency, Consultancy and Data Analysis.
--
-- Each service keeps its own tables (travel_*, consult_*, data_*). Staff of a
-- service (and Isoko admins) work on them directly under row-level security.
-- Customers don't need an account: submitting a request returns a private link
-- (an unguessable access token), and everything a customer does afterwards goes
-- through the functions at the end of each section, which only ever return the
-- customer-facing part of a request (never internal costs, suppliers or notes).

-- ============== SHARED ==============

-- Staff of a service: 'travel', 'consultancy' or 'data'. Admins are staff of all.
CREATE OR REPLACE FUNCTION public.is_service_staff(_service text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text = CASE _service
        WHEN 'travel' THEN 'travel_staff'
        WHEN 'consultancy' THEN 'consultancy_staff'
        WHEN 'data' THEN 'data_analyst'
      END
  );
$$;

-- 64 hex characters: the secret in a customer's private link
CREATE OR REPLACE FUNCTION public.new_access_token()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Reads a text field from a request payload, trimmed, with a length limit.
CREATE OR REPLACE FUNCTION public.svc_text(_p jsonb, _key text, _label text, _max int, _required boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := nullif(btrim(coalesce(_p ->> _key, '')), '');
BEGIN
  IF v IS NULL AND _required THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = _label || ' is required';
  END IF;
  IF length(v) > _max THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = _label || ' is too long';
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.svc_email(_p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := lower(public.svc_text(_p, 'email', 'Email', 200));
BEGIN
  IF v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please enter a valid email address';
  END IF;
  RETURN v;
END $$;

-- The services clients can choose for Consultancy and Data Analysis. Admins and
-- the service's staff switch them on or off.
CREATE TABLE public.service_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (service IN ('consultancy', 'data')),
  key text NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, key)
);
ALTER TABLE public.service_offerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active offerings are public" ON public.service_offerings
  FOR SELECT TO anon, authenticated USING (is_active OR public.is_service_staff(service));
CREATE POLICY "Service staff manage offerings" ON public.service_offerings
  FOR ALL TO authenticated USING (public.is_service_staff(service)) WITH CHECK (public.is_service_staff(service));

INSERT INTO public.service_offerings (service, key, name, description, is_active, sort) VALUES
  ('consultancy', 'business', 'Business Consultancy', 'Assessment of your business, the problems holding it back and practical improvements.', true, 10),
  ('consultancy', 'strategy', 'Strategy', 'Clear objectives, an action plan, KPIs and a roadmap to reach them.', true, 20),
  ('consultancy', 'digital', 'Digital Transformation', 'Move your processes, sales and services onto the right digital tools.', true, 30),
  ('consultancy', 'project_management', 'Project Management', 'Planning, coordination and follow-up so projects finish on time and budget.', true, 40),
  ('consultancy', 'technology', 'IT & Technology', 'Advice on systems, websites, software and IT infrastructure.', true, 50),
  ('consultancy', 'operations', 'Business Operations', 'Procurement, logistics, inventory and staffing that run smoothly.', true, 60),
  ('consultancy', 'training', 'Training & Capacity Building', 'Training programs that build your team''s skills.', true, 70),
  ('consultancy', 'research', 'Research', 'Market research: customers, competitors, trends and opportunities.', true, 80),
  ('consultancy', 'financial', 'Financial Analysis', 'Revenue, costs, profitability and cash flow, explained.', false, 90),
  ('consultancy', 'investment', 'Investment Advisory', 'Business plans, projections and investor information.', false, 100),
  ('consultancy', 'other', 'Other', 'Something else? Tell us what you need.', true, 1000),
  ('data', 'cleaning', 'Data Cleaning', 'Fix errors, duplicates and gaps so your data can be trusted.', true, 10),
  ('data', 'analysis', 'Data Analysis', 'Find the trends, comparisons and answers in your data.', true, 20),
  ('data', 'dashboard', 'Dashboard', 'A live dashboard with the numbers you watch every week.', true, 30),
  ('data', 'visualization', 'Data Visualization', 'Clear charts that make your data easy to understand.', true, 40),
  ('data', 'report', 'Report', 'A written report with findings and recommendations.', true, 50),
  ('data', 'survey', 'Survey Analysis', 'Analysis of survey responses, with charts and a report.', true, 60),
  ('data', 'statistics', 'Statistical Analysis', 'Statistical tests and models for research and decisions.', false, 70),
  ('data', 'spreadsheet', 'Excel & Spreadsheets', 'Clean, automated spreadsheets and templates.', false, 80),
  ('data', 'other', 'Other', 'Something else? Tell us about your data.', true, 1000);

-- ============== TRAVEL AGENCY ==============
-- One request = one Trip: Arrival → Pickup → Hotel → Transport → Activities →
-- Airport drop-off → Departure. Staff build the trip as items, send one quote,
-- the customer accepts and pays.

-- Optional shortcuts on the website; choosing one starts the same trip request.
CREATE TABLE public.travel_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 60),
  summary text NOT NULL DEFAULT '',
  includes text[] NOT NULL DEFAULT '{}',
  from_price numeric(12,2) CHECK (from_price >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'RWF', 'EUR')),
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.travel_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active packages are public" ON public.travel_packages
  FOR SELECT TO anon, authenticated USING (is_active OR public.is_service_staff('travel'));
CREATE POLICY "Travel staff manage packages" ON public.travel_packages
  FOR ALL TO authenticated USING (public.is_service_staff('travel')) WITH CHECK (public.is_service_staff('travel'));

INSERT INTO public.travel_packages (name, days, summary, includes, sort) VALUES
  ('Rwanda Discovery', 7, 'Kigali''s culture and history, then a safari day in Akagera National Park.',
   ARRAY['Airport pickup', 'Hotel', 'Private transport', 'Kigali city tour', 'Akagera safari', 'Airport drop-off'], 10),
  ('Gorillas & Volcanoes', 4, 'Musanze and Volcanoes National Park, home of the mountain gorillas.',
   ARRAY['Airport pickup', 'Hotel', 'Private transport', 'Volcanoes National Park', 'Airport drop-off'], 20),
  ('Lake Kivu Escape', 5, 'Slow days by the lake in Rubavu and Karongi, with boat trips and coffee tours.',
   ARRAY['Airport pickup', 'Lakeside hotel', 'Private transport', 'Boat trip', 'Airport drop-off'], 30);

CREATE SEQUENCE public.travel_trip_ref_seq START 101;

CREATE TABLE public.travel_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT 'ISO-TRIP-' || lpad(nextval('public.travel_trip_ref_seq')::text, 5, '0'),
  access_token text NOT NULL UNIQUE DEFAULT public.new_access_token(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destination text NOT NULL DEFAULT 'Rwanda',
  travelling_from text,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  travelers integer NOT NULL CHECK (travelers BETWEEN 1 AND 100),
  -- airport_pickup, hotel, transport, activities, airport_dropoff, plan_everything
  needs text[] NOT NULL DEFAULT '{}',
  package_id uuid REFERENCES public.travel_packages(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'planning', 'quoted', 'changes_requested', 'confirmed', 'completed', 'cancelled')),
  quote_total numeric(12,2) CHECK (quote_total >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'RWF', 'EUR')),
  quote_sent_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  change_request text,
  change_requested_at timestamptz,
  staff_notes text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (departure_date >= arrival_date)
);
CREATE INDEX travel_trips_status_idx ON public.travel_trips (status, created_at DESC);
CREATE INDEX travel_trips_dates_idx ON public.travel_trips (arrival_date, departure_date);
CREATE INDEX travel_trips_user_idx ON public.travel_trips (user_id);
CREATE TRIGGER travel_trips_updated_at BEFORE UPDATE ON public.travel_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- What Isoko arranges. price is the customer price; supplier, internal_cost and
-- internal_note are for staff only and never leave the staff screens.
CREATE TABLE public.travel_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.travel_trips(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('arrival', 'hotel', 'transport', 'experience', 'departure')),
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  location text,
  start_date date,
  end_date date,
  start_time time,
  pickup_time time,
  driver_name text,
  driver_phone text,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  supplier text,
  internal_cost numeric(12,2) CHECK (internal_cost >= 0),
  internal_note text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_items_trip_idx ON public.travel_items (trip_id);

CREATE TABLE public.travel_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.travel_trips(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'cash', 'other')),
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  from_customer boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_payments_trip_idx ON public.travel_payments (trip_id);

-- Only the documents a trip actually needs, added by staff.
CREATE TABLE public.travel_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.travel_trips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('passport', 'visa', 'other')),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'received', 'approved')),
  file_path text,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_documents_trip_idx ON public.travel_documents (trip_id);

ALTER TABLE public.travel_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Travel staff manage trips" ON public.travel_trips FOR ALL TO authenticated
  USING (public.is_service_staff('travel')) WITH CHECK (public.is_service_staff('travel'));
CREATE POLICY "Travel staff manage items" ON public.travel_items FOR ALL TO authenticated
  USING (public.is_service_staff('travel')) WITH CHECK (public.is_service_staff('travel'));
CREATE POLICY "Travel staff manage payments" ON public.travel_payments FOR ALL TO authenticated
  USING (public.is_service_staff('travel')) WITH CHECK (public.is_service_staff('travel'));
CREATE POLICY "Travel staff manage documents" ON public.travel_documents FOR ALL TO authenticated
  USING (public.is_service_staff('travel')) WITH CHECK (public.is_service_staff('travel'));

-- Customer: PLAN MY TRIP. Returns the reference and the private link token.
CREATE OR REPLACE FUNCTION public.travel_request_trip(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_arrival date;
  v_departure date;
  v_travelers int;
  v_needs text[];
  v_package uuid;
  t public.travel_trips;
BEGIN
  BEGIN
    v_arrival := (p ->> 'arrival_date')::date;
    v_departure := (p ->> 'departure_date')::date;
    v_travelers := (p ->> 'travelers')::int;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please check the dates and number of travelers';
  END;
  IF v_arrival IS NULL OR v_departure IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Arrival and departure dates are required';
  END IF;
  IF v_arrival < current_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The arrival date is in the past';
  END IF;
  IF v_departure < v_arrival THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Departure must be on or after arrival';
  END IF;
  IF v_departure > v_arrival + 90 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'For trips longer than 90 days, please contact us directly';
  END IF;
  IF v_travelers IS NULL OR v_travelers < 1 OR v_travelers > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Number of travelers must be between 1 and 100';
  END IF;

  SELECT coalesce(array_agg(DISTINCT n), '{}') INTO v_needs
  FROM jsonb_array_elements_text(coalesce(p -> 'needs', '[]'::jsonb)) n
  WHERE n IN ('airport_pickup', 'hotel', 'transport', 'activities', 'airport_dropoff', 'plan_everything');
  IF cardinality(v_needs) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what you need help with';
  END IF;

  IF nullif(p ->> 'package_id', '') IS NOT NULL THEN
    SELECT id INTO v_package FROM public.travel_packages
    WHERE id::text = p ->> 'package_id' AND is_active;
  END IF;

  INSERT INTO public.travel_trips (
    user_id, destination, travelling_from, arrival_date, departure_date, travelers, needs, package_id,
    customer_name, customer_phone, customer_email, message
  ) VALUES (
    auth.uid(),
    coalesce(public.svc_text(p, 'destination', 'Destination', 60, false), 'Rwanda'),
    public.svc_text(p, 'travelling_from', 'Travelling from', 80, false),
    v_arrival, v_departure, v_travelers, v_needs, v_package,
    public.svc_text(p, 'name', 'Name', 120),
    public.svc_text(p, 'phone', 'Phone / WhatsApp', 40),
    public.svc_email(p),
    public.svc_text(p, 'message', 'Message', 2000, false)
  ) RETURNING * INTO t;

  RETURN jsonb_build_object('reference', t.reference, 'token', t.access_token);
END $$;

-- Customer view of a trip: only what the customer needs to see.
CREATE OR REPLACE FUNCTION public.travel_trip_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    -- The plan is shown once a quote has been sent
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
    'paid', coalesce((SELECT sum(amount) FROM public.travel_payments WHERE trip_id = t.id AND status = 'confirmed'), 0),
    'pending_payment', coalesce((SELECT sum(amount) FROM public.travel_payments WHERE trip_id = t.id AND status = 'pending'), 0),
    'payments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('amount', amount, 'method', method, 'status', status, 'created_at', created_at) ORDER BY created_at)
      FROM public.travel_payments WHERE trip_id = t.id AND status <> 'rejected'), '[]'::jsonb),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'label', d.label, 'status', d.status) ORDER BY d.created_at)
      FROM public.travel_documents d WHERE d.trip_id = t.id), '[]'::jsonb)
  )
  FROM public.travel_trips t
  WHERE t.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.travel_trip_by_token(p_token text)
RETURNS public.travel_trips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips;
BEGIN
  SELECT * INTO t FROM public.travel_trips WHERE access_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Trip not found';
  END IF;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.travel_accept_quote(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips := public.travel_trip_by_token(p_token);
BEGIN
  IF t.status <> 'quoted' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no quote waiting for your answer';
  END IF;
  UPDATE public.travel_trips SET status = 'confirmed', accepted_at = now() WHERE id = t.id;
END $$;

CREATE OR REPLACE FUNCTION public.travel_request_changes(p_token text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.travel_trips := public.travel_trip_by_token(p_token);
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  IF v_msg IS NULL OR length(v_msg) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tell us what you would like to change';
  END IF;
  IF t.status NOT IN ('new', 'planning', 'quoted', 'changes_requested', 'confirmed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This trip can no longer be changed online. Please contact Isoko.';
  END IF;
  UPDATE public.travel_trips
  SET change_request = v_msg, change_requested_at = now(),
      status = CASE WHEN status = 'quoted' THEN 'changes_requested' ELSE status END
  WHERE id = t.id;
END $$;

CREATE OR REPLACE FUNCTION public.travel_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips := public.travel_trip_by_token(p_token);
BEGIN
  IF t.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payments open once you accept the trip';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount you paid';
  END IF;
  IF p_method NOT IN ('momo', 'bank', 'card', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how you paid';
  END IF;
  IF length(btrim(coalesce(p_reference, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the payment reference or transaction ID';
  END IF;
  -- Isoko confirms the payment once it is received
  INSERT INTO public.travel_payments (trip_id, amount, method, reference, from_customer)
  VALUES (t.id, round(p_amount, 2), p_method, btrim(p_reference), true);
END $$;

-- Called after the customer uploaded a requested document into their folder.
CREATE OR REPLACE FUNCTION public.travel_document_uploaded(p_token text, p_document_id uuid, p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.travel_trips := public.travel_trip_by_token(p_token);
BEGIN
  IF p_path IS NULL OR p_path NOT LIKE 'travel/' || t.access_token || '/client/%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  UPDATE public.travel_documents
  SET file_path = p_path, uploaded_at = now(), status = 'received'
  WHERE id = p_document_id AND trip_id = t.id AND status <> 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Document not found';
  END IF;
END $$;

-- ============== CONSULTANCY ==============
-- Request → Contacted → Assessment → Proposal sent → Approved → In progress →
-- Completed. An accepted proposal turns the request into a project.

CREATE SEQUENCE public.consult_ref_seq START 1;

CREATE TABLE public.consult_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT 'ISO-CON-' || lpad(nextval('public.consult_ref_seq')::text, 5, '0'),
  access_token text NOT NULL UNIQUE DEFAULT public.new_access_token(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  service_name text NOT NULL,
  description text NOT NULL,
  client_name text NOT NULL,
  organization text,
  phone text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'assessment', 'proposal_sent', 'approved', 'in_progress', 'completed', 'declined')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date date,
  expected_completion date,
  staff_notes text NOT NULL DEFAULT '',
  change_request text,
  change_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_requests_status_idx ON public.consult_requests (status, created_at DESC);
CREATE INDEX consult_requests_user_idx ON public.consult_requests (user_id);
CREATE TRIGGER consult_requests_updated_at BEFORE UPDATE ON public.consult_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.consult_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.consult_requests(id) ON DELETE CASCADE,
  service_title text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}',
  fee numeric(12,2) NOT NULL CHECK (fee >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'RWF', 'EUR')),
  timeline text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'withdrawn')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_proposals_request_idx ON public.consult_proposals (request_id, created_at DESC);

CREATE TABLE public.consult_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.consult_requests(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_tasks_request_idx ON public.consult_tasks (request_id);

-- Files: from the client, internal working files, and deliverables. A deliverable
-- is visible to the client once staff share it (a copy in the client's folder).
CREATE TABLE public.consult_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.consult_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('client', 'internal', 'deliverable')),
  name text NOT NULL,
  path text NOT NULL,
  size_bytes bigint,
  shared_path text,
  shared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_files_request_idx ON public.consult_files (request_id);

CREATE TABLE public.consult_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.consult_requests(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'cash', 'other')),
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  from_customer boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_payments_request_idx ON public.consult_payments (request_id);

ALTER TABLE public.consult_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultancy staff manage requests" ON public.consult_requests FOR ALL TO authenticated
  USING (public.is_service_staff('consultancy')) WITH CHECK (public.is_service_staff('consultancy'));
CREATE POLICY "Consultancy staff manage proposals" ON public.consult_proposals FOR ALL TO authenticated
  USING (public.is_service_staff('consultancy')) WITH CHECK (public.is_service_staff('consultancy'));
CREATE POLICY "Consultancy staff manage tasks" ON public.consult_tasks FOR ALL TO authenticated
  USING (public.is_service_staff('consultancy')) WITH CHECK (public.is_service_staff('consultancy'));
CREATE POLICY "Consultancy staff manage files" ON public.consult_files FOR ALL TO authenticated
  USING (public.is_service_staff('consultancy')) WITH CHECK (public.is_service_staff('consultancy'));
CREATE POLICY "Consultancy staff manage payments" ON public.consult_payments FOR ALL TO authenticated
  USING (public.is_service_staff('consultancy')) WITH CHECK (public.is_service_staff('consultancy'));

CREATE OR REPLACE FUNCTION public.consult_submit_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.service_offerings;
  r public.consult_requests;
BEGIN
  SELECT * INTO o FROM public.service_offerings
  WHERE service = 'consultancy' AND key = p ->> 'service' AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what you need help with';
  END IF;
  INSERT INTO public.consult_requests (user_id, service_key, service_name, description, client_name, organization, phone, email)
  VALUES (
    auth.uid(), o.key, o.name,
    public.svc_text(p, 'description', 'A short description', 4000),
    public.svc_text(p, 'name', 'Name', 120),
    public.svc_text(p, 'organization', 'Organization', 160, false),
    public.svc_text(p, 'phone', 'Phone', 40),
    public.svc_email(p)
  ) RETURNING * INTO r;
  RETURN jsonb_build_object('reference', r.reference, 'token', r.access_token);
END $$;

CREATE OR REPLACE FUNCTION public.consult_request_by_token(p_token text)
RETURNS public.consult_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests;
BEGIN
  SELECT * INTO r FROM public.consult_requests WHERE access_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Request not found';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.consult_request_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'paid', coalesce((SELECT sum(amount) FROM public.consult_payments WHERE request_id = r.id AND status = 'confirmed'), 0),
    'pending_payment', coalesce((SELECT sum(amount) FROM public.consult_payments WHERE request_id = r.id AND status = 'pending'), 0)
  )
  FROM public.consult_requests r
  WHERE r.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.consult_accept_proposal(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests := public.consult_request_by_token(p_token);
BEGIN
  UPDATE public.consult_proposals SET status = 'accepted', responded_at = now()
  WHERE id = (SELECT id FROM public.consult_proposals WHERE request_id = r.id AND status = 'sent'
              ORDER BY created_at DESC LIMIT 1);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'There is no proposal waiting for your answer';
  END IF;
  UPDATE public.consult_requests SET status = 'approved', change_request = NULL WHERE id = r.id;
END $$;

CREATE OR REPLACE FUNCTION public.consult_request_changes(p_token text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.consult_requests := public.consult_request_by_token(p_token);
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  IF v_msg IS NULL OR length(v_msg) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tell us what you would like to change';
  END IF;
  IF r.status IN ('completed', 'declined') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This request is closed. Please contact Isoko.';
  END IF;
  UPDATE public.consult_requests SET change_request = v_msg, change_requested_at = now() WHERE id = r.id;
  -- A proposal the client wants changed goes back to the consultant
  UPDATE public.consult_proposals SET status = 'declined', responded_at = now()
  WHERE request_id = r.id AND status = 'sent';
  IF FOUND THEN
    UPDATE public.consult_requests SET status = 'assessment' WHERE id = r.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.consult_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests := public.consult_request_by_token(p_token);
BEGIN
  IF r.status NOT IN ('approved', 'in_progress', 'completed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payments open once you accept the proposal';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount you paid';
  END IF;
  IF p_method NOT IN ('momo', 'bank', 'card', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how you paid';
  END IF;
  IF length(btrim(coalesce(p_reference, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the payment reference or transaction ID';
  END IF;
  INSERT INTO public.consult_payments (request_id, amount, method, reference, from_customer)
  VALUES (r.id, round(p_amount, 2), p_method, btrim(p_reference), true);
END $$;

CREATE OR REPLACE FUNCTION public.consult_client_file(p_token text, p_path text, p_name text, p_size bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.consult_requests := public.consult_request_by_token(p_token);
BEGIN
  IF p_path IS NULL OR p_path NOT LIKE 'consultancy/' || r.access_token || '/client/%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  INSERT INTO public.consult_files (request_id, kind, name, path, size_bytes)
  VALUES (r.id, 'client', left(coalesce(nullif(btrim(p_name), ''), 'file'), 200), p_path, p_size);
END $$;

-- ============== DATA ANALYSIS ==============
-- New → Data received → Reviewing → Analysis → Draft report → Client review →
-- Completed. Deliverables (cleaned data, analysis, charts, dashboard, report)
-- reach the client when staff share them.

CREATE SEQUENCE public.data_ref_seq START 1;

CREATE TABLE public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT 'ISO-DATA-' || lpad(nextval('public.data_ref_seq')::text, 5, '0'),
  access_token text NOT NULL UNIQUE DEFAULT public.new_access_token(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  service_name text NOT NULL,
  description text NOT NULL,
  data_later boolean NOT NULL DEFAULT false,
  client_name text NOT NULL,
  organization text,
  phone text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'data_received', 'reviewing', 'analysis', 'draft_report', 'client_review', 'completed', 'cancelled')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date date,
  deadline date,
  fee numeric(12,2) CHECK (fee >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'RWF', 'EUR')),
  staff_notes text NOT NULL DEFAULT '',
  client_feedback text,
  client_feedback_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_requests_status_idx ON public.data_requests (status, created_at DESC);
CREATE INDEX data_requests_user_idx ON public.data_requests (user_id);
CREATE TRIGGER data_requests_updated_at BEFORE UPDATE ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Data provided by the client
CREATE TABLE public.data_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.data_requests(id) ON DELETE CASCADE,
  name text NOT NULL,
  path text NOT NULL,
  size_bytes bigint,
  from_client boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_files_request_idx ON public.data_files (request_id);

CREATE TABLE public.data_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.data_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cleaned_dataset', 'analysis', 'charts', 'dashboard', 'final_report', 'other')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  file_path text,
  file_name text,
  -- A copy in the client's folder, made when staff share the deliverable
  shared_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_deliverables_request_idx ON public.data_deliverables (request_id);

CREATE TABLE public.data_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.data_requests(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_tasks_request_idx ON public.data_tasks (request_id);

CREATE TABLE public.data_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.data_requests(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'card', 'cash', 'other')),
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  from_customer boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_payments_request_idx ON public.data_payments (request_id);

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Analysts manage data requests" ON public.data_requests FOR ALL TO authenticated
  USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'));
CREATE POLICY "Analysts manage data files" ON public.data_files FOR ALL TO authenticated
  USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'));
CREATE POLICY "Analysts manage deliverables" ON public.data_deliverables FOR ALL TO authenticated
  USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'));
CREATE POLICY "Analysts manage data tasks" ON public.data_tasks FOR ALL TO authenticated
  USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'));
CREATE POLICY "Analysts manage data payments" ON public.data_payments FOR ALL TO authenticated
  USING (public.is_service_staff('data')) WITH CHECK (public.is_service_staff('data'));

CREATE OR REPLACE FUNCTION public.data_submit_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.service_offerings;
  r public.data_requests;
BEGIN
  SELECT * INTO o FROM public.service_offerings
  WHERE service = 'data' AND key = p ->> 'service' AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what you need';
  END IF;
  INSERT INTO public.data_requests (user_id, service_key, service_name, description, data_later, client_name, organization, phone, email)
  VALUES (
    auth.uid(), o.key, o.name,
    public.svc_text(p, 'description', 'A short description of the project', 4000),
    coalesce((p ->> 'data_later')::boolean, false),
    public.svc_text(p, 'name', 'Name', 120),
    public.svc_text(p, 'organization', 'Organization', 160, false),
    public.svc_text(p, 'phone', 'Phone', 40),
    public.svc_email(p)
  ) RETURNING * INTO r;
  RETURN jsonb_build_object('reference', r.reference, 'token', r.access_token);
END $$;

CREATE OR REPLACE FUNCTION public.data_request_by_token(p_token text)
RETURNS public.data_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.data_requests;
BEGIN
  SELECT * INTO r FROM public.data_requests WHERE access_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Project not found';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.data_request_view(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path, 'created_at', f.created_at) ORDER BY f.created_at)
      FROM public.data_files f WHERE f.request_id = r.id AND f.from_client), '[]'::jsonb),
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'description', d.description,
                                          'status', d.status, 'completed_at', d.completed_at,
                                          'path', d.shared_path, 'file_name', d.file_name) ORDER BY d.created_at)
      FROM public.data_deliverables d WHERE d.request_id = r.id), '[]'::jsonb),
    'paid', coalesce((SELECT sum(amount) FROM public.data_payments WHERE request_id = r.id AND status = 'confirmed'), 0),
    'pending_payment', coalesce((SELECT sum(amount) FROM public.data_payments WHERE request_id = r.id AND status = 'pending'), 0)
  )
  FROM public.data_requests r
  WHERE r.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.data_client_file(p_token text, p_path text, p_name text, p_size bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.data_requests := public.data_request_by_token(p_token);
BEGIN
  IF r.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This project is closed';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE 'data/' || r.access_token || '/client/%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid file';
  END IF;
  INSERT INTO public.data_files (request_id, name, path, size_bytes, from_client)
  VALUES (r.id, left(coalesce(nullif(btrim(p_name), ''), 'file'), 200), p_path, p_size, true);
  UPDATE public.data_requests SET data_later = false WHERE id = r.id;
END $$;

-- Client review: approve the results, or ask for changes
CREATE OR REPLACE FUNCTION public.data_review(p_token text, p_approve boolean, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.data_requests := public.data_request_by_token(p_token);
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  IF r.status <> 'client_review' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nothing is waiting for your review';
  END IF;
  IF length(v_msg) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Your message is too long';
  END IF;
  IF p_approve THEN
    UPDATE public.data_requests SET status = 'completed', client_feedback = coalesce(v_msg, client_feedback), client_feedback_at = now()
    WHERE id = r.id;
  ELSE
    IF v_msg IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tell us what you would like to change';
    END IF;
    UPDATE public.data_requests SET status = 'analysis', client_feedback = v_msg, client_feedback_at = now() WHERE id = r.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.data_submit_payment(p_token text, p_amount numeric, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.data_requests := public.data_request_by_token(p_token);
BEGIN
  IF r.fee IS NULL OR r.status = 'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Isoko will share the price before you pay';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the amount you paid';
  END IF;
  IF p_method NOT IN ('momo', 'bank', 'card', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose how you paid';
  END IF;
  IF length(btrim(coalesce(p_reference, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Enter the payment reference or transaction ID';
  END IF;
  INSERT INTO public.data_payments (request_id, amount, method, reference, from_customer)
  VALUES (r.id, round(p_amount, 2), p_method, btrim(p_reference), true);
END $$;

-- ============== A SIGNED-IN CUSTOMER'S REQUESTS ==============
CREATE OR REPLACE FUNCTION public.my_service_requests()
RETURNS TABLE (service text, reference text, token text, title text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'travel', reference, access_token, destination || ' trip', status, created_at
    FROM public.travel_trips WHERE user_id = auth.uid()
  UNION ALL
  SELECT 'consultancy', reference, access_token, service_name, status, created_at
    FROM public.consult_requests WHERE user_id = auth.uid()
  UNION ALL
  SELECT 'data', reference, access_token, service_name, status, created_at
    FROM public.data_requests WHERE user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

-- ============== STAFF ==============
-- Colleagues of a service, for assigning work (profiles are otherwise private).
CREATE OR REPLACE FUNCTION public.service_staff_directory(_service text)
RETURNS TABLE (user_id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.id, coalesce(nullif(p.full_name, ''), split_part(u.email::text, '@', 1)), u.email::text
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE public.is_service_staff(_service)
    AND r.role::text = ANY (ARRAY['admin', CASE _service
      WHEN 'travel' THEN 'travel_staff' WHEN 'consultancy' THEN 'consultancy_staff' WHEN 'data' THEN 'data_analyst' END])
  ORDER BY 2;
$$;

-- Admins: who works on which service
CREATE OR REPLACE FUNCTION public.admin_service_staff()
RETURNS TABLE (user_id uuid, full_name text, email text, roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only administrators can manage staff';
  END IF;
  RETURN QUERY
  SELECT u.id, p.full_name, u.email::text, array_agg(r.role::text ORDER BY r.role::text)
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE r.role::text IN ('travel_staff', 'consultancy_staff', 'data_analyst')
  GROUP BY u.id, p.full_name, u.email
  ORDER BY u.email;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_service_role(p_email text, p_role text, p_grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only administrators can manage staff';
  END IF;
  IF p_role NOT IN ('travel_staff', 'consultancy_staff', 'data_analyst') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown role';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No Isoko account uses this email. Ask them to sign up first.';
  END IF;
  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user, p_role::public.app_role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = v_user AND role::text = p_role;
  END IF;
END $$;

-- ============== FILES ==============
-- One private bucket, one folder per service:
--   <service>/<access token>/client/...   uploaded by the client
--   <service>/<access token>/shared/...   deliverables shared with the client
--   <service>/internal/<request id>/...   staff working files
-- Staff of the service read and write everything in its folder. Customers get
-- no Storage policy at all (a folder listing would reveal other customers'
-- links): the 'service-files' Edge Function checks their private link with
-- service_file_customer_access() and hands out short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-files', 'service-files', false, 26214400, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv', 'text/plain',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/json'
])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.service_file_customer_access(_name text, _write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[] := string_to_array(_name, '/');
  v_service text := parts[1];
  v_token text := parts[2];
  v_area text := parts[3];
BEGIN
  IF cardinality(parts) < 4 OR v_token !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  IF _write AND v_area <> 'client' THEN
    RETURN false;
  END IF;
  IF NOT _write AND v_area NOT IN ('client', 'shared') THEN
    RETURN false;
  END IF;
  RETURN CASE v_service
    WHEN 'travel' THEN EXISTS (SELECT 1 FROM public.travel_trips WHERE access_token = v_token
                                 AND (NOT _write OR status NOT IN ('completed', 'cancelled')))
    WHEN 'consultancy' THEN EXISTS (SELECT 1 FROM public.consult_requests WHERE access_token = v_token
                                 AND (NOT _write OR status NOT IN ('completed', 'declined')))
    WHEN 'data' THEN EXISTS (SELECT 1 FROM public.data_requests WHERE access_token = v_token
                                 AND (NOT _write OR status NOT IN ('completed', 'cancelled')))
    ELSE false
  END;
END $$;

CREATE POLICY "Service files: staff read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'service-files' AND public.is_service_staff(split_part(name, '/', 1))
  );
CREATE POLICY "Service files: staff add" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'service-files' AND public.is_service_staff(split_part(name, '/', 1))
  );
CREATE POLICY "Service files: staff remove" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'service-files' AND public.is_service_staff(split_part(name, '/', 1))
  );

-- ============== FUNCTION PERMISSIONS ==============
REVOKE EXECUTE ON FUNCTION public.travel_trip_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consult_request_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.data_request_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_text(jsonb, text, text, int, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_email(jsonb) FROM PUBLIC, anon, authenticated;
-- Used by the service-files Edge Function (service role) only
REVOKE EXECUTE ON FUNCTION public.service_file_customer_access(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_file_customer_access(text, boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.travel_request_trip(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travel_trip_view(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travel_accept_quote(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travel_request_changes(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travel_submit_payment(text, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travel_document_uploaded(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_submit_request(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_request_view(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_accept_proposal(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_request_changes(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_submit_payment(text, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consult_client_file(text, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_submit_request(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_request_view(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_client_file(text, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_review(text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_submit_payment(text, numeric, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_service_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_service_requests() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.service_staff_directory(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_staff_directory(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_service_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_staff() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_service_role(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_service_role(text, text, boolean) TO authenticated;

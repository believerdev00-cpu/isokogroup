-- The Isoko Fashion Hub: a showcase of Isoko fashion designs that visitors can
-- browse, and that signed-in people can ask about or ask Isoko to produce.
--
-- How it fits the existing platform:
--   * Designs are Isoko Entertainment content (same statuses, same media staff,
--     same public display-image bucket, same audit trail) in their own table,
--     because a design carries things an editorial look does not: colours,
--     sizes, fabric and whether it can be ordered. The existing fashion
--     portfolio (ent_works, section 'fashion') is untouched.
--   * Design categories reuse ent_categories under a new section, 'design'.
--   * A request (an inquiry, or asking Isoko to produce the design) always
--     belongs to a signed-in account and always names the design. It is written
--     only through fashion_submit_request(), which the database refuses for
--     visitors, so the login requirement holds server-side. Media staff move it
--     through its statuses with fashion_update_request(); nothing is ever
--     promised by the database: a request starts as 'submitted' and only staff
--     set 'accepted', 'in_production' and so on.
--   * The customer sees their own requests (without the staff-only
--     internal_note: a column privilege keeps it out of reach); staff read
--     everything through fashion_requests_desk().
--   * Both sides are told through the notification engine (in-app and email).

-- ============== CATEGORIES ==============
ALTER TABLE public.ent_categories DROP CONSTRAINT ent_categories_section_check;
ALTER TABLE public.ent_categories ADD CONSTRAINT ent_categories_section_check
  CHECK (section IN ('film', 'podcast', 'photo', 'art', 'fashion', 'live', 'event', 'design'));

INSERT INTO public.ent_categories (section, slug, name, sort) VALUES
  ('design', 'dresses', 'Dresses', 1), ('design', 'suits', 'Suits & tailoring', 2),
  ('design', 'traditional', 'Traditional wear', 3), ('design', 'casual', 'Casual wear', 4),
  ('design', 'kids', 'Kids', 5), ('design', 'accessories', 'Accessories', 6)
ON CONFLICT (section, slug) DO NOTHING;

-- ============== DESIGNS ==============
CREATE TABLE public.ent_fashion_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category_id uuid REFERENCES public.ent_categories (id) ON DELETE SET NULL,
  designer_id uuid REFERENCES public.ent_creators (id) ON DELETE SET NULL,
  description text CHECK (length(description) <= 5000),
  style_notes text CHECK (length(style_notes) <= 2000),
  colors text[] NOT NULL DEFAULT '{}',
  sizes text[] NOT NULL DEFAULT '{}',
  fabric text CHECK (length(fabric) <= 200),
  availability text NOT NULL DEFAULT 'on_request'
    CHECK (availability IN ('available', 'made_to_order', 'limited', 'on_request', 'unavailable')),
  cover_path text,
  cover_w integer CHECK (cover_w > 0),
  cover_h integer CHECK (cover_h > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  publish_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'scheduled' OR publish_at IS NOT NULL)
);
CREATE INDEX ent_fashion_designs_browse ON public.ent_fashion_designs (status, created_at DESC);
CREATE INDEX ent_fashion_designs_category ON public.ent_fashion_designs (category_id);

CREATE TABLE public.ent_fashion_design_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.ent_fashion_designs (id) ON DELETE CASCADE,
  path text NOT NULL,
  w integer CHECK (w > 0),
  h integer CHECK (h > 0),
  caption text CHECK (length(caption) <= 300),
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX ent_fashion_design_images_design ON public.ent_fashion_design_images (design_id, sort);

-- ============== REQUESTS ==============
CREATE TABLE public.ent_fashion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE CHECK (reference ~ '^FH-[A-Z0-9]{6}$'),
  design_id uuid NOT NULL REFERENCES public.ent_fashion_designs (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('inquiry', 'production')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'under_review', 'more_info_required', 'accepted', 'in_production', 'ready', 'completed', 'declined')),
  message text CHECK (length(message) <= 2000),
  size text CHECK (length(size) <= 40),
  color text CHECK (length(color) <= 60),
  fabric text CHECK (length(fabric) <= 120),
  quantity integer CHECK (quantity BETWEEN 1 AND 1000),
  customization text CHECK (length(customization) <= 2000),
  -- what staff tell the customer
  staff_note text CHECK (length(staff_note) <= 2000),
  -- staff only, never shown to the customer
  internal_note text CHECK (length(internal_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ent_fashion_requests_user ON public.ent_fashion_requests (user_id, created_at DESC);
CREATE INDEX ent_fashion_requests_desk ON public.ent_fashion_requests (status, created_at DESC);

-- ============== ROW-LEVEL SECURITY ==============
ALTER TABLE public.ent_fashion_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_fashion_design_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_fashion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads what is published" ON public.ent_fashion_designs FOR SELECT TO anon, authenticated
  USING (public.ent_is_public(status, publish_at) OR public.is_service_staff('entertainment'));
CREATE POLICY "Media staff manage" ON public.ent_fashion_designs FOR ALL TO authenticated
  USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'));

CREATE POLICY "Public reads images of what is published" ON public.ent_fashion_design_images FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ent_fashion_designs d WHERE d.id = design_id));
CREATE POLICY "Media staff manage" ON public.ent_fashion_design_images FOR ALL TO authenticated
  USING (public.is_service_staff('entertainment')) WITH CHECK (public.is_service_staff('entertainment'));

-- A request is read by its owner and by media staff; it is written only
-- through the functions below.
CREATE POLICY "Own requests" ON public.ent_fashion_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_service_staff('entertainment'));

REVOKE INSERT, UPDATE, DELETE ON public.ent_fashion_designs, public.ent_fashion_design_images FROM anon;
REVOKE ALL ON public.ent_fashion_requests FROM anon, authenticated;
-- the website reads a request without its staff-only note
GRANT SELECT (id, reference, design_id, user_id, kind, status, message, size, color, fabric, quantity, customization,
              staff_note, created_at, updated_at) ON public.ent_fashion_requests TO authenticated;

-- ============== HOUSEKEEPING ==============
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ent_fashion_designs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ent_fashion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.ent_fashion_designs
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.ent_fashion_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ============== NOTIFICATIONS ==============
-- Media staff are the staff of 'entertainment' (admins stand in when there are none)
CREATE OR REPLACE FUNCTION public.notification_staff(_service text, _link text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH roles AS (
    SELECT CASE _service
      WHEN 'travel' THEN ARRAY['travel_staff']
      WHEN 'consultancy' THEN ARRAY['consultancy_staff']
      WHEN 'data' THEN ARRAY['data_analyst']
      WHEN 'entertainment' THEN ARRAY['media_staff']
      ELSE ARRAY['finance', 'admin'] END AS names
  ), people AS (
    SELECT DISTINCT r.user_id FROM public.user_roles r, roles WHERE r.role::text = ANY (roles.names)
  ), everyone AS (
    SELECT user_id FROM people
    UNION
    SELECT user_id FROM public.user_roles WHERE role = 'admin' AND NOT EXISTS (SELECT 1 FROM people)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'link', _link)), '[]'::jsonb) FROM everyone;
$$;

INSERT INTO public.notification_event_types (event_type, description, channels, tone) VALUES
  ('FASHION_REQUEST_RECEIVED', 'A Fashion Hub inquiry or production request was received (customer)', ARRAY['in_app', 'email'], 'info'),
  ('FASHION_REQUEST_STAFF', 'A new Fashion Hub request to handle (media staff)', ARRAY['in_app', 'email'], 'info'),
  ('FASHION_REQUEST_UPDATED', 'Isoko replied to, or changed the status of, a Fashion Hub request (customer)', ARRAY['in_app', 'email'], 'info')
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO public.notification_templates (event_type, channel, subject, body) VALUES
  ('FASHION_REQUEST_RECEIVED', '*', 'We received your request {{reference}}',
   'Thank you, {{name}}. We received your {{kind}} about “{{design}}” (reference {{reference}}). Isoko Fashion will look at it and reply here; nothing is confirmed until we do. {{link}}'),
  ('FASHION_REQUEST_STAFF', '*', 'New Fashion Hub request {{reference}}',
   'A new {{kind}} about “{{design}}” is waiting in the Fashion Hub desk (reference {{reference}}). {{link}}'),
  ('FASHION_REQUEST_UPDATED', '*', 'Your request {{reference}}: {{status}}',
   'Your request about “{{design}}” (reference {{reference}}) is now: {{status}}. {{note}} {{link}}')
ON CONFLICT (event_type, channel) DO NOTHING;

-- ============== THE REQUEST ==============
CREATE OR REPLACE FUNCTION public.fashion_status_label(_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _status
    WHEN 'submitted' THEN 'Submitted' WHEN 'under_review' THEN 'Under review'
    WHEN 'more_info_required' THEN 'More information required' WHEN 'accepted' THEN 'Accepted'
    WHEN 'in_production' THEN 'In production' WHEN 'ready' THEN 'Ready'
    WHEN 'completed' THEN 'Completed' WHEN 'declined' THEN 'Declined' ELSE _status END;
$$;

-- A signed-in person asks about a published design, or asks Isoko to produce
-- it. The design is attached by its id; the message and wishes are optional.
CREATE OR REPLACE FUNCTION public.fashion_submit_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.ent_fashion_designs;
  r public.ent_fashion_requests;
  v_kind text := p ->> 'kind';
  v_quantity integer;
  v_reference text;
  v_attempt integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to send a request';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('inquiry', 'production') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose what you want to do with this design';
  END IF;
  BEGIN
    SELECT * INTO d FROM public.ent_fashion_designs WHERE id = (p ->> 'design_id')::uuid;
  EXCEPTION WHEN others THEN
    d := NULL;
  END;
  IF d.id IS NULL OR NOT public.ent_is_public(d.status, d.publish_at) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This design is not available';
  END IF;
  IF nullif(btrim(coalesce(p ->> 'quantity', '')), '') IS NOT NULL THEN
    BEGIN
      v_quantity := (p ->> 'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quantity must be a whole number';
    END;
    IF v_quantity < 1 OR v_quantity > 1000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quantity must be between 1 and 1000';
    END IF;
  END IF;
  PERFORM public.rate_limit('fashion_requests', 10, 3600, auth.uid()::text);

  LOOP
    v_reference := 'FH-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.ent_fashion_requests WHERE reference = v_reference);
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'Could not allocate a reference';
    END IF;
  END LOOP;

  INSERT INTO public.ent_fashion_requests (reference, design_id, user_id, kind, message, size, color, fabric, quantity, customization)
  VALUES (
    v_reference, d.id, auth.uid(), v_kind,
    public.svc_text(p, 'message', 'Message', 2000, false),
    public.svc_text(p, 'size', 'Size', 40, false),
    public.svc_text(p, 'color', 'Colour', 60, false),
    public.svc_text(p, 'fabric', 'Fabric', 120, false),
    v_quantity,
    public.svc_text(p, 'customization', 'Customization', 2000, false)
  ) RETURNING * INTO r;

  PERFORM public.notify_event('FASHION_REQUEST_RECEIVED', 'FASHION_REQUEST_RECEIVED:' || r.id, 'ent_fashion_requests', r.id,
    jsonb_build_array(jsonb_build_object('user_id', auth.uid(), 'link', '/entertainment/fashion/hub/requests')),
    jsonb_build_object('reference', r.reference, 'design', d.name,
                       'kind', CASE v_kind WHEN 'inquiry' THEN 'question' ELSE 'production request' END));
  PERFORM public.notify_event('FASHION_REQUEST_STAFF', 'FASHION_REQUEST_STAFF:' || r.id, 'ent_fashion_requests', r.id,
    public.notification_staff('entertainment', '/staff/media/fashion-hub/requests'),
    jsonb_build_object('reference', r.reference, 'design', d.name,
                       'kind', CASE v_kind WHEN 'inquiry' THEN 'question' ELSE 'production request' END));
  RETURN jsonb_build_object('id', r.id, 'reference', r.reference);
END $$;

-- Media staff move a request along and reply to the customer (staff_note).
-- The customer is told when the status or the reply changes.
CREATE OR REPLACE FUNCTION public.fashion_update_request(p_id uuid, p_status text, p_staff_note text, p_internal_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.ent_fashion_requests;
  v_design text;
  v_note text := nullif(left(btrim(coalesce(p_staff_note, '')), 2000), '');
  v_changed boolean;
BEGIN
  IF NOT public.is_service_staff('entertainment') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only media staff can update Fashion Hub requests';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('submitted', 'under_review', 'more_info_required', 'accepted', 'in_production', 'ready', 'completed', 'declined') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'That is not a request status';
  END IF;
  SELECT * INTO r FROM public.ent_fashion_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Request not found';
  END IF;
  v_changed := r.status IS DISTINCT FROM p_status OR r.staff_note IS DISTINCT FROM v_note;
  UPDATE public.ent_fashion_requests
  SET status = p_status, staff_note = v_note, internal_note = nullif(left(btrim(coalesce(p_internal_note, '')), 2000), '')
  WHERE id = p_id;
  IF v_changed THEN
    SELECT name INTO v_design FROM public.ent_fashion_designs WHERE id = r.design_id;
    PERFORM public.notify_event('FASHION_REQUEST_UPDATED',
      'FASHION_REQUEST_UPDATED:' || r.id || ':' || p_status || ':' || md5(coalesce(v_note, '')),
      'ent_fashion_requests', r.id,
      jsonb_build_array(jsonb_build_object('user_id', r.user_id, 'link', '/entertainment/fashion/hub/requests')),
      jsonb_build_object('reference', r.reference, 'design', coalesce(v_design, ''),
                         'status', public.fashion_status_label(p_status), 'note', coalesce(v_note, '')));
  END IF;
END $$;

-- Everything about every request, for the media desk only
CREATE OR REPLACE FUNCTION public.fashion_requests_desk()
RETURNS TABLE (
  id uuid, reference text, design_id uuid, design_name text, design_slug text, design_cover_path text,
  user_id uuid, customer_name text, customer_email text, kind text, status text, message text, size text, color text,
  fabric text, quantity integer, customization text, staff_note text, internal_note text,
  created_at timestamptz, updated_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_service_staff('entertainment') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only media staff can see Fashion Hub requests';
  END IF;
  RETURN QUERY
    SELECT r.id, r.reference, r.design_id, d.name, d.slug, d.cover_path,
           r.user_id, p.full_name, u.email::text, r.kind, r.status, r.message, r.size, r.color,
           r.fabric, r.quantity, r.customization, r.staff_note, r.internal_note, r.created_at, r.updated_at
    FROM public.ent_fashion_requests r
    JOIN public.ent_fashion_designs d ON d.id = r.design_id
    LEFT JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN public.profiles p ON p.user_id = r.user_id
    ORDER BY r.created_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fashion_submit_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fashion_submit_request(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fashion_update_request(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fashion_update_request(uuid, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fashion_requests_desk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fashion_requests_desk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fashion_status_label(text) TO anon, authenticated;

-- ============== SEARCH ==============
-- Designs join the one search across Isoko Entertainment
CREATE OR REPLACE FUNCTION public.ent_search(p_query text, p_limit integer DEFAULT 30)
RETURNS TABLE (kind text, id uuid, slug text, title text, subtitle text, image_path text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH q AS (
    SELECT '%' || replace(replace(replace(left(trim(p_query), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  ), hits AS (
    SELECT t.kind, t.id, t.slug, t.title, coalesce(t.tagline, array_to_string(t.genres, ', ')) AS subtitle,
           t.poster_path AS image_path, 1 AS pri
      FROM ent_titles t, q WHERE t.title ILIKE q.pat OR t.tagline ILIKE q.pat OR array_to_string(t.genres, ' ') ILIKE q.pat
    UNION ALL
    SELECT 'creator', c.id, c.slug, c.display_name, array_to_string(c.kinds, ', '), c.avatar_path, 2
      FROM ent_creators c, q WHERE c.display_name ILIKE q.pat OR c.headline ILIKE q.pat
    UNION ALL
    SELECT 'work:' || w.section, w.id, w.slug, w.title, array_to_string(w.tags, ', '), w.cover_path, 3
      FROM ent_works w, q WHERE w.title ILIKE q.pat OR array_to_string(w.tags, ' ') ILIKE q.pat
    UNION ALL
    SELECT 'collection', c.id, c.slug, c.title, c.kind, c.cover_path, 3
      FROM ent_collections c, q WHERE c.title ILIKE q.pat
    UNION ALL
    SELECT 'design', d.id, d.slug, d.name, coalesce(c.name, 'Fashion Hub'), d.cover_path, 3
      FROM ent_fashion_designs d LEFT JOIN ent_categories c ON c.id = d.category_id, q
      WHERE d.name ILIKE q.pat OR d.description ILIKE q.pat OR d.fabric ILIKE q.pat
    UNION ALL
    SELECT 'event', e.id, e.slug, e.title, e.location, e.cover_path, 3
      FROM ent_events e, q WHERE e.title ILIKE q.pat OR e.location ILIKE q.pat
    UNION ALL
    SELECT 'live', l.id, l.slug, l.title, l.live_state, l.thumb_path, 2
      FROM ent_live_streams l, q WHERE l.title ILIKE q.pat
  )
  SELECT kind, id, slug, title, subtitle, image_path FROM hits
  WHERE length(trim(p_query)) >= 2
  ORDER BY pri, title
  LIMIT least(greatest(p_limit, 1), 50);
$$;

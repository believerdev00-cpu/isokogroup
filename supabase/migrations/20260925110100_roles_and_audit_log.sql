-- One role system and an append-only audit log
--
-- ROLES. Who may do what was spread over three places: user_roles (admin,
-- driver, service staff), profiles.role (buyer/seller, shown to admins) and the
-- seller application status (what product listing actually checked). Now
-- user_roles is the only source: a seller application that becomes 'approved'
-- grants the 'seller' role and one that stops being approved removes it, and
-- profiles.role just mirrors it for the screens that show it. Role changes go
-- through server functions only.
--
-- AUDIT LOG. Changes to money, orders, requests, documents and roles are
-- recorded automatically: who (the signed-in user, a customer link, the service
-- role or the system), what changed (old and new values of the changed fields),
-- when, and why when the change came with a reason. Nobody can edit or delete
-- the log, not even the service role; only admins read it.

-- ============== AUDIT LOG ==============
CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  -- 'authenticated', 'anon' (a customer link or public form), 'service_role', 'system'
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  details jsonb
);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_table, entity_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_time_idx ON public.audit_log (occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read the audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.audit_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_log_is_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'The audit log cannot be changed or deleted' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_is_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_is_append_only();

-- Who is acting. auth.uid()/auth.jwt() come from the request, so they are the
-- real caller also inside SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.audit_actor_role()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(nullif(auth.jwt() ->> 'role', ''), 'system');
$$;

-- Server functions that change something for a reason set it for the rest of
-- the transaction: PERFORM set_config('isoko.audit_reason', p_reason, true);
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    SELECT jsonb_object_agg(n.key, n.value) INTO v_new
    FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM v_old -> n.key;
    IF v_new IS NULL THEN
      RETURN NULL; -- nothing but updated_at changed
    END IF;
    SELECT jsonb_object_agg(k, v_old -> k) INTO v_old FROM jsonb_object_keys(v_new) k;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
  END IF;
  v_row := coalesce(to_jsonb(NEW), to_jsonb(OLD));

  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_table, entity_id, old_data, new_data, reason)
  VALUES (
    auth.uid(), public.audit_actor_role(), lower(TG_OP), TG_TABLE_NAME, v_row ->> 'id',
    -- customer links are secrets; they never go into the log
    v_old - 'access_token', v_new - 'access_token',
    nullif(current_setting('isoko.audit_reason', true), '')
  );
  RETURN NULL;
END $$;

-- For events that are not a row change (e.g. a sensitive file handed out by an
-- Edge Function). Service role and server functions only.
CREATE OR REPLACE FUNCTION public.audit_event(
  p_action text, p_entity_table text, p_entity_id text, p_details jsonb DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(btrim(p_action), '') = '' OR coalesce(btrim(p_entity_table), '') = '' THEN
    RAISE EXCEPTION 'Audit events need an action and an entity' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_table, entity_id, details, reason)
  VALUES (auth.uid(), public.audit_actor_role(), left(p_action, 100), left(p_entity_table, 100),
          left(p_entity_id, 200), p_details, left(p_reason, 2000));
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- access
    'user_roles', 'seller_applications',
    -- marketplace and money
    'products', 'orders', 'commissions', 'payout_requests', 'subscriptions',
    -- logistics
    'shipments', 'tracking_logs', 'logistics_requests', 'packaging_requests', 'couriers', 'shipping_rates',
    -- software
    'software_bookings', 'course_registrations',
    -- travel
    'travel_trips', 'travel_items', 'travel_payments', 'travel_documents',
    -- consultancy
    'consult_requests', 'consult_proposals', 'consult_payments', 'consult_files',
    -- data analysis
    'data_requests', 'data_payments', 'data_deliverables', 'data_files'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- ============== ROLES: user_roles IS THE SOURCE ==============
-- Role changes only through the functions below (and the seller application
-- decision); admins keep reading everyone's roles.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin());

-- profiles.role mirrors the seller role for the screens that show it
CREATE OR REPLACE FUNCTION public.sync_profile_seller_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  IF coalesce(NEW.role, OLD.role) = 'seller' THEN
    UPDATE public.profiles
    SET role = CASE WHEN public.has_role(v_user, 'seller') THEN 'seller' ELSE 'buyer' END
    WHERE user_id = v_user;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER user_roles_sync_profile AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_seller_role();

-- The seller application decision grants or removes the seller role
CREATE OR REPLACE FUNCTION public.seller_application_sets_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'seller') ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM public.seller_applications
    WHERE user_id = NEW.user_id AND status = 'approved' AND id <> NEW.id
  ) THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'seller';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER seller_applications_set_role AFTER INSERT OR UPDATE OF status ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.seller_application_sets_role();

-- Existing sellers: exactly those product listing already accepted (an approved
-- application). profiles.role is then brought in line; it could be edited by
-- its owner before 20260922090000, so it is not trusted on its own.
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'seller'::public.app_role
FROM public.seller_applications WHERE status = 'approved'
ON CONFLICT DO NOTHING;
UPDATE public.profiles p
SET role = CASE WHEN public.has_role(p.user_id, 'seller') THEN 'seller' ELSE 'buyer' END
WHERE p.role IS DISTINCT FROM CASE WHEN public.has_role(p.user_id, 'seller') THEN 'seller' ELSE 'buyer' END;

DROP POLICY IF EXISTS "Approved sellers can insert own products" ON public.products;
CREATE POLICY "Sellers can insert own products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = seller_id AND public.has_role(auth.uid(), 'seller'));

CREATE OR REPLACE FUNCTION public.approve_seller_application(p_application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.seller_applications;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve sellers' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.seller_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  -- the seller role follows from the approval (seller_applications_set_role)
  UPDATE public.seller_applications
  SET status = 'approved', rejection_reason = NULL
  WHERE id = v_app.id;
  UPDATE public.profiles SET business_name = v_app.business_name WHERE user_id = v_app.user_id;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (v_app.user_id, 'Seller account approved',
          'You can now list products on the Isoko marketplace.', 'success', '/seller');
END $$;

-- Drivers are given or removed by admins (service staff keep
-- admin_set_service_role, sellers follow their application).
CREATE OR REPLACE FUNCTION public.admin_set_driver(p_user_id uuid, p_grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can manage drivers' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'driver') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'driver';
  END IF;
END $$;

-- ============== FUNCTION PERMISSIONS ==============
-- has_role(any user, any role) answered anonymous callers too
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.audit_event(text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_event(text, text, text, jsonb, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_seller_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seller_application_sets_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_driver(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_driver(uuid, boolean) TO authenticated;

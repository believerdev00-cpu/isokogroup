-- Who has confirmed their email, for the admin's user list.
--
-- auth.users is out of reach from the website, and rightly so. This returns only
-- what the list shows, for administrators only. It reads and changes nothing else:
-- no passwords or tokens leave it, and it sends and confirms nothing.
--
-- email_confirmed_at is the source of truth. account_type is what the person chose
-- when registering, or their seller role: a label to read, not a permission.
-- is_admin is from user_roles, the one place that decides it.
CREATE OR REPLACE FUNCTION public.admin_user_confirmations()
RETURNS TABLE (
  user_id uuid, full_name text, email text, account_type text, is_admin boolean,
  email_confirmed_at timestamptz, registered_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only administrators can see this';
  END IF;
  RETURN QUERY
  SELECT u.id, p.full_name, u.email::text,
         CASE WHEN p.role = 'seller' OR u.raw_user_meta_data ->> 'register_as' = 'seller' THEN 'seller' ELSE 'buyer' END,
         EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin'),
         u.email_confirmed_at, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_user_confirmations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_confirmations() TO authenticated;

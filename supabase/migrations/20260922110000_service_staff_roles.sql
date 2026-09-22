-- Staff roles for Isoko's client services. Admins keep access to everything.
-- (Kept in its own migration: a new enum value can't be used in the transaction
-- that adds it.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'travel_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultancy_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'data_analyst';

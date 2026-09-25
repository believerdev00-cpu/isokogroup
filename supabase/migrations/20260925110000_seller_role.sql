-- Sellers become a role in user_roles, like admins, drivers and service staff.
-- (Kept in its own migration: a new enum value can't be used in the transaction
-- that adds it.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';

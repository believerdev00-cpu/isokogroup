-- Finance staff: see and handle payments for every service, and the only
-- non-admins who may refund, void, discount, waive or adjust.
-- (Kept in its own migration: a new enum value can't be used in the transaction
-- that adds it.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';

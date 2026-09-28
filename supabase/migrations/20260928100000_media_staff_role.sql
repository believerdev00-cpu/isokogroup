-- Isoko Entertainment is run by media staff: they publish films, podcasts,
-- portfolios, live streams and event coverage. (A new enum value can't be used
-- in the transaction that adds it, so it has a migration of its own.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'media_staff';

-- The Training Center's contact email moves to the isokogroups.com domain
--
-- Only replaces the address the Training Center was first set up with, so an
-- address an admin has since chosen in Training Center > Settings stays.
UPDATE training.settings
SET value = jsonb_set(value, '{email}', '"training@isokogroups.com"'),
    updated_at = now()
WHERE key = 'center'
  AND value->>'email' = 'training@isoko.rw';

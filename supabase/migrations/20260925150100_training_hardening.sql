-- Training Center: credentials and emails
--
-- Temporary passwords were written into the in-app notification body and kept
-- there for good; now they travel only in the email (email_secret), which is
-- wiped once the email is sent or given up on. Old notifications are cleaned.
-- Emails could go out twice (a slow send while the next run picked the same
-- row); a row is now claimed as 'sending' with a lock first.
SET search_path TO training, public;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS email_secret text,
  ADD COLUMN IF NOT EXISTS email_locked_until timestamptz;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_email_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_email_status_check
  CHECK (email_status IN ('none', 'pending', 'sending', 'sent', 'failed', 'not_configured'));

DROP INDEX IF EXISTS notifications_outbox_idx;
CREATE INDEX notifications_outbox_idx ON notifications (created_at) WHERE email_status IN ('pending', 'sending');

-- Passwords already stored in notifications
UPDATE notifications
SET body = regexp_replace(body, 'Temporary password: \S+', 'Temporary password: (sent by email)', 'g')
WHERE body LIKE '%Temporary password:%';

RESET search_path;

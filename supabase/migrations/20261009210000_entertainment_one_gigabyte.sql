-- Films and episodes up to 1 GB.
--
-- This raises the bucket's own ceiling. It is necessary but not sufficient:
-- the Supabase PROJECT also has an upload limit that applies to every bucket
-- at once (Dashboard > Storage > Settings > "Upload file size limit"), it is
-- the smaller of the two that applies, and the storage service enforces it
-- before a byte is sent -- a resumable upload is refused at session creation
-- with 413 "Maximum size exceeded", so chunking does not get around it.
--
-- On the free plan that project limit is capped at 50 MB and cannot be raised,
-- which is why src/lib/uploadLimits.ts still declares PLATFORM_UPLOAD_MB = 50
-- and the interface still offers 50 MB. Raising the figure the interface shows
-- before raising the project setting would only move the failure later, after
-- somebody had waited through the upload.
--
-- To actually get 1 GB: move to a paid plan, set the dashboard limit to
-- 1024 MB, then change PLATFORM_UPLOAD_MB to 1024. Nothing else needs editing.

UPDATE storage.buckets
   SET file_size_limit = 1024 * 1024 * 1024
 WHERE id = 'entertainment';

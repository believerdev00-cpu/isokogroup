-- Accept Matroska (.mkv) films and episodes.
--
-- The bucket allowed_mime_types list is the server side of this: the browser
-- decides what it offers in the file picker, but what may actually be stored is
-- decided here, and a file arriving labelled video/x-matroska was refused.
--
-- Everything already accepted stays accepted; this only adds to the list.
-- The size limit is untouched.
UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT t ORDER BY t)
  FROM unnest(allowed_mime_types || ARRAY['video/x-matroska']) AS t
)
WHERE id = 'entertainment'
  AND NOT ('video/x-matroska' = ANY (allowed_mime_types));

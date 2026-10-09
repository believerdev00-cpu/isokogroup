-- Video and audio wherever something is uploaded, not only in Entertainment.
--
-- Every bucket except entertainment accepted stills and documents only, so a
-- trainer could not upload a lesson recording, a seller could not show the
-- product moving, the E-Library could not hold an audiobook and an advertiser
-- could not supply a video advert. allowed_mime_types is the server side of
-- that: the browser's "accept" is a convenience, this is the rule.
--
-- The size limits move to 50 MB, which is the Supabase project limit on this
-- plan and therefore the largest an upload can be in any bucket today. There
-- is no point setting a bucket higher than the project will accept; it only
-- tells somebody a figure that is not true. See src/lib/uploadLimits.ts.
--
-- Two buckets are deliberately NOT given video or audio:
--
--   id-documents   identity checks want a readable still of a document. A
--                  video is a larger attack surface, more personal data and
--                  no better evidence.
--   payment-proofs the artefact is a screenshot of a transaction. A recording
--                  of one proves less, not more.

DO $$
DECLARE
  b text;
  media text[] := ARRAY[
    'video/mp4', 'video/webm', 'video/x-matroska',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav'
  ];
BEGIN
  FOREACH b IN ARRAY ARRAY[
    'product-images',   -- a product shown moving, not just photographed
    'adverts',          -- a video advert
    'books',            -- audiobooks and author talks
    'training',         -- recorded lessons
    'research',         -- recorded briefings
    'media-public',     -- site media
    'service-files',    -- what a client sends, and what staff send back
    'initiative',       -- a spoken application from somebody who writes little
    'delivery-proofs'   -- a short clip of a handover
  ]
  LOOP
    UPDATE storage.buckets
       SET allowed_mime_types = (
             SELECT array_agg(DISTINCT t ORDER BY t)
               FROM unnest(coalesce(allowed_mime_types, ARRAY[]::text[]) || media) AS t
           ),
           -- never above the project limit; never below what it already allowed
           file_size_limit = GREATEST(coalesce(file_size_limit, 0), 50 * 1024 * 1024)
     WHERE id = b;
  END LOOP;
END $$;

-- A photograph can be evidence too, so the research bucket must take one.
--
-- 20261009240000 gave this bucket video and audio along with every other
-- bucket, on the stated understanding that each one "accepted stills and
-- documents only" beforehand. That was true everywhere except here: the
-- research bucket was created in 20261003100000 with paperwork and nothing
-- else, so it is the one bucket on the site that still cannot hold a picture.
--
-- The effect was a desk that contradicted itself. The file picker offers
-- pictures, the rule in the page now accepts them, and Storage would refuse
-- them at the last moment with a message about mime types -- after the
-- analyst had chosen the file and waited.
--
-- HEIC and HEIF are included because a photograph taken on a phone arrives
-- that way and converting it first is work nobody should have to do for a
-- field photo. Browsers mostly will not display HEIC, so such a file is kept
-- and downloaded rather than previewed; holding the evidence matters more
-- than previewing it.
--
-- Written as a union, like the earlier migration, so re-running it is safe
-- and nothing already permitted is removed.

UPDATE storage.buckets
   SET allowed_mime_types = (
         SELECT array_agg(DISTINCT t ORDER BY t)
           FROM unnest(
             coalesce(allowed_mime_types, ARRAY[]::text[]) ||
             ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']
           ) AS t
       )
 WHERE id = 'research';

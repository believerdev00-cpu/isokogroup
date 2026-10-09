-- Four buckets accepted any file of any size.
--
-- product-images, books, delivery-proofs and id-documents were created before
-- file_size_limit and allowed_mime_types were being set, so they inherited
-- neither. Anything the project would accept could be put in them -- including
-- an executable renamed to .jpg -- and product-images is public.
--
-- The limits below are what each upload form already offers, so nothing that
-- works today stops working. allowed_mime_types gates new uploads only; files
-- already stored keep working whatever their type.
--
-- The sizes are deliberately not generous. The project-wide limit is the real
-- ceiling for all of them (see src/lib/uploadLimits.ts); these simply stop a
-- bucket accepting far more than its purpose needs.

-- Product photos. Public, and the form offers image/* and multiple files.
-- HEIC is included because phones produce it by default.
UPDATE storage.buckets SET
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif','image/heic','image/heif']
WHERE id = 'product-images';

-- Proof-of-delivery photographs taken on a phone.
UPDATE storage.buckets SET
  file_size_limit = 15 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']
WHERE id = 'delivery-proofs';

-- Identity documents: a photograph or a scan. The form offers exactly these.
UPDATE storage.buckets SET
  file_size_limit = 15 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
WHERE id = 'id-documents';

-- Library books: the content file is a PDF or an EPUB, the cover an image.
UPDATE storage.buckets SET
  file_size_limit = 50 * 1024 * 1024,
  allowed_mime_types = ARRAY['application/pdf','application/epub+zip','image/jpeg','image/png','image/webp']
WHERE id = 'books';

-- No COMMENT ON storage.buckets here: the migration role does not own that
-- table (ERROR 42501, must be owner), and attempting it rolls the whole
-- migration back. The note lives in src/lib/uploadLimits.ts instead.

-- Back to 500 MB for films and episodes.
--
-- 20261009210000_entertainment_one_gigabyte.sql raised this bucket to 1 GB in
-- preparation for a paid plan. That is not wanted, so the ceiling returns to
-- the 500 MB it was before.
--
-- Nothing a person can do changes either way today: the Supabase PROJECT limit
-- applies to every bucket at once, the smaller of the two wins, and on the free
-- plan it is capped at 50 MB. So uploads stopped at 50 MB under 1 GB and they
-- stop at 50 MB under 500 MB. This keeps the bucket honest about the intent
-- rather than leaving a ceiling nobody asked for.

UPDATE storage.buckets
   SET file_size_limit = 500 * 1024 * 1024
 WHERE id = 'entertainment';

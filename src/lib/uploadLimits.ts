/**
 * How large an upload may be, in one place.
 *
 * Three limits apply to every upload and the smallest one wins:
 *
 *   1. the Supabase project's own limit, which applies to every bucket at once
 *      and is set in Dashboard > Storage > Settings > "Upload file size limit";
 *   2. the bucket's file_size_limit, set by migration;
 *   3. whatever the browser refuses before it starts.
 *
 * The first is the one that bites. It is enforced by the storage service before
 * a byte is sent -- a resumable upload is refused at session creation with
 * 413 "Maximum size exceeded" -- so no amount of chunking gets around it, and a
 * bucket that permits 500 MB still fails at 51 MB while the project allows 50.
 *
 * Keeping all three here means the interface can state a figure that is true.
 * Telling someone they may upload 500 MB and then failing at 51 MB wastes the
 * minutes they spent waiting.
 */

/**
 * The project-wide limit, in megabytes. CHANGE THIS when the dashboard setting
 * changes -- nothing else needs touching.
 *
 * The entertainment bucket now permits 1 GB (migration
 * 20261009210000_entertainment_one_gigabyte.sql) so that films can be 1 GB as
 * soon as the project allows it. This is the one number standing in the way.
 *
 * The free plan's ceiling is 50 MB and the setting cannot be raised past it.
 * Lifting this to 1024 requires the paid plan first, then the dashboard
 * setting; raising the number here without raising it there would only move
 * the failure later, after somebody had waited through the upload.
 */
export const PLATFORM_UPLOAD_MB = 50;

/** Each bucket's own file_size_limit, as set by migration. */
export const BUCKET_LIMIT_MB = {
  entertainment: 1024,
  research: 25,
  "service-files": 25,
  training: 8,
  initiative: 5,
  "media-public": 5,
  "payment-proofs": 5,
  books: 50,
  "delivery-proofs": 15,
  "id-documents": 15,
  "product-images": 10,
} as const;

export type UploadBucket = keyof typeof BUCKET_LIMIT_MB;

/** What a bucket actually accepts today: the smaller of its own limit and the project's. */
export const uploadLimitMb = (bucket: UploadBucket): number =>
  Math.min(BUCKET_LIMIT_MB[bucket], PLATFORM_UPLOAD_MB);

/** A refusal that says what is wrong and what to do, not just that it failed. */
export const tooLargeMessage = (file: { name: string; size: number }, limitMb: number): string =>
  `${file.name} is ${Math.round(file.size / 1024 / 1024)} MB. The largest upload is ${limitMb} MB.`;

/** True when the file is within what this bucket will take. */
export const withinLimit = (file: { size: number }, bucket: UploadBucket): boolean =>
  file.size > 0 && file.size <= uploadLimitMb(bucket) * 1024 * 1024;

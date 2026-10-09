import { supabase } from "@/integrations/supabase/client";
import { tooLargeMessage, uploadLimitMb, withinLimit } from "@/lib/uploadLimits";

// E-Library and Entertainment files are for subscribers: the buckets are private
// and Storage only signs links for people with an active subscription (and
// admins). Tables store each file's path; pages swap it for a link when they load.
export type LibraryBucket = "books" | "entertainment";

const LINK_SECONDS = 4 * 60 * 60; // long enough to read a book or watch a film

/** A stored value as a path in the bucket (older rows hold a full public address). */
export function libraryPath(bucket: LibraryBucket, value: string | null) {
  if (!value) return null;
  const m = value.match(new RegExp(`/object/(?:public|sign)/${bucket}/([^?]+)`));
  return m ? decodeURIComponent(m[1]) : value;
}

/** Uploads a file (admins) and returns the path to store. */
export async function uploadLibraryFile(bucket: LibraryBucket, prefix: string, file: File) {
  // Checked here rather than at each caller: Storage refuses an oversized file
  // with a message that says nothing useful, and by then the wait is wasted.
  if (!withinLimit(file, bucket)) throw new Error(tooLargeMessage(file, uploadLimitMb(bucket)));
  const path = `${prefix}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

/** The rows with the given file fields replaced by short-lived links (null where there is no access). */
export async function withLibraryLinks<T extends Record<string, unknown>>(bucket: LibraryBucket, rows: T[], fields: (keyof T)[]): Promise<T[]> {
  const paths = [...new Set(rows.flatMap((r) => fields.map((f) => libraryPath(bucket, r[f] as string | null))).filter(Boolean))] as string[];
  if (!paths.length) return rows;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, LINK_SECONDS);
  const links = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const f of fields) {
      const p = libraryPath(bucket, r[f] as string | null);
      out[f as string] = p ? links.get(p) ?? null : null;
    }
    return out as T;
  });
}

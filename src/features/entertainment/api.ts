// Isoko Entertainment: content, search, media links and saves.
// Everyone reads what is published (row-level security decides); media staff
// write through the same tables. Display images are public (media-public);
// full films and episodes are signed per request, for subscribers only.
import { useQuery } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { uploadLimitMb } from "@/lib/uploadLimits";
import { db, rpc, unwrap } from "@/features/services/api";

export type Status = "draft" | "published" | "scheduled" | "archived";
export type Section = "film" | "podcast" | "photo" | "art" | "fashion" | "live" | "event";

type Common = {
  id: string;
  slug: string;
  status: Status;
  publish_at: string | null;
  featured?: boolean;
  is_demo: boolean;
  created_at: string;
};

export type Category = { id: string; section: Section; slug: string; name: string; sort: number };

export type Creator = Common & {
  display_name: string;
  kinds: string[];
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatar_path: string | null;
  cover_path: string | null;
  services: string[];
  details: Record<string, string>;
  links: Record<string, string>;
  adult_confirmed: boolean;
};

export type WatchSource = "storage" | "youtube";

export type TitleKind = "film" | "podcast" | "series";

export type Title = Common & {
  kind: TitleKind;
  title: string;
  tagline: string | null;
  description: string | null;
  category_id: string | null;
  genres: string[];
  country: string | null;
  language: string | null;
  age_rating: string | null;
  release_date: string | null;
  duration_minutes: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  trailer_youtube: string | null;
  watch_source: WatchSource | null;
  watch_ref: string | null;
  is_free: boolean;
  trend_rank: number | null;
};

export type Credit = { id: string; title_id: string; creator_id: string | null; name: string; role: string; character_name: string | null; sort: number };

export type Episode = Common & {
  title_id: string;
  season: number;
  number: number;
  name: string;
  description: string | null;
  format: "audio" | "video";
  duration_minutes: number | null;
  thumb_path: string | null;
  watch_source: WatchSource | null;
  watch_ref: string | null;
  is_free: boolean;
};

export type Work = Common & {
  section: "photo" | "art" | "fashion";
  category_id: string | null;
  creator_id: string | null;
  title: string;
  description: string | null;
  cover_path: string | null;
  cover_w: number | null;
  cover_h: number | null;
  tags: string[];
  year: number | null;
  trend_rank: number | null;
};

export type WorkImage = { id: string; work_id: string; path: string; w: number | null; h: number | null; caption: string | null; kind: "image" | "before" | "after"; sort: number };

export type Collection = Common & {
  kind: "collection" | "campaign" | "show" | "lookbook" | "editorial";
  title: string;
  description: string | null;
  designer_id: string | null;
  season: string | null;
  held_on: string | null;
  cover_path: string | null;
};

export type EntEvent = Common & {
  category_id: string | null;
  title: string;
  description: string | null;
  held_on: string | null;
  location: string | null;
  cover_path: string | null;
  video_youtube: string | null;
};

export type EventImage = { id: string; event_id: string; path: string; w: number | null; h: number | null; caption: string | null; sort: number };

export type LiveStream = Common & {
  title: string;
  description: string | null;
  category_id: string | null;
  host_id: string | null;
  thumb_path: string | null;
  stream_ref: string | null;
  scheduled_at: string | null;
  live_state: "upcoming" | "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  recording_ref: string | null;
};

export type SearchHit = { kind: string; id: string; slug: string; title: string; subtitle: string | null; image_path: string | null };

// ============== MEDIA ==============
export const PUBLIC_BUCKET = "media-public";
export const PRIVATE_BUCKET = "entertainment";

/** Public address of a display image; "sm" is the small copy made at upload (for cards). */
export function mediaUrl(path: string | null | undefined, size: "sm" | "lg" = "lg") {
  if (!path) return null;
  const p = size === "sm" ? path.replace(/\.webp$/, "-sm.webp") : path;
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(p).data.publicUrl;
}

/** The 11-character video id from a YouTube id or any YouTube link. */
export function youtubeId(ref: string | null | undefined) {
  if (!ref) return null;
  const s = ref.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/live\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export const youtubeEmbed = (ref: string | null | undefined, autoplay = false) => {
  const id = youtubeId(ref);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1${autoplay ? "&autoplay=1&mute=1" : ""}` : null;
};

export const youtubeThumb = (ref: string | null | undefined) => {
  const id = youtubeId(ref);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
};

/**
 * A playable link for a film or episode: YouTube for free items, otherwise a
 * short-lived Storage link that only subscribers (and staff) can get.
 * null means "no access" (the page offers to subscribe).
 */
export async function playbackUrl(item: { watch_source: WatchSource | null; watch_ref: string | null }) {
  if (!item.watch_source || !item.watch_ref) return null;
  if (item.watch_source === "youtube") return youtubeEmbed(item.watch_ref, true);
  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(item.watch_ref, 4 * 60 * 60);
  return error ? null : data.signedUrl;
}

// Images are resized in the browser before upload (the free Supabase plan has no
// image transformations): a large copy for pages and a small one for cards.
async function toWebp(file: File, maxWidth: number): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This image couldn't be converted."))), "image/webp", 0.8),
  );
  return { blob, w, h };
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_IMAGE_MB = 25;

/** Uploads a display image (staff) and returns its path and size. */
export async function uploadDisplayImage(folder: string, file: File) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Please choose a JPEG, PNG, WebP or AVIF image.");
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`Images must be under ${MAX_IMAGE_MB} MB.`);
  const [lg, sm] = await Promise.all([toWebp(file, 1920), toWebp(file, 640)]);
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const store = supabase.storage.from(PUBLIC_BUCKET);
  const opts = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  unwrap(await store.upload(path, lg.blob, opts));
  unwrap(await store.upload(path.replace(/\.webp$/, "-sm.webp"), sm.blob, opts));
  return { path, w: lg.w, h: lg.h };
}

/**
 * The largest film or episode that can be uploaded, in megabytes.
 *
 * Not a number of its own any more. The bucket permits 500 MB but the project
 * permits less, and the smaller wins, so this is derived rather than stated:
 * saying 500 here while the project refuses anything over 50 told staff a
 * figure that was not true and failed their upload minutes later.
 * See src/lib/uploadLimits.ts -- there is one number to change.
 */
export const MAX_UPLOAD_MB = uploadLimitMb("entertainment");

export const MEDIA_TYPES = ["video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav"];

/**
 * Anything larger than this is sent in pieces instead of in one request. A film
 * takes minutes to upload, and one dropped connection would otherwise throw the
 * whole thing away.
 */
export const RESUMABLE_FROM_MB = 6;

/** Storage accepts resumable pieces of exactly this size. */
const CHUNK_BYTES = 6 * 1024 * 1024;

/**
 * Sends a large file in 6 MB pieces (the resumable protocol Storage speaks).
 * A piece that fails is retried on its own, so a film survives a connection
 * that comes and goes, and the browser can tell the staff how far it has got.
 */
async function uploadInPieces(path: string, file: File, onProgress?: (percent: number) => void) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again before uploading.");
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 6000, 12000, 24000],
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_BYTES,
      metadata: { bucketName: PRIVATE_BUCKET, objectName: path, contentType: file.type, cacheControl: "3600" },
      onError: (error) => reject(new Error(`The upload stopped: ${error.message}. Try again; it carries on from where it stopped.`)),
      onProgress: (sent, total) => onProgress?.(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    // carry on from an earlier attempt at the same file when there is one
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, () => upload.start());
  });
}

/**
 * Uploads a full film or episode to the private bucket (staff) and returns its
 * path. Small files go in one request; larger ones in pieces that can resume.
 */
export async function uploadMediaFile(folder: string, file: File, onProgress?: (percent: number) => void) {
  if (!MEDIA_TYPES.includes(file.type)) throw new Error("Please choose an MP4 or WebM video, or an MP3, M4A, AAC or WAV audio file.");
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Files must be under ${MAX_UPLOAD_MB} MB. Put longer videos on YouTube and paste the link.`);
  const path = `${folder}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
  if (file.size > RESUMABLE_FROM_MB * 1024 * 1024) {
    await uploadInPieces(path, file, onProgress);
    return path;
  }
  onProgress?.(0);
  unwrap(await supabase.storage.from(PRIVATE_BUCKET).upload(path, file, { contentType: file.type, upsert: false }));
  onProgress?.(100);
  return path;
}

// ============== QUERIES ==============
const PUBLISHED_ORDER = { ascending: false };

export function useCategories(section?: Section) {
  return useQuery({
    queryKey: ["ent", "categories", section ?? "all"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      let q = db.from("ent_categories").select("*").order("sort");
      if (section) q = q.eq("section", section);
      return unwrap(await q) as Category[];
    },
  });
}

export function useTitles(kind: TitleKind, limit = 60) {
  return useQuery({
    queryKey: ["ent", "titles", kind, limit],
    queryFn: async () =>
      unwrap(await db.from("ent_titles").select("*").eq("kind", kind).order("created_at", PUBLISHED_ORDER).limit(limit)) as Title[],
  });
}

export function useWorks(section: Work["section"], limit = 60) {
  return useQuery({
    queryKey: ["ent", "works", section, limit],
    queryFn: async () =>
      unwrap(await db.from("ent_works").select("*").eq("section", section).order("created_at", PUBLISHED_ORDER).limit(limit)) as Work[],
  });
}

export function useCollections(limit = 30) {
  return useQuery({
    queryKey: ["ent", "collections", limit],
    queryFn: async () => unwrap(await db.from("ent_collections").select("*").order("created_at", PUBLISHED_ORDER).limit(limit)) as Collection[],
  });
}

export function useCreators(kind?: string, limit = 60) {
  return useQuery({
    queryKey: ["ent", "creators", kind ?? "all", limit],
    queryFn: async () => {
      let q = db.from("ent_creators").select("*").order("featured", { ascending: false }).order("created_at", PUBLISHED_ORDER).limit(limit);
      if (kind) q = q.contains("kinds", [kind]);
      return unwrap(await q) as Creator[];
    },
  });
}

export function useEvents(limit = 60) {
  return useQuery({
    queryKey: ["ent", "events", limit],
    queryFn: async () => unwrap(await db.from("ent_events").select("*").order("held_on", { ascending: false, nullsFirst: false }).limit(limit)) as EntEvent[],
  });
}

export function useLiveStreams() {
  return useQuery({
    queryKey: ["ent", "live"],
    refetchInterval: 60_000, // a stream going live shows up without a reload
    queryFn: async () => unwrap(await db.from("ent_live_streams").select("*").order("scheduled_at", { ascending: true, nullsFirst: false })) as LiveStream[],
  });
}

/** One published item by its slug (null when it doesn't exist or isn't public). */
export function useBySlug<T>(table: string, slug: string | undefined) {
  return useQuery({
    queryKey: ["ent", table, "slug", slug],
    enabled: !!slug,
    queryFn: async () => unwrap(await db.from(table).select("*").eq("slug", slug).maybeSingle()) as T | null,
  });
}

export function useChildren<T>(table: string, column: string, id: string | undefined, order = "sort") {
  return useQuery({
    queryKey: ["ent", table, column, id],
    enabled: !!id,
    queryFn: async () => unwrap(await db.from(table).select("*").eq(column, id).order(order)) as T[],
  });
}

export function useEntSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["ent", "search", q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: () => rpc<SearchHit[]>("ent_search", { p_query: q, p_limit: 30 }),
  });
}

// ============== LINKS ==============
export const ENT = "/entertainment";

export function linkFor(kind: string, slug: string) {
  if (kind === "film") return `${ENT}/film/movies/${slug}`;
  if (kind === "series") return `${ENT}/film/tv-series/${slug}`;
  if (kind === "podcast") return `${ENT}/podcasts/${slug}`;
  if (kind === "creator") return `${ENT}/people/${slug}`;
  if (kind.startsWith("work")) return `${ENT}/work/${slug}`;
  if (kind === "collection") return `${ENT}/fashion/collections/${slug}`;
  if (kind === "design") return `${ENT}/fashion/hub/${slug}`;
  if (kind === "event") return `${ENT}/events/${slug}`;
  if (kind === "live") return `${ENT}/live/${slug}`;
  return ENT;
}

/** A film or series belongs to a genre (a category of section film) by its category or by name in its genres list. */
export const inGenre = (t: Title, g: Category) => {
  if (t.category_id === g.id) return true;
  const name = g.name.trim().toLowerCase();
  return t.genres.some((x) => {
    const n = x.trim().toLowerCase();
    return n === g.slug || n === name;
  });
};

/** Newest first, then the ones staff ranked or featured. */
export const trending = <T extends { trend_rank?: number | null; featured?: boolean }>(items: T[]) =>
  items.filter((i) => i.trend_rank != null).sort((a, b) => (a.trend_rank ?? 0) - (b.trend_rank ?? 0));

export const isPublic = (i: { status: Status; publish_at: string | null }) =>
  i.status === "published" || (i.status === "scheduled" && !!i.publish_at && new Date(i.publish_at) <= new Date());

/** What the public sees of a list (staff get drafts from the database too; the site shows them only in the media desk). */
export const onlyPublic = <T extends { status: Status; publish_at: string | null }>(items: T[] | undefined) => (items ?? []).filter(isPublic);

// Bunny Stream, kept behind Isoko's own door.
//
// POST { action: "upload",  kind, id }  -> { libraryId, videoId, signature, expires }   (media staff)
// POST { action: "status",  kind, id }  -> { status, progress, ready }                  (media staff)
// POST { action: "play",    kind, id }  -> { url, expires } | { reason }                (anyone)
//
// Why this exists at all: while films sat in Supabase Storage, the
// subscription rule was a row-level security policy, so the database refused
// to sign a link for anyone who had not paid and no amount of tampering in
// the browser changed that. A video on Bunny's CDN has no such policy. This
// function is where that rule now lives, and it is the only place that holds
// the keys to sign anything.
//
// Three rules it keeps, in order:
//   * it never accepts a video id from the caller, only the id of an Isoko
//     record, so nobody can name a video and be handed a token for it;
//   * it asks the database as the caller, so auth.uid() is the viewer and
//     the answer comes from the same functions the rest of the site uses;
//   * it signs only after the answer is yes.
//
// Bunny's own documentation asks for the same thing: its upload endpoints are
// public, and it says to check the user on every request and confirm they own
// a video before re-signing it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isGuid, playWindowSeconds, playbackToken, uploadSignature } from "./sign.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Bunny. None of these may ever reach the browser; they are read here and
// nowhere else, and nothing below ever puts one in a response.
const LIBRARY_ID = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") ?? "";
const API_KEY = Deno.env.get("BUNNY_STREAM_API_KEY") ?? "";
const TOKEN_KEY = Deno.env.get("BUNNY_STREAM_TOKEN_KEY") ?? "";
const VIDEO_API = "https://video.bunnycdn.com";
const EMBED = "https://iframe.mediadelivery.net/embed";

/** How long an upload may take before its signature has to be renewed. */
const UPLOAD_WINDOW = 6 * 60 * 60;
/** The longest a playback link may live, however long the film is. */
const PLAY_MAX = 6 * 60 * 60;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** A record id looks the same as a video id; only where it came from differs. */
const isUuid = isGuid;

const TABLE = { title: "ent_titles", episode: "ent_episodes" } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (!LIBRARY_ID || !API_KEY || !TOKEN_KEY) return reply(503, { error: "Video hosting is not configured yet." });

  const body = await req.json().catch(() => null) as { action?: string; kind?: string; id?: string } | null;
  const action = String(body?.action ?? "");
  const kind = String(body?.kind ?? "");
  const id = String(body?.id ?? "");
  if (!["upload", "status", "play"].includes(action)) return reply(400, { error: "Unknown action" });
  if (kind !== "title" && kind !== "episode") return reply(400, { error: "Unknown kind" });
  if (!isUuid(id)) return reply(400, { error: "Invalid id" });

  // Asked as the caller, so auth.uid() in the database is them -- the same
  // arrangement file-access uses. A signed-out visitor is anon, which is a
  // real answer here: free films are for people with no account.
  const authorization = req.headers.get("authorization") ?? "";
  const asCaller = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authorization ? { Authorization: authorization } : {} },
  });

  // ---------- watching ----------
  if (action === "play") {
    const { data, error } = await asCaller.rpc("ent_playback_check", { p_kind: kind, p_id: id });
    if (error) return reply(403, { error: "This video can't be played." });
    const verdict = data as { allowed?: boolean; reason?: string; video_id?: string; minutes?: number | null };
    if (!verdict?.allowed) return reply(403, { reason: verdict?.reason ?? "missing" });
    // The database hands back the id; the caller never supplied one.
    if (!isGuid(verdict.video_id)) return reply(409, { reason: "not_hosted" });

    const expires = Math.floor(Date.now() / 1000) + playWindowSeconds(verdict.minutes ?? null, PLAY_MAX);
    const token = await playbackToken(TOKEN_KEY, verdict.video_id, expires);
    return reply(200, { url: `${EMBED}/${LIBRARY_ID}/${verdict.video_id}?token=${token}&expires=${expires}`, expires });
  }

  // ---------- everything below is staff ----------
  if (!/^Bearer .+/i.test(authorization)) return reply(401, { error: "Please sign in" });
  const { data: check, error: checkError } = await asCaller.rpc("ent_upload_check", { p_kind: kind, p_id: id });
  if (checkError) return reply(403, { error: "You can't manage this video" });
  const record = check as { allowed?: boolean; reason?: string; title?: string; video_id?: string | null };
  if (!record?.allowed) {
    return reply(record?.reason === "missing" ? 404 : 403, { error: "You can't manage this video" });
  }

  if (action === "status") {
    if (!isGuid(record.video_id)) return reply(409, { error: "No video has been uploaded yet." });
    const res = await fetch(`${VIDEO_API}/library/${LIBRARY_ID}/videos/${record.video_id}`, {
      headers: { AccessKey: API_KEY, Accept: "application/json" },
    });
    if (!res.ok) return reply(502, { error: `The video host answered ${res.status}.` });
    const video = await res.json() as { status?: number; encodeProgress?: number; hasOriginal?: boolean };
    // 4 is Finished. 5 Error and 6 UploadFailed are the two ways it ends
    // badly, and they are final -- which is why they are recorded rather
    // than left looking like "not finished yet" forever.
    const ready = video.status === 4;
    const failed = video.status === 5 || video.status === 6;
    // Written with the service role: staff may edit the row, but how the
    // conversion went is the host's statement about the file, not something
    // the desk types in.
    await admin.from(TABLE[kind]).update({ watch_ready: ready, watch_failed: failed }).eq("id", id);
    return reply(200, {
      status: video.status ?? 0,
      progress: video.encodeProgress ?? 0,
      ready,
      failed,
      // Whether the library kept the file as it was uploaded, which is a
      // library setting rather than anything this function controls.
      hasOriginal: !!video.hasOriginal,
    });
  }

  // ---------- uploading ----------
  // Reuse the id this record already has, so an upload that dropped resumes
  // into the same video instead of leaving an abandoned one behind it.
  let videoId = isGuid(record.video_id) ? record.video_id : null;
  if (!videoId) {
    const created = await fetch(`${VIDEO_API}/library/${LIBRARY_ID}/videos`, {
      method: "POST",
      headers: { AccessKey: API_KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: String(record.title ?? "Untitled").slice(0, 200) }),
    });
    if (!created.ok) return reply(502, { error: `The video host refused to create the video (${created.status}).` });
    const made = await created.json() as { guid?: string };
    if (!isGuid(made.guid)) return reply(502, { error: "The video host returned no video id." });
    videoId = made.guid;
    // Recorded before a byte is sent: a dropped upload must leave the id
    // behind to resume into, not a record pointing at nothing.
    const { error: saveError } = await admin
      .from(TABLE[kind])
      .update({ watch_source: "bunny", watch_ref: videoId, watch_ready: false, watch_failed: false })
      .eq("id", id);
    if (saveError) {
      // The video exists at the host but nothing here points at it, so a
      // retry would make a second one and the first would sit there forever
      // costing storage. Take it back before admitting the failure; if even
      // that fails there is nothing further to try from here.
      await fetch(`${VIDEO_API}/library/${LIBRARY_ID}/videos/${videoId}`, {
        method: "DELETE",
        headers: { AccessKey: API_KEY, Accept: "application/json" },
      }).catch(() => undefined);
      return reply(500, { error: "The video could not be attached to this item. Please try again." });
    }
  } else {
    // Uploading again is how a failed conversion is retried, so the failure
    // is cleared here rather than lingering over the new attempt.
    await admin.from(TABLE[kind]).update({ watch_ready: false, watch_failed: false }).eq("id", id);
  }

  const expires = Math.floor(Date.now() / 1000) + UPLOAD_WINDOW;
  const signature = await uploadSignature(LIBRARY_ID, API_KEY, expires, videoId);
  return reply(200, { libraryId: LIBRARY_ID, videoId, signature, expires });
});

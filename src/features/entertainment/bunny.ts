// Talking to Bunny Stream, always through Isoko's own door.
//
// Nothing here knows a library key, an API key or a signing key: every one of
// them stays in the bunny-video Edge Function. The browser asks that function
// about an Isoko record -- a film or an episode -- and gets back either a
// signed thing it may use for a while, or a reason it may not. It never sends
// a video id, because a video id the browser chose would be a video id the
// browser could swap.
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

/** The two kinds of record a Bunny video can belong to. */
export type BunnyKind = "title" | "episode";

/**
 * Why a video will not play, in the words the function uses.
 *
 * These are separate on purpose. "Still processing", "subscribe" and "this
 * does not exist" are three different things to tell somebody, and the player
 * used to have one sentence for every failure.
 */
export type PlaybackRefusal = "missing" | "processing" | "failed" | "subscription" | "not_hosted" | "unknown";

export type BunnyPlayback = { url: string; expires: number };
export type BunnyUploadTicket = { libraryId: string; videoId: string; signature: string; expires: number };
export type BunnyStatus = { status: number; progress: number; ready: boolean; failed: boolean; hasOriginal: boolean };

/**
 * The containers the provider documents as acceptable input.
 *
 * Checked before a byte is sent. The provider would refuse an unsupported
 * file too, but only after the whole thing had been uploaded -- which for a
 * film is the difference between a sentence and half an hour. The browser's
 * reported type is not used: Windows reports nothing at all for .mkv, which
 * is one of the formats this exists to accept.
 */
export const SOURCE_CONTAINERS = [
  "mp4", "mkv", "webm", "mov", "avi", "flv", "wmv", "ts", "mpeg", "mpg", "m4v", "amv", "4mv", "vod",
];

/** What the file picker should offer: the containers, by name and by type. */
export const SOURCE_ACCEPT = `${SOURCE_CONTAINERS.map((e) => `.${e}`).join(",")},video/*`;

/** Why this file cannot be sent to the host, or null when it can. */
export function sourceFileError(file: { name: string }): string | null {
  // split(".").pop() on a name with no dot returns the whole name, which
  // would be reported back to the person as though it were the extension.
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!ext) return `This file has no extension, so the video host cannot tell what it is. Use ${SOURCE_CONTAINERS.slice(0, 6).join(", ")} or similar.`;
  if (!SOURCE_CONTAINERS.includes(ext)) {
    return `The video host does not accept .${ext} files. Use ${SOURCE_CONTAINERS.slice(0, 6).join(", ")} or similar.`;
  }
  return null;
}

const call = async <T,>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; reason: PlaybackRefusal; message: string }> => {
  const { data, error } = await supabase.functions.invoke("bunny-video", { body });
  if (!error) return { ok: true, data: data as T };
  // The function answers a refusal with a reason in the body; supabase-js
  // turns any non-2xx into an error, so the body has to be read back out.
  let reason: PlaybackRefusal = "unknown";
  let message = "This video is not available right now.";
  const ctx = (error as { context?: Response }).context;
  if (ctx) {
    try {
      const parsed = await ctx.json();
      if (parsed?.reason) reason = parsed.reason as PlaybackRefusal;
      if (parsed?.error) message = String(parsed.error);
    } catch {
      // no JSON body: the generic message stands
    }
  }
  return { ok: false, reason, message };
};

/** A signed embed link for a film or episode, or the reason there isn't one. */
export async function bunnyPlayback(kind: BunnyKind, id: string) {
  return call<BunnyPlayback>({ action: "play", kind, id });
}

/** Where Bunny has got to with the file. Staff only; the function enforces that. */
export async function bunnyStatus(kind: BunnyKind, id: string) {
  return call<BunnyStatus>({ action: "status", kind, id });
}

/**
 * Sends a film to Bunny, in resumable pieces.
 *
 * The signature comes from the server and covers one video id, which the
 * server chose and wrote to the record before any byte was sent. That is what
 * makes an interrupted upload safe to repeat: the second attempt resumes into
 * the same video rather than creating another one and orphaning the first.
 *
 * There is no size limit here, which is the entire point. The 50 MB ceiling
 * belonged to the Supabase project, not to films.
 */
export async function uploadToBunny(kind: BunnyKind, id: string, file: File, onProgress?: (percent: number) => void) {
  const wrong = sourceFileError(file);
  if (wrong) throw new Error(wrong);
  const ticket = await call<BunnyUploadTicket>({ action: "upload", kind, id });
  if (!ticket.ok) throw new Error(ticket.message);
  const { libraryId, videoId, signature, expires } = ticket.data;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: "https://video.bunnycdn.com/tusupload",
      retryDelays: [0, 3000, 6000, 12000, 24000],
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expires),
        LibraryId: libraryId,
        VideoId: videoId,
      },
      metadata: { filetype: file.type || "video/mp4", title: file.name.slice(0, 200) },
      onError: (error) => reject(new Error(`The upload stopped: ${error.message}. Try again; it carries on from where it stopped.`)),
      onProgress: (sent, total) => onProgress?.(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, () => upload.start());
  });

  return videoId;
}

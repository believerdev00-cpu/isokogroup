/**
 * What kind of thing a file is, in one place.
 *
 * Buckets across the site now accept video and audio as well as stills, so
 * anywhere that used to assume "this path is an image" has to ask instead. The
 * answer comes from the extension because that is what the uploader wrote into
 * the path; the MIME type is not stored alongside it.
 */

export type MediaKind = "image" | "video" | "audio" | "other";

const VIDEO_EXT = ["mp4", "webm", "mkv", "mov", "m4v"];
const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "oga", "ogg"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif"];

export const extensionOf = (path: string | null | undefined) =>
  (path ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";

export function mediaKindOf(path: string | null | undefined): MediaKind {
  const e = extensionOf(path);
  if (VIDEO_EXT.includes(e)) return "video";
  if (AUDIO_EXT.includes(e)) return "audio";
  if (IMAGE_EXT.includes(e)) return "image";
  return "other";
}

export const isVideoPath = (p: string | null | undefined) => mediaKindOf(p) === "video";
export const isAudioPath = (p: string | null | undefined) => mediaKindOf(p) === "audio";
export const isImagePath = (p: string | null | undefined) => mediaKindOf(p) === "image";

/** What a file picker should offer. The bucket's allowed_mime_types is the real rule. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/x-matroska,.mkv";
export const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/aac,audio/wav,.mp3,.m4a,.aac,.wav";
export const MEDIA_ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT},${AUDIO_ACCEPT}`;

/** The same question about a File being chosen, before anything is uploaded. */
export function fileKind(file: { name: string; type: string }): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return mediaKindOf(file.name);
}

/** True for anything the media buckets will take: a still, a video or a sound. */
export const isMediaFile = (file: { name: string; type: string }) => fileKind(file) !== "other";

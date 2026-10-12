// The two signatures Bunny Stream asks for.
//
// Kept apart from the function that uses them for one reason: the order of
// the concatenated parts is the whole security property, it is impossible to
// eyeball, and a wrong order fails as a 403 at playback rather than as
// anything a reader would recognise. Here it can be tested.
//
// Both are documented by the provider:
//   upload   SHA256(library_id + api_key + expiration_time + video_id)
//   playback SHA256(token_security_key + video_id + expiration)
//
// Note the two use different keys. The token security key is on the library's
// Security page and is NOT the library API key, although the field is also
// labelled "API key" -- mixing them up yields a signature that looks perfectly
// well-formed and is refused.

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (text: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** Authorises one resumable upload of one video. */
export const uploadSignature = (libraryId: string, apiKey: string, expires: number, videoId: string) =>
  sha256Hex(`${libraryId}${apiKey}${expires}${videoId}`);

/** Admits one viewer to one video until `expires` (a UNIX time in seconds). */
export const playbackToken = (tokenKey: string, videoId: string, expires: number) =>
  sha256Hex(`${tokenKey}${videoId}${expires}`);

/**
 * How long a playback link lasts: the film, plus enough slack to pause and
 * come back.
 *
 * The length of the film is the floor, never the thing that gets trimmed.
 * An earlier version capped the whole window at six hours, which is longer
 * than most films and shorter than some: a five-and-a-half-hour film got a
 * link that died with half an hour still to watch, and since the player
 * never asks for a second link, it died mid-sentence. A cap that can cut
 * below the runtime is not a safety limit, it is a bug waiting for a long
 * film -- so the cap now applies only when the runtime is unknown.
 *
 * Nothing here is unbounded: the column accepts at most 1000 minutes and the
 * provider at most 72 hours, so the worst case is a little over 17 hours for
 * a film somebody has declared to be 16 hours long.
 */
const SLACK = 45 * 60;
const UNKNOWN_LENGTH = 6 * 60 * 60;
export const playWindowSeconds = (minutes: number | null | undefined, unknownDefault = UNKNOWN_LENGTH) =>
  !minutes || minutes <= 0 ? unknownDefault : minutes * 60 + SLACK;

/** A Bunny video id, and nothing that merely looks like one. */
export const isGuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

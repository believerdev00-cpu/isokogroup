import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const tusUploads = vi.hoisted(() => [] as { file: unknown; options: Record<string, never> & Record<string, unknown>; started: boolean }[]);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload }) }, auth: { getSession } },
}));

// A stand-in for the resumable protocol: it records how it was set up, reports
// progress and succeeds, so the test can check what the browser would send.
vi.mock("tus-js-client", () => ({
  Upload: class {
    file: unknown;
    options: Record<string, unknown>;
    entry: { file: unknown; options: Record<string, unknown>; started: boolean };
    constructor(file: unknown, options: Record<string, unknown>) {
      this.file = file;
      this.options = options;
      this.entry = { file, options, started: false };
      tusUploads.push(this.entry as never);
    }
    findPreviousUploads() {
      return Promise.resolve([]);
    }
    resumeFromPreviousUpload() {}
    start() {
      this.entry.started = true;
      const size = (this.file as { size: number }).size;
      (this.options.onProgress as (a: number, b: number) => void)?.(size / 2, size);
      (this.options.onProgress as (a: number, b: number) => void)?.(size, size);
      (this.options.onSuccess as () => void)?.();
    }
  },
}));

import { MATROSKA, MAX_UPLOAD_MB, MEDIA_TYPES, PRIVATE_BUCKET, RESUMABLE_FROM_MB, mediaTypeOf, playbackWindowSeconds, uploadMediaFile } from "./api";
import { BUCKET_LIMIT_MB, PLATFORM_UPLOAD_MB } from "@/lib/uploadLimits";

/** A File of a given size without putting the bytes in memory. */
const sized = (mb: number, type = "video/mp4", name = "film.mp4") => {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: Math.round(mb * 1024 * 1024) });
  return f;
};

describe("how large a film may be", () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({ data: { path: "films/x.mp4" }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: "staff-token" } } });
    tusUploads.length = 0;
  });

  it("never promises more than the project will actually accept", () => {
    // The bucket permits 500 MB; the project permits less and refuses the
    // rest before a byte is sent. Promising the bucket's figure failed real
    // uploads minutes in, so the smaller of the two wins.
    expect(MAX_UPLOAD_MB).toBe(Math.min(BUCKET_LIMIT_MB.entertainment, PLATFORM_UPLOAD_MB));
    expect(MAX_UPLOAD_MB).toBeLessThanOrEqual(PLATFORM_UPLOAD_MB);
    expect(PRIVATE_BUCKET).toBe("entertainment");
  });
  it("sends a small file in one request, as it always did", async () => {
    await expect(uploadMediaFile("films", sized(5))).resolves.toMatch(/^films\/.+\.mp4$/);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "video/mp4", upsert: false });
    expect(tusUploads).toHaveLength(0);
  });

  it("sends anything larger in pieces that can carry on after a break", async () => {
    // every size the platform actually accepts, up to the limit itself
    const sizes = [20, 49, MAX_UPLOAD_MB].filter((mb) => mb > RESUMABLE_FROM_MB);
    for (const mb of sizes) {
      await expect(uploadMediaFile("films", sized(mb))).resolves.toMatch(/^films\//);
    }
    expect(upload).not.toHaveBeenCalled();
    expect(tusUploads).toHaveLength(sizes.length);
    expect(tusUploads.every((u) => u.started)).toBe(true);
    const { options } = tusUploads[0];
    expect(options.chunkSize).toBe(6 * 1024 * 1024); // the only piece size Storage accepts
    expect(options.metadata).toMatchObject({ bucketName: "entertainment", contentType: "video/mp4" });
    expect(String((options.metadata as { objectName: string }).objectName)).toMatch(/^films\/.+\.mp4$/);
    expect(options.endpoint).toMatch(/\/storage\/v1\/upload\/resumable$/);
    expect((options.headers as { authorization: string }).authorization).toBe("Bearer staff-token");
    expect((options.retryDelays as number[]).length).toBeGreaterThan(3);
    expect(RESUMABLE_FROM_MB).toBe(6);
  });

  it("tells the desk how far a long upload has got", async () => {
    const seen: number[] = [];
    await uploadMediaFile("films", sized(MAX_UPLOAD_MB), (p) => seen.push(p));
    expect(seen).toEqual([50, 100]);
  });

  it("refuses a film over the maximum before anything is sent", async () => {
    await expect(uploadMediaFile("films", sized(MAX_UPLOAD_MB + 1)))
      .rejects.toThrow(new RegExp("under " + MAX_UPLOAD_MB + " MB"));
    await expect(uploadMediaFile("films", sized(MAX_UPLOAD_MB * 4)))
      .rejects.toThrow(new RegExp("under " + MAX_UPLOAD_MB + " MB"));
    expect(upload).not.toHaveBeenCalled();
    expect(tusUploads).toHaveLength(0);
  });

  it("still only takes the file types the player can read", async () => {
    expect(MEDIA_TYPES).toContain("video/mp4");
    await expect(uploadMediaFile("films", sized(10, "application/zip")))
      .rejects.toThrow(/MP4, WebM or MKV/);
    expect(tusUploads).toHaveLength(0);
  });

  it("asks a signed-out visitor to sign in instead of uploading", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadMediaFile("films", sized(MAX_UPLOAD_MB))).rejects.toThrow(/sign in/i);
    expect(tusUploads).toHaveLength(0);
  });

  it("keeps the file's own extension", async () => {
    await expect(uploadMediaFile("episodes", sized(MAX_UPLOAD_MB, "video/webm", "episode one.webm"))).resolves.toMatch(/^episodes\/.+\.webm$/);
    expect((tusUploads[0].options.metadata as { contentType: string }).contentType).toBe("video/webm");
  });
});

// The signed link is the film. It sits in the page, and anyone who copies it
// can fetch the whole file until it expires, so it should not outlive the
// viewing by hours. It also must not expire during the viewing: the player
// never asks for a fresh one, so a window that closes mid-film stops playback.
describe("how long a film's link stays usable", () => {
  it("outlasts the film it is for", () => {
    for (const mins of [5, 22, 45, 90, 150]) {
      expect(playbackWindowSeconds(mins)).toBeGreaterThan(mins * 60);
    }
  });

  it("is far shorter than four hours for a short episode", () => {
    const FOUR_HOURS = 4 * 60 * 60;
    expect(playbackWindowSeconds(20)).toBeLessThan(FOUR_HOURS / 2);
    expect(playbackWindowSeconds(45)).toBeLessThan(FOUR_HOURS);
  });

  it("never exceeds four hours, however long the film claims to be", () => {
    for (const mins of [200, 500, 1000]) {
      expect(playbackWindowSeconds(mins)).toBeLessThanOrEqual(4 * 60 * 60);
    }
  });

  it("falls back to four hours when the runtime is unknown", () => {
    for (const unknown of [null, undefined, 0]) {
      expect(playbackWindowSeconds(unknown)).toBe(4 * 60 * 60);
    }
  });

  it("gives at least half an hour, so a very short clip is not cut off", () => {
    expect(playbackWindowSeconds(1)).toBeGreaterThanOrEqual(30 * 60);
  });
});

// Matroska is the awkward one: Windows has no MIME mapping for .mkv, so the
// browser hands over a File with an empty type. The old check compared that
// empty string against the list and refused it, and the upload would have been
// labelled with nothing, which Storage rejects on its own.
describe("choosing a Matroska file", () => {
  const named = (name: string, type: string) => ({ name, type });

  it("accepts .mkv when the browser knows the type", () => {
    expect(mediaTypeOf(named("film.mkv", "video/x-matroska"))).toBe("video/x-matroska");
  });

  it("accepts .mkv when the browser says nothing at all", () => {
    for (const blank of ["", "application/octet-stream", "binary/octet-stream"]) {
      expect(mediaTypeOf(named("film.mkv", blank))).toBe("video/x-matroska");
      expect(mediaTypeOf(named("FILM.MKV", blank))).toBe("video/x-matroska");
    }
  });

  it("still accepts everything it accepted before", () => {
    expect(mediaTypeOf(named("a.mp4", "video/mp4"))).toBe("video/mp4");
    expect(mediaTypeOf(named("a.webm", "video/webm"))).toBe("video/webm");
    expect(mediaTypeOf(named("a.mp3", "audio/mpeg"))).toBe("audio/mpeg");
    expect(mediaTypeOf(named("a.wav", "audio/wav"))).toBe("audio/wav");
    expect(mediaTypeOf(named("a.m4a", "audio/mp4"))).toBe("audio/mp4");
  });

  it("reads the name only when the browser gave nothing, never to override it", () => {
    // a type we do not take is refused even if the name looks acceptable
    expect(mediaTypeOf(named("film.mkv", "application/zip"))).toBe("");
    expect(mediaTypeOf(named("film.mp4", "text/html"))).toBe("");
  });

  it("refuses an unknown extension when the browser gave nothing", () => {
    for (const name of ["film.exe", "film.avi", "film", "film.mov"]) {
      expect(mediaTypeOf(named(name, ""))).toBe("");
    }
  });

  it("lists Matroska among the types the player will be offered", () => {
    expect(MEDIA_TYPES).toContain("video/x-matroska");
    expect(MATROSKA).toBe("video/x-matroska");
  });
});

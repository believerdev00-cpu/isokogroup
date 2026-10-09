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

import { MAX_UPLOAD_MB, MEDIA_TYPES, PRIVATE_BUCKET, RESUMABLE_FROM_MB, uploadMediaFile } from "./api";
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
    await expect(uploadMediaFile("films", sized(10, "application/zip"))).rejects.toThrow(/MP4 or WebM/);
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload }) } },
}));

import { MAX_UPLOAD_MB, MEDIA_TYPES, PRIVATE_BUCKET, uploadMediaFile } from "./api";

const film = (mb: number, type = "video/mp4") =>
  new File([new Uint8Array(0)], "film.mp4", { type }) as File & { size: number };

/** A File of a given size without putting the bytes in memory. */
const sized = (mb: number, type = "video/mp4") => {
  const f = film(mb, type);
  Object.defineProperty(f, "size", { value: Math.round(mb * 1024 * 1024) });
  return f;
};

describe("how large a film may be", () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({ data: { path: "films/x.mp4" }, error: null });
  });

  it("is five hundred megabytes, the same as the bucket allows", () => {
    expect(MAX_UPLOAD_MB).toBe(500);
    expect(MAX_UPLOAD_MB * 1024 * 1024).toBe(524_288_000); // storage.buckets.file_size_limit for 'entertainment'
    expect(PRIVATE_BUCKET).toBe("entertainment");
  });

  it("uploads the sizes that already worked", async () => {
    for (const mb of [20, 49, 50]) {
      await expect(uploadMediaFile("films", sized(mb))).resolves.toMatch(/^films\/.+\.mp4$/);
    }
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it("uploads the larger films that used to be refused", async () => {
    for (const mb of [51, 120, 480, 500]) {
      await expect(uploadMediaFile("films", sized(mb))).resolves.toMatch(/^films\//);
    }
    expect(upload).toHaveBeenCalledTimes(4);
  });

  it("refuses a film over the maximum before anything is sent", async () => {
    await expect(uploadMediaFile("films", sized(501))).rejects.toThrow(/under 500 MB/);
    await expect(uploadMediaFile("films", sized(1200))).rejects.toThrow(/under 500 MB/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("still only takes the file types the player can read", async () => {
    expect(MEDIA_TYPES).toContain("video/mp4");
    await expect(uploadMediaFile("films", sized(10, "application/zip"))).rejects.toThrow(/MP4 or WebM/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("keeps the file's own extension and sends its content type", async () => {
    const webm = sized(60, "video/webm");
    Object.defineProperty(webm, "name", { value: "episode one.webm" });
    await expect(uploadMediaFile("episodes", webm)).resolves.toMatch(/^episodes\/.+\.webm$/);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "video/webm", upsert: false });
  });
});

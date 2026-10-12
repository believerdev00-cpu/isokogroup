import { beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.hoisted(() => vi.fn());
const asked = vi.hoisted(() => [] as { bucket: string; path: string }[]);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        info: (path: string) => {
          asked.push({ bucket, path });
          return info(path);
        },
      }),
    },
  },
}));

import { assertStored } from "./uploadVerify";

const stored = (size: number) => info.mockResolvedValue({ data: { name: "films/a.mp4", size }, error: null });
const refused = (statusCode: string, message: string) => info.mockResolvedValue({ data: null, error: { statusCode, message } });

// A film on the live site was 24 bytes. The upload had reported success, the
// desk saved the path, the item was published, and the first anyone knew was a
// visitor pressing play -- told by the player that their browser was at fault.
// Everything here is about finding that out at upload time instead.
describe("confirming an upload actually arrived", () => {
  beforeEach(() => {
    info.mockReset();
    asked.length = 0;
  });

  it("accepts a file that arrived whole", async () => {
    stored(1024);
    await expect(assertStored("entertainment", "films/a.mp4", 1024)).resolves.toBeUndefined();
    expect(asked).toEqual([{ bucket: "entertainment", path: "films/a.mp4" }]);
  });

  it("refuses the 24-byte film that started this", async () => {
    stored(24);
    await expect(assertStored("entertainment", "films/a.mp4", 740 * 1024 * 1024)).rejects.toThrow(/stopped early/);
  });

  it("says how much of how much, in a unit the desk can act on", async () => {
    stored(24);
    // "0.0 MB of 740.0 MB" says upload it again; "24 of 775946240" does not.
    await expect(assertStored("entertainment", "films/a.mp4", 740 * 1024 * 1024)).rejects.toThrow("0.0 MB of 740.0 MB");
  });

  it("refuses a file one byte short, not just an obviously tiny one", async () => {
    // There is no threshold for "implausibly small" that a half-written film
    // cannot sit above. The whole file arrived or it did not.
    stored(1023);
    await expect(assertStored("entertainment", "films/a.mp4", 1024)).rejects.toThrow(/stopped early/);
  });

  it("refuses an upload that left nothing behind", async () => {
    refused("404", "Object not found");
    await expect(assertStored("entertainment", "films/a.mp4", 1024)).rejects.toThrow(/did not finish/);
  });

  it("refuses when storage will not say what arrived", async () => {
    // Publishing a film nobody can watch is worse than one more upload, so a
    // read that fails is a refusal rather than the benefit of the doubt.
    refused("500", "network down");
    await expect(assertStored("entertainment", "films/a.mp4", 1024)).rejects.toThrow(/could not be confirmed/);
  });

  it("refuses a reply with no size in it", async () => {
    info.mockResolvedValue({ data: { name: "films/a.mp4" }, error: null });
    await expect(assertStored("entertainment", "films/a.mp4", 1024)).rejects.toThrow(/did not finish/);
  });

  it("checks the bucket it was given, not one of its own choosing", async () => {
    stored(10);
    await assertStored("media-public", "works/a.mp4", 10);
    expect(asked[0].bucket).toBe("media-public");
  });
});

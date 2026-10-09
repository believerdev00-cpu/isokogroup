// The figure shown to staff has to be one the storage service will honour.
// Telling somebody they may upload 500 MB and refusing them at 51 MB wasted the
// minutes they spent waiting, and that is the mistake these hold shut.
import { describe, expect, it } from "vitest";
import {
  BUCKET_LIMIT_MB, PLATFORM_UPLOAD_MB, tooLargeMessage, uploadLimitMb, withinLimit,
  type UploadBucket,
} from "./uploadLimits";

const buckets = Object.keys(BUCKET_LIMIT_MB) as UploadBucket[];

describe("how large an upload may be", () => {
  it("never offers more than the project itself will accept", () => {
    for (const b of buckets) {
      expect(uploadLimitMb(b)).toBeLessThanOrEqual(PLATFORM_UPLOAD_MB);
    }
  });

  it("uses the bucket's own limit when that is the smaller one", () => {
    // initiative allows 5 MB, far below the project's limit
    expect(uploadLimitMb("initiative")).toBe(BUCKET_LIMIT_MB.initiative);
    expect(uploadLimitMb("training")).toBe(BUCKET_LIMIT_MB.training);
  });

  it("caps a generous bucket at the project's limit", () => {
    // the entertainment bucket permits 500 MB; the project is what bites
    expect(BUCKET_LIMIT_MB.entertainment).toBeGreaterThan(PLATFORM_UPLOAD_MB);
    expect(uploadLimitMb("entertainment")).toBe(PLATFORM_UPLOAD_MB);
  });

  it("accepts any size up to the limit, with no minimum", () => {
    for (const mb of [0.001, 1, 5, 20, 49, PLATFORM_UPLOAD_MB]) {
      expect(withinLimit({ size: Math.round(mb * 1024 * 1024) }, "entertainment")).toBe(true);
    }
  });

  it("refuses an empty file and anything past the limit", () => {
    expect(withinLimit({ size: 0 }, "entertainment")).toBe(false);
    expect(withinLimit({ size: (PLATFORM_UPLOAD_MB + 1) * 1024 * 1024 }, "entertainment")).toBe(false);
  });

  it("says how big the file is and what is allowed, not just that it failed", () => {
    const msg = tooLargeMessage({ name: "film.mp4", size: 120 * 1024 * 1024 }, 50);
    expect(msg).toContain("film.mp4");
    expect(msg).toContain("120 MB");
    expect(msg).toContain("50 MB");
  });

  it("covers every bucket the site uploads to", () => {
    for (const b of ["entertainment", "books", "product-images", "id-documents",
                     "delivery-proofs", "initiative", "training", "research",
                     "service-files", "media-public", "payment-proofs"]) {
      expect(buckets).toContain(b);
    }
  });
});

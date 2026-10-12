// The signatures Bunny Stream checks.
//
// The order of the concatenated parts is the whole security property and it
// cannot be read off the hash, so these pin it against independently computed
// digests. The expected values here are SHA-256 of the documented string,
// written out literally rather than produced by calling the function under
// test, so a reordering is caught instead of being blessed.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isGuid, playWindowSeconds, playbackToken, uploadSignature } from "../functions/bunny-video/sign.ts";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("the upload signature", () => {
  it("hashes library, key, expiry and video, in that order", async () => {
    const got = await uploadSignature("12345", "secret-api-key", 1700000000, "abc");
    expect(got).toBe(sha256("12345secret-api-key1700000000abc"));
  });

  it("is not the same as any other ordering of the same parts", async () => {
    const got = await uploadSignature("12345", "secret-api-key", 1700000000, "abc");
    expect(got).not.toBe(sha256("secret-api-key123451700000000abc"));
    expect(got).not.toBe(sha256("12345secret-api-keyabc1700000000"));
  });

  it("changes when the expiry does, so an old ticket cannot be replayed", async () => {
    const a = await uploadSignature("1", "k", 1700000000, "v");
    const b = await uploadSignature("1", "k", 1700000001, "v");
    expect(a).not.toBe(b);
  });
});

describe("the playback token", () => {
  it("hashes the token key, video and expiry, in that order", async () => {
    const got = await playbackToken("token-security-key", "video-guid", 1456761770);
    expect(got).toBe(sha256("token-security-keyvideo-guid1456761770"));
  });

  it("uses the token security key, which is not the library API key", async () => {
    // The two fields are both labelled "API key" in the dashboard; mixing
    // them produces a well-formed signature that Bunny refuses with a 403.
    const withTokenKey = await playbackToken("token-security-key", "v", 1);
    const withApiKey = await playbackToken("library-api-key", "v", 1);
    expect(withTokenKey).not.toBe(withApiKey);
  });

  it("gives a different token per video, so one link does not open another", async () => {
    expect(await playbackToken("k", "video-a", 1)).not.toBe(await playbackToken("k", "video-b", 1));
  });
});

describe("how long a playback link lasts", () => {
  it("covers the film plus time to pause", () => {
    expect(playWindowSeconds(100)).toBe(100 * 60 + 45 * 60);
  });

  it("gives even a one-minute clip the full slack, so there is no floor to set", () => {
    expect(playWindowSeconds(1)).toBe(1 * 60 + 45 * 60);
  });

  it("never expires before a long film has finished", () => {
    // The old six-hour cap cut below the runtime here, so the link died with
    // half an hour of the film still to watch and the player never asks for
    // a second one.
    for (const long of [330, 400, 600, 1000]) {
      expect(playWindowSeconds(long)).toBeGreaterThan(long * 60);
      expect(playWindowSeconds(long)).toBe(long * 60 + 45 * 60);
    }
  });

  it("stays bounded: the longest the column allows is still under 18 hours", () => {
    expect(playWindowSeconds(1000)).toBeLessThan(18 * 60 * 60);
  });

  it("falls back to six hours when the length is unknown", () => {
    for (const unknown of [null, undefined, 0, -5]) expect(playWindowSeconds(unknown)).toBe(6 * 60 * 60);
  });
});

describe("what counts as a video id", () => {
  it("takes a GUID", () => {
    expect(isGuid("11111111-2222-3333-4444-555555555555")).toBe(true);
  });

  it("refuses anything else, including a storage path", () => {
    for (const no of ["films/a23e3509.mp4", "", "../../etc/passwd", "1111", null, undefined, 42, {}]) {
      expect(isGuid(no)).toBe(false);
    }
  });
});

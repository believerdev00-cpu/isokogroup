// A banner's picture may now be a video or a sound, because one upload control
// takes all three. These are the rules that keep an <img> from being pointed at
// an MP4 -- which is a broken icon -- and a sound from being used as a backdrop,
// which there is nothing to look at.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
    auth: { getSession: vi.fn() },
  },
}));

const { heroMedia, heroStill } = await import("./parts");

describe("heroMedia", () => {
  it("shows a still as the picture, with nothing to play", () => {
    expect(heroMedia("films/a.webp")).toEqual({ image: "https://cdn.test/films/a.webp" });
  });

  it("plays a video instead of showing it, and uses the poster as its still", () => {
    expect(heroMedia("films/a.mp4", "films/poster.webp")).toEqual({
      video: "https://cdn.test/films/a.mp4",
      image: "https://cdn.test/films/poster.webp",
    });
  });

  it("plays a video with no still when there is no picture to fall back to", () => {
    expect(heroMedia("films/a.mp4")).toEqual({ video: "https://cdn.test/films/a.mp4", image: null });
  });

  it("will not use a sound as a backdrop: it falls back to the picture", () => {
    expect(heroMedia("films/a.mp3", "films/poster.webp")).toEqual({ image: "https://cdn.test/films/poster.webp" });
  });

  it("falls back to the gradient when the only thing there is a sound", () => {
    expect(heroMedia("films/a.mp3")).toEqual({ image: null });
  });

  it("ignores a fallback that is itself a video", () => {
    expect(heroMedia("films/a.mp4", "films/other.mp4")).toEqual({ video: "https://cdn.test/films/a.mp4", image: null });
  });

  it("has nothing to show for an empty path", () => {
    expect(heroMedia(null)).toEqual({ image: null });
    expect(heroMedia(undefined)).toEqual({ image: null });
  });

  it("still treats an unrecognised extension as a picture, as it always did", () => {
    expect(heroMedia("films/a.tiff")).toEqual({ image: "https://cdn.test/films/a.tiff" });
  });
});

describe("heroStill", () => {
  it("gives the address of a picture", () => {
    expect(heroStill("films/a.webp")).toBe("https://cdn.test/films/a.webp");
  });

  it("gives nothing for a video or a sound, so a poster= stays empty", () => {
    expect(heroStill("films/a.mp4")).toBeNull();
    expect(heroStill("films/a.wav")).toBeNull();
  });

  it("gives nothing for an empty path", () => {
    expect(heroStill(null)).toBeNull();
  });
});

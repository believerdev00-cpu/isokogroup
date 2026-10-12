// Which source files an administrator may send to the video host.
//
// The point of hosting films elsewhere is that the provider converts them,
// so the list here is deliberately wide: MKV, MOV and AVI are all accepted
// and all turned into something every browser can play. It is checked before
// the upload rather than after, because the provider refuses an unsupported
// file only once the whole thing has arrived, and for a film that is half an
// hour of somebody's evening.
//
// The containers are the ones the provider documents as supported input.
import { describe, expect, it } from "vitest";

import { SOURCE_ACCEPT, SOURCE_CONTAINERS, sourceFileError } from "./bunny";

describe("what an administrator may upload", () => {
  it("takes the formats a camera or an editor actually produces", () => {
    for (const name of ["film.mp4", "film.mkv", "film.mov", "film.avi", "film.webm", "clip.ts", "old.wmv"]) {
      expect(sourceFileError({ name })).toBeNull();
    }
  });

  it("takes MKV, which is the format the old player could not play at all", () => {
    expect(sourceFileError({ name: "The House of Secrets.mkv" })).toBeNull();
  });

  it("does not care what the browser calls the file", () => {
    // Windows reports no MIME type for .mkv, which is exactly the format
    // this is here to accept, so the extension decides.
    expect(sourceFileError({ name: "FILM.MKV" })).toBeNull();
  });

  it("refuses what the host cannot convert, before the upload rather than after", () => {
    expect(sourceFileError({ name: "notes.pdf" })).toMatch(/does not accept \.pdf/);
    expect(sourceFileError({ name: "song.mp3" })).toMatch(/does not accept \.mp3/);
    expect(sourceFileError({ name: "noextension" })).toMatch(/has no extension/);
  });

  it("offers every accepted container to the file picker", () => {
    for (const ext of SOURCE_CONTAINERS) expect(SOURCE_ACCEPT).toContain(`.${ext}`);
  });
});

// Evidence behind a research item is not only paperwork: a survey has
// photographs of the site, an interview exists only as a recording, a field
// visit is a video. The picker had been opened up to those while the rule
// below still refused them, so somebody chose a photograph and was told to
// choose a PDF.
import { describe, expect, it } from "vitest";

import { DOC_ACCEPT, MAX_DOC_MB, researchFileError } from "./shared";

const file = (name: string, type: string, mb = 1) => ({ name, type, size: mb * 1024 * 1024 });

describe("researchFileError", () => {
  it("takes the paperwork it always took", () => {
    expect(researchFileError(file("report.pdf", "application/pdf"))).toBeNull();
    expect(researchFileError(file("data.csv", "text/csv"))).toBeNull();
    expect(researchFileError(file("notes.txt", "text/plain"))).toBeNull();
  });

  it("takes a photograph, a video and a recording", () => {
    expect(researchFileError(file("site.jpg", "image/jpeg"))).toBeNull();
    expect(researchFileError(file("visit.mp4", "video/mp4"))).toBeNull();
    expect(researchFileError(file("interview.mp3", "audio/mpeg"))).toBeNull();
  });

  it("takes a file whose type the browser did not report, by its name", () => {
    // Windows reports nothing for .mkv; refusing it outright lost real files.
    expect(researchFileError(file("visit.mkv", ""))).toBeNull();
  });

  it("refuses something that is neither, and says what it does take", () => {
    const why = researchFileError(file("app.exe", "application/x-msdownload"));
    expect(why).toMatch(/picture, video or audio/);
  });

  it("refuses a file larger than the bucket will accept", () => {
    expect(researchFileError(file("huge.pdf", "application/pdf", MAX_DOC_MB + 1)))
      .toBe(`Files must be under ${MAX_DOC_MB} MB.`);
  });

  it("offers in the picker exactly what it accepts", () => {
    // These drifted apart once already: the picker offered pictures and video
    // months before the rule allowed them.
    for (const ext of [".pdf", ".csv", ".xlsx", ".docx"]) expect(DOC_ACCEPT).toContain(ext);
    expect(DOC_ACCEPT).toContain("image/jpeg");
    expect(DOC_ACCEPT).toContain("video/mp4");
    expect(DOC_ACCEPT).toContain("audio/mpeg");
  });
});

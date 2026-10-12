// The evidence block is the one place where a file that was private becomes
// something a stranger can open, so what it does with each kind of file is
// worth pinning down: a photograph is shown, a recording is played, a paper
// is offered for download, and nothing at all is rendered when an analyst
// published none -- including against a database that has never heard of
// evidence, where the key is missing rather than empty.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Evidence } from "./api";

const links = new Map<string, string>();
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  useEvidenceLinks: () => ({ data: links, isLoading: false, isError: false }),
}));

const { EvidenceBlock } = await import("./evidence");

const file = (over: Partial<Evidence> & { name: string }): Evidence => ({
  id: over.name, path: `p/${over.name}`, caption: null, mime: null, size: null, ...over,
});

const show = (files: Evidence[]) => {
  links.clear();
  for (const f of files) links.set(f.path, `https://signed.example/${f.name}`);
  return render(<EvidenceBlock evidence={files} />);
};

describe("EvidenceBlock", () => {
  it("shows nothing when the analyst published no files", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the database has no evidence to give", () => {
    // An older backend answers without the key at all; the page must not care.
    const { container } = render(<EvidenceBlock evidence={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws a photograph, and captions it for a screen reader", () => {
    show([file({ name: "site.jpg", caption: "The site in March" })]);
    expect(screen.getByRole("img", { name: "The site in March" })).toHaveAttribute("src", "https://signed.example/site.jpg");
  });

  it("names a photograph that nobody captioned", () => {
    show([file({ name: "site.jpg" })]);
    expect(screen.getByRole("img", { name: "Photograph" })).toBeInTheDocument();
  });

  it("plays a recording and a video rather than drawing them", () => {
    const { container } = show([file({ name: "interview.mp3" }), file({ name: "visit.mp4" })]);
    expect(container.querySelector("audio")).toHaveAttribute("src", "https://signed.example/interview.mp3");
    expect(container.querySelector("video")).toHaveAttribute("src", "https://signed.example/visit.mp4");
    // Nothing starts on its own: a reader did not ask for sound.
    expect(container.querySelector("video")).not.toHaveAttribute("autoplay");
  });

  it("offers a paper for download instead of trying to show it", () => {
    show([file({ name: "report.pdf", size: 2 * 1024 * 1024 })]);
    const link = screen.getByRole("link", { name: /report\.pdf/ });
    expect(link).toHaveAttribute("href", "https://signed.example/report.pdf");
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it("leaves out a file storage would not sign", () => {
    // Unticking a file takes its link away at once; the page must not render
    // a broken frame where the evidence used to be.
    links.clear();
    render(<EvidenceBlock evidence={[file({ name: "revoked.jpg" })]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeInTheDocument();
  });
});

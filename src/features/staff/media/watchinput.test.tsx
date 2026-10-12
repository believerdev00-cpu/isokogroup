// What the editor knows after a film has been sent to the video host.
//
// The server picks the video id and writes it to the row itself, so the
// browser never gets to choose one. That leaves a trap: the editor rebuilds
// watch_source and watch_ref from its own draft on every save, so a draft
// that still believed there was no video would write that belief back over
// the film seconds after it was uploaded. These tests hold the draft and the
// row together.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadToBunny = vi.hoisted(() => vi.fn());
const bunnyStatus = vi.hoisted(() => vi.fn());

// Spread the real module: manager.tsx also imports the accepted-format
// list from here, and a mock that drops it fails at import time.
vi.mock("@/features/entertainment/bunny", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/entertainment/bunny")>()),
  uploadToBunny,
  bunnyStatus,
}));

const { WatchInput } = await import("./manager");

const GUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const film = () => {
  const f = new File([new Uint8Array(1)], "film.mp4", { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: 900 * 1024 * 1024 }); // far past the old 50 MB ceiling
  return f;
};

/** Puts a film through the hidden picker the "Full film" panel owns. */
const sendFilm = (container: HTMLElement) => {
  const input = container.querySelector('input[accept*=".avi"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  fireEvent.change(input, { target: { files: [film()] } });
};

const open = (draft: Record<string, unknown>, set = vi.fn()) => {
  const r = render(<WatchInput draft={{ id: "rec-1", ...draft }} set={set} folder="films" hosted="title" />);
  // The panel is behind its own tab, next to "Upload a file" and "YouTube link".
  fireEvent.click(screen.getByRole("button", { name: "Full film" }));
  return { ...r, set };
};

describe("sending a full film to the video host", () => {
  beforeEach(() => {
    uploadToBunny.mockReset().mockResolvedValue(GUID);
    bunnyStatus.mockReset().mockResolvedValue({ ok: true, data: { status: 3, progress: 40, ready: false, failed: false } });

    // Before uploading, the editor asks the browser how long the file is by
    // loading it into a <video>. jsdom loads no media and fires no event, so
    // the probe would sit out its own 8-second timeout. This makes it answer
    // at once, the way an unreadable file does in a real browser -- the
    // length is then simply unknown, which is a case worth covering anyway.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string, opts?: ElementCreationOptions) => {
      const el = realCreate(tag, opts);
      if (tag === "video" || tag === "audio") {
        Object.defineProperty(el, "src", {
          configurable: true,
          get: () => "",
          set: () => queueMicrotask(() => (el as HTMLMediaElement).onerror?.(new Event("error"))),
        });
      }
      return el;
    });
    URL.createObjectURL = vi.fn(() => "blob:film");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("tells the draft which video the server chose", async () => {
    // Without this the next save writes watch_source: null straight over it.
    const { container, set } = open({});
    sendFilm(container);
    await waitFor(() => expect(set).toHaveBeenCalled());
    // mock.calls is a list of argument lists; the patch is the first argument.
    const written = Object.assign({}, ...set.mock.calls.map((c) => c[0]));
    expect(written.watch_source).toBe("bunny");
    expect(written.watch_ref).toBe(GUID);
    expect(written.watch_ready).toBe(false);
  });

  it("does not let the browser choose the video id", async () => {
    const { container } = open({});
    sendFilm(container);
    await waitFor(() => expect(uploadToBunny).toHaveBeenCalled());
    // Only the kind and the record id go out; the GUID comes back.
    expect(uploadToBunny.mock.calls[0][0]).toBe("title");
    expect(uploadToBunny.mock.calls[0][1]).toBe("rec-1");
  });

  it("leaves the draft pointing at the old file when the upload fails", async () => {
    uploadToBunny.mockRejectedValue(new Error("the upload stopped"));
    const { container, set } = open({ watch_source: "storage", watch_ref: "films/old.mp4" });
    sendFilm(container);
    await waitFor(() => expect(uploadToBunny).toHaveBeenCalled());
    const written = Object.assign({}, ...set.mock.calls.map((c) => c[0]));
    expect(written.watch_source).not.toBe("bunny");
  });

  it("offers no hosting at all until the record exists", () => {
    // The server identifies the record to decide who may upload to it, so
    // there is nothing to ask about before the first save.
    render(<WatchInput draft={{}} set={vi.fn()} folder="films" hosted="title" />);
    expect(screen.queryByRole("button", { name: "Full film" })).toBeNull();
  });

  it("offers no hosting for the sectors it was not built for", () => {
    render(<WatchInput draft={{ id: "rec-1" }} set={vi.fn()} folder="works/art" />);
    expect(screen.queryByRole("button", { name: "Full film" })).toBeNull();
  });
});

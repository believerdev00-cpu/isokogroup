// Every upload on the media desk shares one panel, so the rules it follows
// are worth pinning down: it says what it takes, it reports progress only
// where there is real progress to report, and it takes a dropped file.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DropZone } from "./manager";

const props = { title: "Choose a file, or drag it in", hint: "MP4 up to 50 MB", onOpen: vi.fn(), onFiles: vi.fn() };

const drop = (files: File[]) =>
  fireEvent.drop(screen.getByRole("button"), { dataTransfer: { files } });

describe("DropZone", () => {
  it("says what it takes before anything is chosen", () => {
    render(<DropZone {...props} />);
    expect(screen.getByText("Choose a file, or drag it in")).toBeInTheDocument();
    expect(screen.getByText("MP4 up to 50 MB")).toBeInTheDocument();
  });

  it("opens the file dialog when clicked", () => {
    const onOpen = vi.fn();
    render(<DropZone {...props} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("takes a dropped file", () => {
    const onFiles = vi.fn();
    render(<DropZone {...props} onFiles={onFiles} />);
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    drop([file]);
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0][0][0]).toBe(file);
  });

  it("counts the percentage only where the upload reports one", () => {
    const { rerender } = render(<DropZone {...props} busy percent={42} note="Keep this page open." />);
    expect(screen.getByText("Uploading… 42%")).toBeInTheDocument();
    expect(screen.getByText("Keep this page open.")).toBeInTheDocument();

    // No percent: say it is working, and do not draw a bar at an invented
    // position -- a bar that is not measuring anything misleads.
    rerender(<DropZone {...props} busy note="Keep this page open." />);
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("hides the hint while it works, so the panel says one thing at a time", () => {
    render(<DropZone {...props} busy />);
    expect(screen.queryByText("MP4 up to 50 MB")).not.toBeInTheDocument();
  });

  it("ignores a file dropped while it is already uploading", () => {
    const onFiles = vi.fn();
    render(<DropZone {...props} busy onFiles={onFiles} />);
    drop([new File(["x"], "clip.mp4", { type: "video/mp4" })]);
    expect(onFiles).not.toHaveBeenCalled();
  });
});

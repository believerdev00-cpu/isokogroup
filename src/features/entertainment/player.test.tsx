// What the player says when a video will not play.
//
// It used to say one thing for every failure: that the browser did not
// support the format, that Matroska was the usual reason, and that nothing
// was wrong with the file. A film on the live site was 24 bytes -- an upload
// that never finished -- and every visitor was told to go and change their
// browser. These tests hold the four MediaError codes apart, and keep the
// word "Matroska" away from files that are not Matroska.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const playbackUrl = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn());
const useSubscription = vi.hoisted(() => vi.fn());

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  playbackUrl,
}));
vi.mock("@/lib/auth", () => ({ useAuth }));
vi.mock("@/lib/subscription", () => ({ useSubscription }));

const { Player } = await import("./parts");

const film = (over = {}) => ({ watch_source: "storage" as const, watch_ref: "films/a.mp4", is_free: true, duration_minutes: 90, ...over });

const play = async (item = film()) => {
  render(<MemoryRouter><Player item={item} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /play/i }));
  await screen.findByText(/.+/);
};

/** Make the <video> element report the failure a real browser would. */
const failWith = (code: number) => {
  const video = document.querySelector("video");
  if (!video) throw new Error("no <video> rendered");
  Object.defineProperty(video, "error", { value: { code }, configurable: true });
  fireEvent.error(video);
};

describe("when a video will not play", () => {
  beforeEach(() => {
    playbackUrl.mockReset().mockResolvedValue("https://signed.example/film.mp4");
    useAuth.mockReturnValue({ user: { id: "u1" } });
    useSubscription.mockReturnValue({ isActive: true });
  });

  it("does not blame Matroska for a file that is not Matroska", async () => {
    await play();
    failWith(4); // MEDIA_ERR_SRC_NOT_SUPPORTED
    expect(screen.queryByText(/Matroska/)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    // The old copy promised this, and it was false for the file that broke.
    expect(screen.queryByText(/Nothing is wrong with the file/)).not.toBeInTheDocument();
    expect(screen.getByText(/did not upload completely|incomplete/i)).toBeInTheDocument();
  });

  it("does blame Matroska for an actual .mkv, where that is the known cause", async () => {
    await play(film({ watch_ref: "films/a.mkv" }));
    failWith(4);
    expect(screen.getByText(/Matroska/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is wrong with the file/i)).toBeInTheDocument();
  });

  it("calls a damaged file damaged", async () => {
    await play();
    failWith(3); // MEDIA_ERR_DECODE
    expect(screen.getByText(/damaged/i)).toBeInTheDocument();
  });

  it("offers a fresh link when the connection failed, since the old one may have expired", async () => {
    await play();
    failWith(2); // MEDIA_ERR_NETWORK
    expect(screen.getByText(/connection to the video was lost/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("says the file is missing when no link could be made at all", async () => {
    // Storage answers "not found" for a file that is absent. The person is
    // already a subscriber, so this is not about what they are allowed.
    playbackUrl.mockResolvedValue(null);
    await play(film({ is_free: false }));
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/not in storage/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /subscribe/i })).not.toBeInTheDocument();
  });

  it("still asks a stranger to subscribe, which is a different failure", async () => {
    playbackUrl.mockResolvedValue(null);
    useAuth.mockReturnValue({ user: null });
    useSubscription.mockReturnValue({ isActive: false });
    render(<MemoryRouter><Player item={film({ is_free: false })} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/not in storage/i)).not.toBeInTheDocument();
  });
});

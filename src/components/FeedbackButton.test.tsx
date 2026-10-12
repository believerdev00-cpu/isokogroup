// The one icon anybody can use to say something.
//
// What matters here is that it reaches the channel that needs no account --
// a complaint that requires signing in is a complaint Isoko never hears --
// and that the office gets a subject worth reading in its list, without the
// person being asked for one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendContactMessage = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/features/contact/api", () => ({ sendContactMessage }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { default: FeedbackButton } = await import("./FeedbackButton");

const openAndWrite = (text: string) => {
  render(<FeedbackButton />);
  fireEvent.click(screen.getByRole("button", { name: /tell us what you think/i }));
  fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: text } });
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Mukamana" } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "m@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
};

describe("the feedback icon", () => {
  beforeEach(() => {
    sendContactMessage.mockReset().mockResolvedValue({ reference: "ISK-2026-0042" });
    useAuth.mockReturnValue({ user: null });
  });

  it("is on the page for somebody with no account", () => {
    render(<FeedbackButton />);
    expect(screen.getByRole("button", { name: /tell us what you think/i })).toBeInTheDocument();
  });

  it("sends an opinion to the office", async () => {
    openAndWrite("The marketplace search is slow on my phone.");
    await waitFor(() => expect(sendContactMessage).toHaveBeenCalled());
    const sent = sendContactMessage.mock.calls[0][0];
    expect(sent.message).toBe("The marketplace search is slow on my phone.");
    expect(sent.topic).toBe("suggestion");
    expect(sent.email).toBe("m@example.test");
  });

  it("gives the office a subject taken from the message, without asking for one", async () => {
    openAndWrite("The marketplace search is slow on my phone.");
    await waitFor(() => expect(sendContactMessage).toHaveBeenCalled());
    expect(sendContactMessage.mock.calls[0][0].subject).toBe("The marketplace search is slow on my phone.");
    // No subject box: the whole point is that this is quick to answer.
    expect(screen.queryByLabelText(/subject/i)).not.toBeInTheDocument();
  });

  it("shortens a long opening line rather than sending a wall of text as the subject", async () => {
    const long = "a".repeat(200);
    openAndWrite(long);
    await waitFor(() => expect(sendContactMessage).toHaveBeenCalled());
    const subject = sendContactMessage.mock.calls[0][0].subject as string;
    expect(subject.length).toBeLessThanOrEqual(80);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("shows the reference back, so somebody can ask about it later", async () => {
    openAndWrite("Please stock more egg trays.");
    expect(await screen.findByText("ISK-2026-0042")).toBeInTheDocument();
  });

  it("says so when sending failed, instead of pretending it arrived", async () => {
    sendContactMessage.mockRejectedValue(new Error("Please check the email address."));
    openAndWrite("Something");
    await waitFor(() => expect(sendContactMessage).toHaveBeenCalled());
    expect(screen.queryByText("ISK-2026-0042")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeInTheDocument();
  });

  it("does not make a signed-in person retype what the site knows", () => {
    useAuth.mockReturnValue({ user: { email: "known@example.test", user_metadata: { full_name: "Known Person" } } });
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: /tell us what you think/i }));
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Known Person");
    expect(screen.getByLabelText(/email/i)).toHaveValue("known@example.test");
  });
});

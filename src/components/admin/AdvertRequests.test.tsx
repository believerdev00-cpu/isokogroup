// The advertising desk is a call-back list, so what matters is whether the
// person can be reached and who has been kept waiting. These render the desk
// and check it, rather than reading the file and hoping.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const request = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    reference: "ISO-ADV-00007",
    user_id: null,
    full_name: "Jane Advertiser",
    company: "Kigali Coffee Ltd",
    email: "jane@example.com",
    phone: "0788 481 648",
    industry: "Food and beverage",
    what_to_advertise: "Our new roastery",
    placement: "homepage",
    duration: "3 months",
    budget_rwf: 450000,
    message: null,
    artwork_path: null,
    status: "new",
    staff_notes: "",
    reviewed_by: null,
    reviewed_at: null,
    created_at: daysAgo(3),
    ...over,
  });
  return {
    rows: [
      request(),
      request({ id: "r2", reference: "ISO-ADV-00008", company: "Rwanda Logistics", email: "ops@rwlog.rw", phone: "+44 20 7946 0958", status: "quoted", created_at: daysAgo(40) }),
    ],
    setAdvertStatus: vi.fn(async () => undefined),
    refetch: vi.fn(async () => undefined),
    artworkUrl: vi.fn(async () => "https://example.com/art.jpg"),
  };
});
const { setAdvertStatus, refetch } = h;

vi.mock("@/features/adverts/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/adverts/api")>();
  return {
    ...actual,
    useAdvertRequests: () => ({ data: h.rows, isLoading: false, isError: false, isSuccess: true, refetch: h.refetch }),
    setAdvertStatus: h.setAdvertStatus,
    artworkUrl: h.artworkUrl,
  };
});
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import AdvertRequests from "./AdvertRequests";

describe("the advertising desk", () => {
  beforeEach(() => {
    setAdvertStatus.mockClear();
    refetch.mockClear();
    toast.mockClear();
  });

  it("makes the address and the number one click away", () => {
    render(<AdvertRequests />);
    const mail = screen.getByRole("link", { name: "jane@example.com" }) as HTMLAnchorElement;
    expect(mail.href).toContain("mailto:jane@example.com");
    expect(decodeURIComponent(mail.href)).toContain("[ISO-ADV-00007]");
    const phone = screen.getByRole("link", { name: "0788 481 648" }) as HTMLAnchorElement;
    expect(phone.href).toBe("tel:+250788481648");
  });

  it("says how long each business has been waiting", () => {
    render(<AdvertRequests />);
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    expect(screen.getByText("5 weeks ago")).toBeInTheDocument();
  });

  it("marks a request contacted from the row, without opening anything", async () => {
    render(<AdvertRequests />);
    fireEvent.click(screen.getByRole("button", { name: "Mark contacted" }));
    await waitFor(() => expect(setAdvertStatus).toHaveBeenCalledWith("r1", "contacted"));
    expect(refetch).toHaveBeenCalled();
  });

  it("offers that shortcut only where it is the next step", () => {
    render(<AdvertRequests />);
    // The quoted request is past being contacted, so the row does not offer it.
    expect(screen.getAllByRole("button", { name: "Mark contacted" })).toHaveLength(1);
  });

  it("finds a request by anything the office might remember", () => {
    render(<AdvertRequests />);
    const box = screen.getByLabelText("Search advertising requests");
    fireEvent.change(box, { target: { value: "rwlog" } });
    expect(screen.getByText("Rwanda Logistics")).toBeInTheDocument();
    expect(screen.queryByText("Kigali Coffee Ltd")).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: "ISO-ADV-00007" } });
    expect(screen.getByText("Kigali Coffee Ltd")).toBeInTheDocument();
    expect(screen.queryByText("Rwanda Logistics")).not.toBeInTheDocument();
  });

  it("says so plainly when a search matches nothing", () => {
    render(<AdvertRequests />);
    fireEvent.change(screen.getByLabelText("Search advertising requests"), { target: { value: "zzzz" } });
    expect(screen.getByText("No waiting request matches that.")).toBeInTheDocument();
  });

  it("offers email, phone and WhatsApp once a request is opened", () => {
    render(<AdvertRequests />);
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    const dialog = screen.getByRole("dialog");
    const wa = within(dialog).getByRole("link", { name: /WhatsApp/ }) as HTMLAnchorElement;
    expect(wa.href).toBe("https://wa.me/250788481648");
    expect(within(dialog).getByRole("link", { name: /Call/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Email/ })).toBeInTheDocument();
  });

  it("warns before throwing away notes that were typed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdvertRequests />);
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.change(screen.getByLabelText("Notes for the team"), { target: { value: "rang, no answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalled();
    // refused, so the request is still open and the note is still there
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("closes without a warning when nothing was changed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdvertRequests />);
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

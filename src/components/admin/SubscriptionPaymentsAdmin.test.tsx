// "Awaiting confirmation" must show everyone waiting for the admin, and say what
// a seller application is waiting for: it isn't approved by itself.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({ data: [], error: null }) } }));
// The same function every time, as in the real hook: the list reloads when it changes
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import SubscriptionPaymentsAdmin from "./SubscriptionPaymentsAdmin";

const waiting = { id: "s1", full_name: "Asha", business_name: "Shop", email: "asha@test.local", created_at: "2026-11-01T09:00:00Z", paymentReported: false };

describe("Awaiting confirmation", () => {
  it("shows a waiting seller application and what it needs", async () => {
    const open = vi.fn();
    render(<SubscriptionPaymentsAdmin waitingApplications={[waiting]} onOpenApplications={open} />);
    expect(await screen.findByText("Seller applications waiting (1)")).toBeInTheDocument();
    expect(screen.getByText(/asha@test.local/)).toBeInTheDocument();
    expect(screen.getByText(/No seller payment reported yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open application" }));
    expect(open).toHaveBeenCalled();
  });

  it("says when their payment is the thing waiting", async () => {
    render(<SubscriptionPaymentsAdmin waitingApplications={[{ ...waiting, paymentReported: true }]} />);
    expect(await screen.findByText(/Their payment is waiting above/)).toBeInTheDocument();
  });

  it("keeps them out of the other filters", async () => {
    render(<SubscriptionPaymentsAdmin waitingApplications={[waiting]} />);
    await screen.findByText("Seller applications waiting (1)");
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    expect(screen.queryByText("Seller applications waiting (1)")).toBeNull();
  });

  it("offers no way to approve an application from here", async () => {
    render(<SubscriptionPaymentsAdmin waitingApplications={[waiting]} onOpenApplications={vi.fn()} />);
    await screen.findByText("Seller applications waiting (1)");
    expect(screen.queryByRole("button", { name: /approve|confirm payment/i })).toBeNull();
  });
});

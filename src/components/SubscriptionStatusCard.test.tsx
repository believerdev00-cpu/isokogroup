import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SubscriptionStatusCard from "./SubscriptionStatusCard";

const useSubscription = vi.hoisted(() => vi.fn());

vi.mock("@/lib/subscription", () => ({
  useSubscription,
  formatPrice: (amount: number) => `${amount} RWF`,
  planName: () => "Plan",
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, lang: "en" }) }));

const base = {
  loading: false, status: "expired", isActive: true, renewalStatus: "expired", accessUntil: null, paymentPending: false,
  pricing: { nextPrice: 50, currency: "RWF", nextPlan: "week" },
};

const renderCard = () => render(<MemoryRouter><SubscriptionStatusCard /></MemoryRouter>);

describe("SubscriptionStatusCard", () => {
  it("shows an admin free access and nothing to pay, even with an old expired trial", () => {
    useSubscription.mockReturnValue({ ...base, isExempt: true });
    renderCard();
    expect(screen.getByRole("status").getAttribute("data-subscription-state")).toBe("exempt");
    expect(screen.getByText("Admin account")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("still asks a customer whose access ended to renew", () => {
    useSubscription.mockReturnValue({ ...base, isActive: false, isExempt: false });
    renderCard();
    expect(screen.getByRole("status").getAttribute("data-subscription-state")).toBe("expired");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/subscription");
  });
});

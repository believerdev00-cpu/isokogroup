// A failed subscription check is not the same as having no subscription: an admin
// or a paying customer must not be shown the prices because the check broke, and
// nobody gets into the page because of it either.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ value: { user: { id: "u1" } as any, loading: false } }));
const sub = vi.hoisted(() => ({ value: {} as any }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/subscription", () => ({ useSubscription: () => sub.value }));
vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionRequired", () => ({ default: () => <div>PRICES</div> }));
vi.mock("@/components/TrialCountdown", () => ({ TrialBanner: () => null }));

import ProtectedRoute from "./ProtectedRoute";

const show = (requireAccess?: boolean) =>
  render(
    <MemoryRouter>
      <ProtectedRoute requireAccess={requireAccess}><div>MEMBER PAGE</div></ProtectedRoute>
    </MemoryRouter>,
  );
const base = { loading: false, isActive: false, reason: "no_subscription", checkFailed: false, refresh: vi.fn() };

describe("a member page", () => {
  it("shows the error, not the prices or the page, when the check failed", () => {
    sub.value = { ...base, checkFailed: true };
    show();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("PRICES")).toBeNull();
    expect(screen.queryByText("MEMBER PAGE")).toBeNull();
  });

  it("still locks for someone who really has no access", () => {
    sub.value = base;
    show();
    expect(screen.getByText("PRICES")).toBeInTheDocument();
    expect(screen.queryByText("MEMBER PAGE")).toBeNull();
  });

  it("opens for someone with access", () => {
    sub.value = { ...base, isActive: true, reason: null };
    show();
    expect(screen.getByText("MEMBER PAGE")).toBeInTheDocument();
  });

  it("keeps account pages open when the check failed", () => {
    sub.value = { ...base, checkFailed: true };
    show(false);
    expect(screen.getByText("MEMBER PAGE")).toBeInTheDocument();
  });
});

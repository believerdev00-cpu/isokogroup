// "We could not read the records" and "there are no records" are different
// answers, and the public page must never give the second when it means the
// first. These check each section tells the truth in all three states.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/lib/seo", () => ({ useSeo: () => {} }));

const usePublicProjects = vi.hoisted(() => vi.fn());
const useImpact = vi.hoisted(() => vi.fn());
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  usePublicProjects,
  useImpact,
}));

import GlobalInitiative from "./GlobalInitiative";

const loading = { isLoading: true, isError: false, data: undefined, refetch: vi.fn() };
const failed = { isLoading: false, isError: true, data: undefined, refetch: vi.fn() };
const ok = (data: unknown) => ({ isLoading: false, isError: false, data, refetch: vi.fn() });

const project = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Coding bootcamp",
  description: "A twelve week coding bootcamp for young people who are out of work.",
  focus_area: "unemployment_reduction",
  subcategory: "technical_upskilling",
  item: "coding",
  location: "Kigali",
  amount_required: 500000,
  amount_raised: 125000,
  status: "seeking_support",
  completion_summary: null,
  completed_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

const mount = (seeking: unknown, completed: unknown, impact: unknown) => {
  usePublicProjects.mockImplementation((s: string) => (s === "completed" ? completed : seeking));
  useImpact.mockReturnValue(impact);
  return render(<MemoryRouter><GlobalInitiative /></MemoryRouter>);
};

const NO_SEEKING = "No projects are currently seeking support.";
const NO_COMPLETED = "No Global Initiative projects have been completed yet.";
const IMPACT_PENDING = "Impact data will appear here as projects are funded and completed.";
const FAILED_TEXT = /We couldn't load this information/;

describe("the public page when a section fails to load", () => {
  it("never reports 'none' for a list it could not read", () => {
    mount(failed, failed, failed);
    expect(screen.queryByText(NO_SEEKING)).toBeNull();
    expect(screen.queryByText(NO_COMPLETED)).toBeNull();
    expect(screen.getAllByText(FAILED_TEXT)).toHaveLength(3);
  });

  it("never shows impact figures it could not read, not even as zeros", () => {
    mount(ok([]), ok([]), failed);
    expect(screen.queryByText("Projects published")).toBeNull();
    expect(screen.queryByText("Confirmed contributions")).toBeNull();
    expect(screen.queryByText("0 RWF")).toBeNull();
    expect(screen.queryByText(IMPACT_PENDING)).toBeNull();
  });

  it("offers a way to try again", () => {
    mount(failed, ok([]), ok({ published: 0, raised: 0, funded: 0, completed: 0, seeking: 0, byArea: {} }));
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
  });
});

describe("the public page when a section loads", () => {
  it("keeps the honest empty states when there really is nothing yet", () => {
    mount(ok([]), ok([]), ok({ published: 0, raised: 0, funded: 0, completed: 0, seeking: 0, byArea: {} }));
    expect(screen.getByText(NO_SEEKING)).toBeTruthy();
    expect(screen.getByText(NO_COMPLETED)).toBeTruthy();
    expect(screen.getByText(IMPACT_PENDING)).toBeTruthy();
    expect(screen.queryByText(FAILED_TEXT)).toBeNull();
  });

  it("shows a real project and its real figures", () => {
    mount(ok([project]), ok([]), ok({ published: 1, raised: 125000, funded: 0, completed: 0, seeking: 1, byArea: {} }));
    expect(screen.getByText("Coding bootcamp")).toBeTruthy();
    // the card's own figure, and the impact tile that counts the same money
    expect(screen.getAllByText(/125,000 RWF/).length).toBeGreaterThan(0);
    expect(screen.getByText("Projects published")).toBeTruthy();
    expect(screen.queryByText(NO_SEEKING)).toBeNull();
  });

  it("says it is loading rather than empty while a section is still arriving", () => {
    mount(loading, loading, loading);
    expect(screen.queryByText(NO_SEEKING)).toBeNull();
    expect(screen.queryByText(NO_COMPLETED)).toBeNull();
    expect(screen.queryByText(IMPACT_PENDING)).toBeNull();
    expect(screen.getAllByText("Loading…")).toHaveLength(3);
  });
});

describe("the homepage promise is kept on the page itself", () => {
  it("says donations are not open and publishes no payment details", () => {
    const { container } = mount(ok([]), ok([]), ok({ published: 0, raised: 0, funded: 0, completed: 0, seeking: 0, byArea: {} }));
    expect(screen.getByText("Donations are not yet open")).toBeTruthy();
    for (const placeholder of ["*182*8*1*123456#", "00040-12345678-90", "BKIGRWRW"]) {
      expect(container.textContent).not.toContain(placeholder);
    }
  });
});

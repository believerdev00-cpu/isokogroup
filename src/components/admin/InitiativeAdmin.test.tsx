// An admin who cannot read the queue must be told so. A review queue that
// failed to load looks exactly like an empty one, and an admin who believes
// the queue is empty stops checking it.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useAdminProjects = vi.hoisted(() => vi.fn());
vi.mock("@/features/initiative/api", async (orig) => ({
  ...(await orig<typeof import("@/features/initiative/api")>()),
  useAdminProjects,
}));

import InitiativeAdmin from "./InitiativeAdmin";

const mount = (q: unknown) => {
  useAdminProjects.mockReturnValue(q);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><InitiativeAdmin /></QueryClientProvider>);
};

const state = (over: Record<string, unknown>) =>
  ({ isLoading: false, isError: false, isSuccess: false, data: undefined, refetch: vi.fn(), ...over });

const NO_APPLICATIONS = "No applications waiting for review.";
const NO_PROJECTS = "No projects yet.";

describe("the initiative desk when the queue cannot be read", () => {
  it("says so instead of reporting an empty queue", () => {
    mount(state({ isError: true }));
    expect(screen.queryByText(NO_APPLICATIONS)).toBeNull();
    expect(screen.queryByText(NO_PROJECTS)).toBeNull();
    expect(screen.getAllByText(/We couldn't load this information/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(2);
  });

  it("claims no count it could not actually read", () => {
    const { container } = mount(state({ isError: true }));
    expect(container.textContent).toContain("Applications");
    expect(container.textContent).not.toContain("Applications (0)");
    expect(container.textContent).not.toContain("Projects (0)");
  });

  it("says nothing about the queue while it is still loading", () => {
    mount(state({ isLoading: true }));
    expect(screen.queryByText(NO_APPLICATIONS)).toBeNull();
    expect(screen.queryByText(NO_PROJECTS)).toBeNull();
  });
});

describe("the initiative desk when the queue loads", () => {
  it("reports an empty queue only once it has really read it", () => {
    const { container } = mount(state({ isSuccess: true, data: [] }));
    expect(screen.getByText(NO_APPLICATIONS)).toBeTruthy();
    expect(screen.getByText(NO_PROJECTS)).toBeTruthy();
    expect(container.textContent).toContain("Applications (0)");
    expect(screen.queryByText(/We couldn't load this information/)).toBeNull();
  });
});

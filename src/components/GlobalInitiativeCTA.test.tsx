// This band sits a few hundred pixels below the hero, which offers the same
// invitation. The two drifted apart once already: both said "Donate with ISOKO
// Groups Company", but one opened the dialog and the other navigated away. What
// is held here is that a button saying Donate donates, and that going to the
// explainer page is labelled as the different thing it is.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const donationsOpen = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/initiative", async (orig) => ({
  ...(await orig<typeof import("@/lib/initiative")>()),
  get DONATIONS_OPEN() { return donationsOpen.value; },
}));

import GlobalInitiativeCTA from "./GlobalInitiativeCTA";

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><GlobalInitiativeCTA /></MemoryRouter>
    </QueryClientProvider>,
  );

describe("the Global Initiative band under the hero", () => {
  it("makes Donate a real donate action, not a link somewhere else", () => {
    donationsOpen.value = true;
    mount();
    const donate = screen.getByRole("button", { name: /Donate with ISOKO/i });
    // A link would carry an href and take the visitor off to another page.
    expect(donate.closest("a")).toBeNull();
    expect(donate.getAttribute("href")).toBeNull();
  });

  it("labels the route to the explainer as its own separate action", () => {
    donationsOpen.value = true;
    mount();
    const link = screen.getByRole("link", { name: /See how it works/i });
    expect(link.getAttribute("href")).toBe("/global-initiative");
    // and it does not borrow the donate wording
    expect(link.textContent).not.toMatch(/Donate/i);
  });

  it("keeps the explainer reachable once donations are closed", () => {
    donationsOpen.value = false;
    mount();
    expect(screen.queryByRole("button", { name: /Donate with ISOKO/i })).toBeNull();
    expect(screen.getByRole("link", { name: /See how it works/i })).toBeTruthy();
  });
});

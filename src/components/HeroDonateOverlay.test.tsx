// The overlay is laid over a hero that must not be touched, and it is the way
// money is asked for on the homepage. Two things are worth holding still: that
// closing DONATIONS_OPEN really does stop it being offered, and that it never
// swallows the clicks and drags belonging to the carousel underneath.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const donationsOpen = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/initiative", async (orig) => ({
  ...(await orig<typeof import("@/lib/initiative")>()),
  get DONATIONS_OPEN() { return donationsOpen.value; },
}));

import HeroDonateOverlay from "./HeroDonateOverlay";

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><HeroDonateOverlay /></MemoryRouter>
    </QueryClientProvider>,
  );

describe("the homepage invitation to give", () => {
  it("offers to take a contribution while donations are open", () => {
    donationsOpen.value = true;
    mount();
    expect(screen.getAllByRole("button", { name: /Donate/i }).length).toBeGreaterThan(0);
  });

  it("offers nothing at all once donations are closed", () => {
    donationsOpen.value = false;
    const { container } = mount();
    expect(screen.queryByRole("button", { name: /Donate/i })).toBeNull();
    expect(container.querySelector("[data-donate-overlay]")).toBeNull();
    // and not merely hidden: there is nothing left to click
    expect(container.textContent).not.toMatch(/Donate/i);
  });

  it("lets the hero underneath keep its own clicks and drags", () => {
    donationsOpen.value = true;
    const { container } = mount();
    const overlay = container.querySelector("[data-donate-overlay]");
    expect(overlay).not.toBeNull();
    // The sheet covering the hero takes no pointer events; only the controls do.
    expect(overlay?.className).toContain("pointer-events-none");
    const controls = overlay?.querySelectorAll(".pointer-events-auto") ?? [];
    expect(controls.length).toBeGreaterThan(0);
  });

  it("shows one control on a phone and a fuller one on a wider screen", () => {
    donationsOpen.value = true;
    const { container } = mount();
    const overlay = container.querySelector("[data-donate-overlay]");
    expect(overlay?.querySelector(".md\\:hidden")).not.toBeNull();
    expect(overlay?.querySelector(".hidden.md\\:block")).not.toBeNull();
  });
});

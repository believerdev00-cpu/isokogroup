import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IntakeTicker, { announcementText, intakePath, shortDate, tickerSeconds, type IntakeAnnouncement } from "./IntakeTicker";
import { I18nProvider, translate } from "@/lib/i18n";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/training/lib/api", () => ({ api: { get } }));

const t = (key: string, vars?: Record<string, string | number>) => translate("en", key, vars);

const announcement = (over: Partial<IntakeAnnouncement> = {}): IntakeAnnouncement => ({
  id: over.id ?? "11111111-1111-1111-1111-111111111111",
  name: "January 2027 Intake",
  slug: "january-2027-intake",
  location: "Kigali",
  application_opens_on: "2027-01-05",
  application_closes_on: "2027-02-05",
  training_starts_on: "2027-02-20",
  is_featured: false,
  ticker_priority: 0,
  state: "open",
  days_left: 20,
  program_count: 2,
  programs: ["Logistics", "Software Development"],
  ...over,
});

const mount = async (items: IntakeAnnouncement[] | Error) => {
  if (items instanceof Error) get.mockRejectedValue(items);
  else get.mockResolvedValue(items);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter>
          <IntakeTicker />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
  // let the query settle
  await new Promise((r) => setTimeout(r, 0));
  return view;
};

describe("the intake band's wording", () => {
  it("says what state each intake is in", () => {
    expect(announcementText(announcement(), t).state).toBe("Applications open");
    expect(announcementText(announcement({ state: "closing_soon", days_left: 3 }), t).state).toBe("Closing in 3 days");
    expect(announcementText(announcement({ state: "closing_soon", days_left: 0 }), t).state).toBe("Last day to apply");
    expect(announcementText(announcement({ state: "coming_soon", days_left: null }), t).state).toContain("Opens");
  });

  it("names the programs and counts the ones it left out", () => {
    expect(announcementText(announcement(), t).programs).toBe("Logistics · Software Development");
    const many = announcement({ programs: ["A", "B", "C"], program_count: 5 });
    expect(announcementText(many, t).programs).toBe("A · B · C and 2 more");
  });

  it("writes the opening day short enough for one line", () => {
    expect(shortDate("2027-03-01", "en")).toMatch(/1 Mar/);
    expect(shortDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("links each announcement to its own intake", () => {
    expect(intakePath("january-2027-intake")).toBe("/training-center/intakes/january-2027-intake");
    expect(intakePath("a b/c")).toBe("/training-center/intakes/a%20b%2Fc");
  });

  it("takes longer for more text, so the speed stays readable", () => {
    const one = tickerSeconds([announcement()]);
    const four = tickerSeconds([announcement(), announcement(), announcement(), announcement()]);
    expect(one).toBe(22); // the minimum: a short band still moves slowly enough to read
    expect(four).toBeGreaterThan(one);
    expect(tickerSeconds(Array.from({ length: 40 }, () => announcement()))).toBeLessThanOrEqual(140);
    expect(tickerSeconds([])).toBe(22);
  });
});

describe("the intake band on the homepage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove("motion-lite");
  });

  it("shows one clickable announcement per intake, with Apply now", async () => {
    await mount([
      announcement({ id: "a", slug: "logistics-intake", name: "Logistics Intake", is_featured: true }),
      announcement({ id: "b", slug: "accounting-intake", name: "Accounting Intake", state: "closing_soon", days_left: 2 }),
    ]);
    expect(await screen.findByRole("region", { name: /intake announcements/i })).toBeTruthy();
    // the band repeats the list so the movement loops; the copy is hidden from screen readers
    const links = screen.getAllByRole("link", { name: /Logistics Intake/ });
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("/training-center/intakes/logistics-intake");
    expect(links[0].textContent).toContain("Apply now");
    expect(links[0].textContent).toContain("New intake");
    const closing = screen.getAllByRole("link", { name: /Accounting Intake/ })[0];
    expect(closing.getAttribute("href")).toBe("/training-center/intakes/accounting-intake");
    expect(closing.textContent).toContain("Closing in 2 days");
    // the hidden copy exists in the markup
    expect(document.querySelectorAll('[aria-hidden="true"] a[href="/training-center/intakes/logistics-intake"]').length).toBe(1);
  });

  it("can be stopped and started again", async () => {
    await mount([announcement()]);
    const button = await screen.findByRole("button", { name: /Pause the announcements/i });
    const track = document.querySelector(".intake-ticker-track") as HTMLElement;
    expect(track.dataset.paused).toBeUndefined();
    expect(track.style.animationDuration).toBe("22s");
    fireEvent.click(button);
    expect((document.querySelector(".intake-ticker-track") as HTMLElement).dataset.paused).toBe("true");
    expect(screen.getByRole("button", { name: /Play the announcements/i })).toBeTruthy();
  });

  it("stays away when there is nothing to announce", async () => {
    const { container } = await mount([]);
    expect(container.querySelector(".intake-ticker")).toBeNull();
  });

  it("stays away when the Training Center cannot be reached", async () => {
    const { container } = await mount(new Error("network"));
    expect(container.querySelector(".intake-ticker")).toBeNull();
  });
});

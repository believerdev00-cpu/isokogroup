// What a visitor actually meets on /research/search.
//
// Four states matter and used to be muddled: a question being researched, an
// answer with its sources, a question nothing could be found for (said once,
// not twice), and research that could not be carried out at all - which must
// never be dressed up as "there is nothing to find".
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { AskResponse } from "./api";

vi.mock("@/features/services/ui", () => ({ ServiceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/seo", () => ({ useSeo: () => {} }));

const search: { data: unknown[]; isLoading: boolean; isError: boolean } = { data: [], isLoading: false, isError: false };
let ask: () => Promise<AskResponse>;

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  useResearchSearch: () => ({ ...search, refetch: vi.fn() }),
  useCountries: () => ({ data: [] }),
  useTopics: () => ({ data: [] }),
  askResearch: () => ask(),
}));

const { default: HubSearch } = await import("./pages/Search");

const answer = (over: Partial<AskResponse> = {}): AskResponse => ({
  answer: null, mode: "none", items: [], sources: [], conflicts: [], cached: false, ai: false, status: "ok", ...over,
});

const show = (response: () => Promise<AskResponse>, results: unknown[] = []) => {
  ask = response;
  search.data = results;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/research/search?q=what+is+logistics"]}>
        <HubSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("the search page", () => {
  it("says it is working while the question is being researched", async () => {
    show(() => new Promise(() => {})); // never settles
    expect(await screen.findByText(/researching this question/i)).toBeInTheDocument();
  });

  it("answers the question, with every source one click away", async () => {
    show(async () => answer({
      answer: "Logistics is the planning and movement of goods from where they are made to where they are used.",
      mode: "external",
      ai: true,
      sources: [{ title: "Logistics performance index", url: "https://data.worldbank.org/lpi", publisher: "data.worldbank.org", published_on: "2026-05-01" }],
    }));

    expect(await screen.findByText(/planning and movement of goods/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Logistics performance index" });
    expect(link).toHaveAttribute("href", "https://data.worldbank.org/lpi");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    // the sources are in plain sight, not folded away
    expect(screen.getByText("Sources")).toBeVisible();
  });

  it("names no model, no provider and no company as the author of the answer", async () => {
    show(async () => answer({ answer: "Logistics is the movement of goods.", mode: "external", ai: true }));
    await screen.findByText(/movement of goods/i);
    expect(document.body.textContent).not.toMatch(/claude|anthropic|chatgpt|openai|tavily|serper|gpt|according to isoko/i);
  });

  it("says a question could not be answered once, not twice", async () => {
    show(async () => answer({ mode: "none" })); // nothing found, and no results either
    expect(await screen.findByText(/could not find enough reliable information/i)).toBeInTheDocument();
    // the old page said the same thing again underneath
    expect(screen.queryByText("No matching information yet")).not.toBeInTheDocument();
    // and the ways on are still offered
    expect(screen.getByRole("link", { name: "Browse everything" })).toBeInTheDocument();
  });

  it("admits when research could not be carried out, and offers to try again", async () => {
    show(async () => answer({ status: "unavailable" }));
    expect(await screen.findByText(/could not be researched just now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // not a word suggesting the subject itself is unknown
    expect(screen.queryByText(/could not find enough reliable information/i)).not.toBeInTheDocument();
  });

  it("still lists what matched when the question itself could not be answered", async () => {
    show(async () => answer({ mode: "none" }), [{
      id: "1", slug: "logistics-in-rwanda", kind: "report", title: "Logistics in Rwanda", summary: "A report.",
      country_name: "Rwanda", topic_name: "Logistics & Trade", published_on: "2026-01-01", verification: "verified", total: 1,
    }]);
    expect(await screen.findByRole("heading", { name: "Logistics in Rwanda" })).toBeInTheDocument();
  });

  it("lets a visitor ask again without leaving the page", async () => {
    show(async () => answer({ answer: "Logistics is the movement of goods.", mode: "external", ai: true }));
    await screen.findByText(/movement of goods/i);
    fireEvent.click(screen.getByRole("button", { name: /ask another question/i }));
    expect(within(screen.getByRole("search")).getByRole("textbox")).toHaveFocus();
  });
});

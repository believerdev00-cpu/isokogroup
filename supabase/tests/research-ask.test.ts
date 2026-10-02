// @vitest-environment node
//
// The pure logic of the research-ask Edge Function: how a question is tidied
// and hashed, when the knowledge base is "enough", which outside results are
// kept, what the model is asked, and how its reply is read. No network.
//
//   npx vitest run supabase/tests/research-ask.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPrompt, cleanQuestion, decideMode, filterExternal, isNotFound, isSufficient, mockAnswer, normalizeQuestion, NOT_FOUND,
  parseModelReply, questionHash, queryWords, sanitizeAnswer, validateInput, type KbItem, type KbMaterial,
} from "../functions/research-ask/engine.ts";
import { configuredProvider, mockExternal, searchExternal } from "../functions/research-ask/external.ts";

const item = (over: Partial<KbItem> = {}): KbItem => ({
  id: "11111111-1111-4111-8111-111111111111", slug: "population-of-rwanda-2022", kind: "statistic", title: "Population of Rwanda, 2022 census",
  summary: "The 2022 census counted the resident population of Rwanda.", country_name: "Rwanda", topic_name: "Population", published_on: "2023-02-01",
  verification: "verified", origin: "isoko", rank: 0.4, total: 1, ...over,
});
const env = (vars: Record<string, string>) => ({ get: (n: string) => vars[n] });

describe("question normalization", () => {
  it("lower-cases, trims, collapses spaces and drops trailing question marks", () => {
    expect(normalizeQuestion("  What is   the Population of Rwanda ?? ")).toBe("what is the population of rwanda");
  });
  it("keeps the typed question tidy for storage", () => {
    expect(cleanQuestion("  What is\n the population?  ")).toBe("What is the population?");
  });
  it("hashes the same question the same way, and differently per country", async () => {
    const a = await questionHash("What is the population of Rwanda?", null);
    const b = await questionHash("what is the population of rwanda", null);
    const c = await questionHash("What is the population of Rwanda?", "rwanda");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("finds the words worth matching", () => {
    expect(queryWords("What does research say about youth employment?")).toEqual(["research", "youth", "employment"]);
  });
});

describe("input validation", () => {
  it("accepts a question with an optional country slug", () => {
    expect(validateInput({ question: "Population of Rwanda?", country: "rwanda" })).toEqual({ question: "Population of Rwanda?", country: "rwanda" });
    expect(validateInput({ question: "Population of Rwanda?" })).toEqual({ question: "Population of Rwanda?", country: null });
  });
  it("refuses bad input", () => {
    expect(validateInput(null)).toHaveProperty("error");
    expect(validateInput({ question: 5 })).toHaveProperty("error");
    expect(validateInput({ question: "ab" })).toHaveProperty("error");
    expect(validateInput({ question: "x".repeat(301) })).toHaveProperty("error");
    expect(validateInput({ question: "Population?", country: "Rwanda!" })).toHaveProperty("error");
  });
});

describe("sufficiency", () => {
  it("needs a matching item and enough text", () => {
    const long = "a".repeat(250);
    expect(isSufficient([item()], [long], "What is the population of Rwanda?")).toBe(true);
    expect(isSufficient([item({ rank: 0 })], [long], "What is the population of Rwanda?")).toBe(true); // title shares "population" and "rwanda"
    expect(isSufficient([item({ rank: 0, title: "Coffee exports" })], [long], "What is the population of Rwanda?")).toBe(false);
    expect(isSufficient([item()], ["short"], "What is the population of Rwanda?")).toBe(false);
    expect(isSufficient([], [long], "What is the population of Rwanda?")).toBe(false);
  });
});

describe("outside results", () => {
  const results = [
    { title: "Blog post", url: "https://randomblog.example.com/post", snippet: "x", publisher: null },
    { title: "NISR census", url: "https://www.statistics.gov.rw/census", snippet: "y", publisher: null },
    { title: "NISR census again", url: "https://www.statistics.gov.rw/census?utm=1", snippet: "y", publisher: null },
    { title: "Wiki", url: "https://en.wikipedia.org/wiki/Rwanda", snippet: "z", publisher: null },
    { title: "Bad", url: "ftp://nope", snippet: "", publisher: null },
  ];
  it("drops blocked domains and bad addresses, puts preferred domains first, de-duplicates", () => {
    const kept = filterExternal(results, "statistics.gov.rw, worldbank.org", "wikipedia.org");
    expect(kept.map((r) => r.url)).toEqual(["https://www.statistics.gov.rw/census", "https://randomblog.example.com/post"]);
    expect(kept[0].publisher).toBe("statistics.gov.rw");
  });
  it("caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, url: `https://site${i}.example.org/`, snippet: "s", publisher: null }));
    expect(filterExternal(many, "", "").length).toBe(5);
  });
  it("knows when no provider is configured, and never names a key", () => {
    expect(configuredProvider(env({}))).toMatch(/no external search provider/);
    expect(configuredProvider(env({ EXTERNAL_SEARCH_PROVIDER: "tavily" }))).toMatch(/TAVILY_API_KEY is not set/);
    expect(configuredProvider(env({ EXTERNAL_SEARCH_PROVIDER: "serper", SERPER_API_KEY: "s3cret" }))).toEqual({ name: "serper", key: "s3cret" });
  });
  it("mock mode answers without the network", async () => {
    const r = await searchExternal(env({}), "youth employment", true);
    expect(r.results.length).toBe(2);
    expect(r.results[0].url).toMatch(/^https:\/\//);
    expect(mockExternal("x")[0].snippet).toMatch(/local tests only/);
  });
  describe("providers", () => {
    let calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[];
    let answer: { status: number; json: unknown };
    beforeEach(() => {
      calls = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(answer.json), { status: answer.status, headers: { "Content-Type": "application/json" } });
      }));
    });
    afterEach(() => vi.unstubAllGlobals());
    it("tavily: sends the key in the body and reads results", async () => {
      answer = { status: 200, json: { results: [{ title: "T", url: "https://statistics.gov.rw/a", content: "c" }] } };
      const r = await searchExternal(env({ EXTERNAL_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "tv-key" }), "q", false);
      expect(calls[0].url).toBe("https://api.tavily.com/search");
      expect(calls[0].body.api_key).toBe("tv-key");
      expect(r.results).toEqual([{ title: "T", url: "https://statistics.gov.rw/a", snippet: "c", publisher: "statistics.gov.rw" }]);
    });
    it("serper: sends the key as a header and reads organic results", async () => {
      answer = { status: 200, json: { organic: [{ title: "S", link: "https://nisr.gov.rw/b", snippet: "d" }] } };
      const r = await searchExternal(env({ EXTERNAL_SEARCH_PROVIDER: "serper", SERPER_API_KEY: "sp-key" }), "q", false);
      expect(calls[0].headers["X-API-KEY"]).toBe("sp-key");
      expect(r.results[0].url).toBe("https://nisr.gov.rw/b");
    });
    it("a provider failure gives no results and a reason without the key", async () => {
      answer = { status: 500, json: {} };
      const r = await searchExternal(env({ EXTERNAL_SEARCH_PROVIDER: "serper", SERPER_API_KEY: "sp-key" }), "q", false);
      expect(r.results).toEqual([]);
      expect(r.reason).toMatch(/500/);
      expect(r.reason).not.toMatch(/sp-key/);
    });
  });
});

describe("the prompt", () => {
  const kb: KbMaterial[] = [{ ...item(), body: "Resident population: 13,246,394 (2022).", sources: [{ title: "RPHC5", url: "https://www.statistics.gov.rw/rphc5", publisher: "NISR" }] }];
  const external = [{ title: "World Bank population", url: "https://data.worldbank.org/rw", snippet: "13.78 million (2022 estimate).", publisher: "data.worldbank.org" }];
  it("gives the material as numbered notes with ids and references", () => {
    const p = buildPrompt("What is the population of Rwanda?", kb, external, "Rwanda");
    expect(p.user).toContain("Question: What is the population of Rwanda?");
    expect(p.user).toContain("[1] ISOKO id=11111111-1111-4111-8111-111111111111");
    expect(p.user).toContain("Reference: RPHC5 (NISR) https://www.statistics.gov.rw/rphc5");
    expect(p.user).toContain("[2] data.worldbank.org https://data.worldbank.org/rw");
  });
  it("never uses the engine's own vocabulary and insists on not inventing", () => {
    const p = buildPrompt("Q?", kb, external, null);
    for (const word of ["internal", "external", "database", "search"]) {
      const whole = new RegExp(`\\b${word}\\b`, "i"); // "research" is fine, "search" is not
      expect(p.system).not.toMatch(whole);
      expect(p.user).not.toMatch(whole);
    }
    expect(p.system).toContain("Never invent a figure");
    expect(p.system).toContain(NOT_FOUND);
    expect(p.system).toMatch(/not the same measurement/);
  });
  it("says so when there is nothing to read", () => {
    expect(buildPrompt("Q?", [], [], null).user).toContain("(no notes)");
  });
});

describe("the model's reply", () => {
  it("reads clean JSON, fenced JSON and JSON with text around it", () => {
    const json = '{"answer":"About 13.2 million people (2022 census).","used_item_ids":["a"],"used_source_urls":["https://x.org/"],"conflicts":[{"topic":"population","note":"13.2m (census 2022) vs 13.8m (estimate 2022)"}]}';
    for (const text of [json, "```json\n" + json + "\n```", "Here you go:\n" + json + "\nThanks"]) {
      const r = parseModelReply(text);
      expect(r?.answer).toMatch(/13.2 million/);
      expect(r?.used_item_ids).toEqual(["a"]);
      expect(r?.conflicts).toEqual([{ topic: "population", note: "13.2m (census 2022) vs 13.8m (estimate 2022)" }]);
    }
  });
  it("rejects what is not JSON and tolerates missing fields", () => {
    expect(parseModelReply("no json here")).toBeNull();
    expect(parseModelReply("")).toBeNull();
    expect(parseModelReply('{"answer": 5}')).toEqual({ answer: null, used_item_ids: [], used_source_urls: [], conflicts: [] });
    expect(parseModelReply('{"answer":"x","conflicts":[{"topic":"t"},"junk"]}')?.conflicts).toEqual([]);
  });
  it("recognizes the not-found sentence and keeps answers short", () => {
    expect(isNotFound(NOT_FOUND)).toBe(true);
    expect(isNotFound(`${NOT_FOUND}.`)).toBe(true);
    expect(isNotFound("Rwanda has about 13 million people.")).toBe(false);
    expect(sanitizeAnswer("  a \n b  ")).toBe("a b");
    expect(sanitizeAnswer("x".repeat(3000))!.length).toBe(2500);
  });
  it("decides the mode from what was used", () => {
    expect(decideMode(true, false)).toBe("kb");
    expect(decideMode(true, true)).toBe("kb_external");
    expect(decideMode(false, true)).toBe("external");
    expect(decideMode(false, false)).toBe("none");
  });
  it("mock answers are deterministic and honest when nothing matched", () => {
    expect(mockAnswer("Q", [], []).answer).toBe(NOT_FOUND);
    const m = mockAnswer("Q", [{ ...item(), body: null, sources: [] }], []);
    expect(m.answer).toContain("Population of Rwanda, 2022 census");
    expect(m.used_item_ids).toEqual([item().id]);
  });
});

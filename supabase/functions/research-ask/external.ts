// Outside information for the answer engine, used only when the knowledge
// base is not enough. Two providers are known; which one runs is decided by
// EXTERNAL_SEARCH_PROVIDER and its key, both kept as function secrets. With
// RESEARCH_MOCK=1 (local only) fake results come back so nothing is called.
import { EXTERNAL_TOP, filterExternal, type ExternalResult } from "./engine.ts";

type Env = { get(name: string): string | undefined };

export const EXTERNAL_TIMEOUT_MS = 8_000;

export type Provider = "tavily" | "serper";

/** The configured provider, or a sentence saying why there is none */
export function configuredProvider(env: Env): { name: Provider; key: string } | string {
  const name = (env.get("EXTERNAL_SEARCH_PROVIDER") ?? "").trim().toLowerCase();
  if (!name) return "no external search provider configured";
  if (name === "tavily") {
    const key = env.get("TAVILY_API_KEY")?.trim();
    return key ? { name, key } : "TAVILY_API_KEY is not set";
  }
  if (name === "serper") {
    const key = env.get("SERPER_API_KEY")?.trim();
    return key ? { name, key } : "SERPER_API_KEY is not set";
  }
  return `unknown external search provider "${name}"`;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Tavily: POST https://api.tavily.com/search */
async function tavily(key: string, query: string, preferred: string[]): Promise<ExternalResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: EXTERNAL_TOP * 2, search_depth: "basic", include_answer: false, ...(preferred.length ? { include_domains: preferred } : {}) }),
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tavily answered ${res.status}`);
  const data = (await res.json()) as { results?: unknown[] };
  return (data.results ?? []).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return { title: str(o.title), url: str(o.url), snippet: str(o.content), publisher: null };
  });
}

/** Serper (Google results): POST https://google.serper.dev/search */
async function serper(key: string, query: string): Promise<ExternalResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: EXTERNAL_TOP * 2 }),
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`serper answered ${res.status}`);
  const data = (await res.json()) as { organic?: unknown[] };
  return (data.organic ?? []).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return { title: str(o.title), url: str(o.link), snippet: str(o.snippet), publisher: null };
  });
}

/** Fake results for local runs: two notes from a made-up official statistics site */
export function mockExternal(query: string): ExternalResult[] {
  return [
    { title: `Statistical bulletin on ${query}`, url: "https://statistics.example.org/bulletin", snippet: `A mock bulletin with figures about ${query}, for local tests only. Reported value: 42 (2024).`, publisher: "statistics.example.org" },
    { title: `Research summary: ${query}`, url: "https://university.example.org/research", snippet: `A mock research summary about ${query}, for local tests only. Reported value: 40 (2022, survey).`, publisher: "university.example.org" },
  ];
}

/**
 * Looks outside for a question. Returns the filtered results, or [] with a
 * reason when nothing could be retrieved (the engine then answers from what
 * it has, or says it could not find enough).
 */
export async function searchExternal(env: Env, query: string, mock: boolean): Promise<{ results: ExternalResult[]; reason: string | null }> {
  const preferred = env.get("EXTERNAL_SEARCH_PREFERRED_DOMAINS");
  const blocked = env.get("EXTERNAL_SEARCH_BLOCKED_DOMAINS");
  if (mock) return { results: filterExternal(mockExternal(query), preferred, blocked), reason: null };
  const provider = configuredProvider(env);
  if (typeof provider === "string") return { results: [], reason: provider };
  try {
    const preferredList = (preferred ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    const raw = provider.name === "tavily" ? await tavily(provider.key, query, preferredList) : await serper(provider.key, query);
    return { results: filterExternal(raw, preferred, blocked), reason: null };
  } catch (e) {
    // the message never carries the key: providers answer with a status, not the request
    return { results: [], reason: e instanceof Error ? e.message : "external search failed" };
  }
}

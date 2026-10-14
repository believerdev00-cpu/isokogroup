// Looking outside ISOKO for a question, used when what ISOKO holds is not
// enough. Which providers run is decided by EXTERNAL_SEARCH_PROVIDER (one name,
// or several separated by commas, tried in that order) and their keys, all kept
// as function secrets. When a provider fails the next configured one is tried,
// so one outage is not an outage of the hub. With RESEARCH_MOCK=1 (local only)
// fake results come back and nothing is called.
import { EXTERNAL_TOP, filterExternal, type ExternalResult } from "./engine.ts";

type Env = { get(name: string): string | undefined };

export const EXTERNAL_TIMEOUT_MS = 8_000;

export type Provider = "tavily" | "serper";
export type ProviderSpec = { name: Provider; key: string };

/** What happened when the question was taken outside */
export type SearchStatus =
  | "ok" // a provider answered (possibly with nothing)
  | "not_configured" // nothing to ask: no provider, or no key for the ones named
  | "failed"; // every configured provider was asked and every one of them failed

export type SearchOutcome = { results: ExternalResult[]; reason: string | null; status: SearchStatus };

const KEY_OF: Record<Provider, string> = { tavily: "TAVILY_API_KEY", serper: "SERPER_API_KEY" };
const KNOWN = Object.keys(KEY_OF) as Provider[];

/**
 * The providers that are both named and usable, in the order they will be
 * tried, with a sentence about any that were named but cannot be used. The
 * sentence names the setting that is missing and never a key's value.
 */
export function configuredProviders(env: Env): { providers: ProviderSpec[]; reason: string | null } {
  const named = (env.get("EXTERNAL_SEARCH_PROVIDER") ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (named.length === 0) return { providers: [], reason: "no provider is configured for looking outside ISOKO" };
  const providers: ProviderSpec[] = [];
  const problems: string[] = [];
  for (const name of named) {
    if (!KNOWN.includes(name as Provider)) {
      problems.push(`unknown provider "${name}"`);
      continue;
    }
    const key = env.get(KEY_OF[name as Provider])?.trim();
    if (!key) {
      problems.push(`${KEY_OF[name as Provider]} is not set`);
      continue;
    }
    providers.push({ name: name as Provider, key });
  }
  return { providers, reason: problems.length ? problems.join("; ") : null };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const day = (v: unknown) => {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

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
    return { title: str(o.title), url: str(o.url), snippet: str(o.content), publisher: null, published_on: day(o.published_date) };
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
    return { title: str(o.title), url: str(o.link), snippet: str(o.snippet), publisher: null, published_on: day(o.date) };
  });
}

const run = (p: ProviderSpec, query: string, preferred: string[]) =>
  p.name === "tavily" ? tavily(p.key, query, preferred) : serper(p.key, query);

/** Fake results for local runs: two notes from a made-up official statistics site */
export function mockExternal(query: string): ExternalResult[] {
  return [
    { title: `Statistical bulletin on ${query}`, url: "https://statistics.example.org/bulletin", snippet: `A mock bulletin with figures about ${query}, for local tests only. Reported value: 42 (2024).`, publisher: "statistics.example.org" },
    { title: `Research summary: ${query}`, url: "https://university.example.org/research", snippet: `A mock research summary about ${query}, for local tests only. Reported value: 40 (2022, survey).`, publisher: "university.example.org" },
  ];
}

/**
 * Takes one question outside. Each configured provider is tried in turn until
 * one returns something usable; the status says whether anything could be
 * asked at all, so the visitor can be told the difference between "nothing was
 * found" and "this is not working at the moment".
 */
export async function searchExternal(env: Env, query: string, mock: boolean): Promise<SearchOutcome> {
  const preferred = env.get("EXTERNAL_SEARCH_PREFERRED_DOMAINS");
  const blocked = env.get("EXTERNAL_SEARCH_BLOCKED_DOMAINS");
  if (mock) return { results: filterExternal(mockExternal(query), preferred, blocked), reason: null, status: "ok" };

  const { providers, reason } = configuredProviders(env);
  if (providers.length === 0) return { results: [], reason, status: "not_configured" };

  const preferredList = (preferred ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const raw = await run(provider, query, preferredList);
      const results = filterExternal(raw, preferred, blocked);
      if (results.length > 0) return { results, reason: failures.length ? failures.join("; ") : null, status: "ok" };
      failures.push(`${provider.name} found nothing usable`);
    } catch (e) {
      // the message never carries the key: providers answer with a status, not the request
      failures.push(e instanceof Error ? e.message : `${provider.name} failed`);
    }
  }
  // every provider was asked; whether any of them actually worked decides the status
  const allFailed = failures.every((f) => !f.endsWith("found nothing usable"));
  return { results: [], reason: [reason, ...failures].filter(Boolean).join("; ") || null, status: allFailed ? "failed" : "ok" };
}

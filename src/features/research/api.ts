// ISOKO Information Hub: reading the research knowledge base and asking the
// information engine. Everything public goes through row-level security and
// the research_* database functions; the engine is the research-ask Edge
// Function (which keeps every key on the server).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db, rpc, unwrap } from "@/features/services/api";

export const HUB = "/research";
export const HUB_NAME = "ISOKO Information Hub";
export const TAGLINE = "Find information. Explore knowledge. Understand data.";
export const PAGE_SIZE = 20;

export type Kind = "statistic" | "research" | "study" | "report" | "finding" | "dataset" | "survey";
export const KINDS: Kind[] = ["statistic", "research", "report", "study", "finding", "dataset", "survey"];
export const KIND_LABEL: Record<Kind, string> = {
  statistic: "Statistics", research: "Research", study: "Studies", report: "Reports", finding: "Findings", dataset: "Datasets", survey: "Surveys",
};
export const KIND_ONE: Record<Kind, string> = {
  statistic: "Statistic", research: "Research", study: "Study", report: "Report", finding: "Finding", dataset: "Dataset", survey: "Survey",
};
export const kindLabel = (k: string) => KIND_LABEL[k as Kind] ?? k;
export const kindOne = (k: string) => KIND_ONE[k as Kind] ?? k;

export type SearchRow = {
  id: string; slug: string; kind: Kind; title: string; summary: string | null;
  country_slug: string | null; country_name: string | null; topic_slug: string | null; topic_name: string | null;
  region_name: string | null; published_on: string | null; verification: "unverified" | "verified"; origin: "isoko" | "external";
  featured: boolean; is_demo: boolean; cover_path: string | null; rank: number; total: number;
};
export type Country = { id: string; code: string; name: string; slug: string; is_active: boolean; sort: number };
export type Region = { id: string; country_id: string; parent_id: string | null; level: string; name: string; slug: string; code: string | null; sort: number };
export type Topic = { id: string; slug: string; name: string; parent_id: string | null; description: string | null; sort: number };
export type Stat = { id: string; label: string; value: number | string; unit: string | null; period_label: string | null; period_date: string | null; region_id: string | null; series: string | null; sort: number };
export type Source = { id: string; title: string; url: string | null; publisher: string | null; source_type: string; published_on: string | null; sort: number };
export type Related = { id: string; slug: string; kind: Kind; title: string };
export type ItemDetail = {
  id: string; slug: string; kind: Kind; title: string; summary: string | null; body: string | null;
  period_start: string | null; period_end: string | null; published_on: string | null; author: string | null; organization: string | null;
  methodology: string | null; origin: "isoko" | "external"; source_name: string | null; source_url: string | null;
  verification: "unverified" | "verified"; verified_at: string | null; featured: boolean; is_demo: boolean; keywords: string[]; tags: string[];
  cover_path: string | null; created_at: string; updated_at: string;
  stats: Stat[]; sources: Source[]; related: Related[];
  country: { slug: string; name: string } | null; region: { slug: string; name: string; level: string } | null;
  topic: { slug: string; name: string } | null; subtopic: { slug: string; name: string } | null;
};
export type AskResponse = {
  answer: string | null; mode: "kb" | "kb_external" | "external" | "none";
  items: { id: string; slug: string; kind: Kind; title: string; summary: string | null; country_name: string | null; topic_name: string | null; published_on: string | null; verification: string }[];
  sources: { title: string; url: string | null; publisher: string | null }[];
  conflicts: { topic: string; note: string }[];
  cached: boolean; ai: boolean;
};

export type SearchParams = { q?: string; country?: string | null; kind?: string | null; topic?: string | null; page?: number; limit?: number };

const STALE = 5 * 60_000;

export const coverUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from("media-public").getPublicUrl(path).data.publicUrl : null;

/** Browse or search public items (browse when the query is empty). */
export function useResearchSearch(p: SearchParams, enabled = true) {
  const limit = p.limit ?? PAGE_SIZE;
  const page = Math.max(1, p.page ?? 1);
  return useQuery({
    queryKey: ["research", "search", p.q ?? "", p.country ?? null, p.kind ?? null, p.topic ?? null, page, limit],
    enabled,
    staleTime: 60_000,
    queryFn: () => rpc<SearchRow[]>("research_search", {
      p_query: (p.q ?? "").trim().slice(0, 200), p_country: p.country || null, p_kind: p.kind || null, p_topic: p.topic || null,
      p_limit: limit, p_offset: (page - 1) * limit,
    }),
  });
}

export function useResearchCounts() {
  return useQuery({ queryKey: ["research", "counts"], staleTime: STALE, queryFn: () => rpc<{ kind: Kind; n: number }[]>("research_counts") });
}

export function useRegionCounts(countrySlug: string | null | undefined) {
  return useQuery({
    queryKey: ["research", "region-counts", countrySlug],
    enabled: !!countrySlug,
    staleTime: STALE,
    queryFn: () => rpc<{ region_id: string; slug: string; name: string; level: string; n: number }[]>("research_region_counts", { p_country: countrySlug }),
  });
}

export function useTrendingQuestions(limit = 8) {
  return useQuery({ queryKey: ["research", "trending", limit], staleTime: STALE, queryFn: () => rpc<{ question: string; ask_count: number }[]>("research_trending_questions", { p_limit: limit }) });
}

export function useResearchItem(slug: string | undefined) {
  return useQuery({
    queryKey: ["research", "item", slug],
    enabled: !!slug,
    queryFn: () => rpc<ItemDetail | null>("research_item_detail", { p_slug: slug }),
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ["research", "topics"],
    staleTime: STALE,
    queryFn: async () => unwrap(await db.from("research_topics").select("*").order("sort").order("name")) as Topic[],
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ["research", "countries"],
    staleTime: STALE,
    queryFn: async () => unwrap(await db.from("research_countries").select("*").order("sort").order("name")) as Country[],
  });
}

export function useRegions(countryId: string | undefined) {
  return useQuery({
    queryKey: ["research", "regions", countryId],
    enabled: !!countryId,
    staleTime: STALE,
    queryFn: async () => unwrap(await db.from("research_regions").select("*").eq("country_id", countryId).order("sort").order("name")) as Region[],
  });
}

export class AskError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** One natural answer to a question, from the information engine. */
export async function askResearch(question: string, country?: string | null): Promise<AskResponse> {
  const { data, error } = await supabase.functions.invoke("research-ask", { body: { question: question.trim().slice(0, 300), country: country || undefined } });
  if (error) {
    let status = 500;
    let message = "The information engine is not available right now. Please try again.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      status = ctx.status;
      try {
        const body = await ctx.json();
        if (body?.error) message = String(body.error);
      } catch {
        // no JSON body: keep the generic message
      }
    }
    throw new AskError(message, status);
  }
  return data as AskResponse;
}

// ---------- recent searches (this browser only; nothing about the person) ----------
const RECENT_KEY = "isoko-research-recent";
export function recentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function rememberSearch(q: string) {
  const query = q.trim();
  if (!query) return;
  try {
    const next = [query, ...recentSearches().filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // private mode: nothing remembered
  }
}
export function forgetSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* nothing stored */ }
}

// ---------- formatting ----------
export const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
export const formatYear = (d: string | null | undefined) => (d ? String(new Date(d).getFullYear()) : null);
export const formatNumber = (v: number | string) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
};
/** "2019–2022" or "2022" */
export const periodLabel = (start: string | null, end: string | null) => {
  const a = formatYear(start), b = formatYear(end);
  if (a && b) return a === b ? a : `${a}–${b}`;
  return a ?? b ?? null;
};
export const searchPath = (q: string, extra: Record<string, string | null | undefined> = {}) => {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set("q", q.trim());
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  const s = sp.toString();
  return `${HUB}/search${s ? `?${s}` : ""}`;
};

// Reading the pages behind the results, so an answer rests on what a source
// actually says rather than on the sentence a provider chose to show.
//
// Only ordinary public web pages are read: https only, never an address inside
// a private network, never anything but text, never more than a few hundred
// kilobytes, and never for longer than a few seconds. Whatever comes back is
// other people's writing, so it is treated as material to read and never as
// instructions (the prompt says so too, and nothing here is ever executed).
import { type ExternalResult } from "./engine.ts";

/** How long one page may take before it is abandoned */
export const PAGE_TIMEOUT_MS = 6_000;
/** How much of a page is read before the rest is dropped */
export const PAGE_MAX_BYTES = 400_000;
/** How much readable text one note may carry into the prompt */
export const PAGE_MAX_CHARS = 6_000;
/** How many pages are fetched for one question */
export const PAGE_FETCH_TOP = 3;

const PRIVATE_HOSTS = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|169\.254(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;
const PRIVATE_SUFFIX = /\.(local|internal|localdomain|home|lan)$/i;

/**
 * Is this an address worth opening? Public https pages only: an address that
 * resolves inside the network this function runs in is never requested, so a
 * result that names one cannot be used to reach anything private.
 */
export function isFetchable(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "metadata.google.internal") return false;
  if (PRIVATE_HOSTS.test(host) || PRIVATE_SUFFIX.test(host)) return false;
  return host.includes(".");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#160": " ",
};

/** The readable words of an HTML page: no scripts, no styles, no markup, no runs of blank space. */
export function htmlToText(html: string, max = PAGE_MAX_CHARS): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return body
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** The day a page says it was published, when it says so in a way worth trusting */
export function publishedDate(html: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|date|dc\.date(?:\.issued)?|pubdate)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const t = m ? Date.parse(m[1]) : NaN;
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Reads one page, or returns null when it cannot be read for any reason at all. */
export async function fetchPage(url: string, timeoutMs = PAGE_TIMEOUT_MS): Promise<{ text: string; published_on: string | null } | null> {
  if (!isFetchable(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.1", "User-Agent": "IsokoResearchBot/1.0 (+https://www.isokogroups.com)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // a redirect may have left the public web, or left https
    if (!res.ok || !isFetchable(res.url || url)) return null;
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > PAGE_MAX_BYTES) return null;
    const raw = (await res.text()).slice(0, PAGE_MAX_BYTES);
    const text = /text\/plain/.test(type) ? raw.slice(0, PAGE_MAX_CHARS) : htmlToText(raw);
    // a page that yielded nothing readable is no better than its snippet
    return text.length < 200 ? null : { text, published_on: publishedDate(raw) };
  } catch {
    // timed out, refused, unreachable, malformed: the snippet still stands
    return null;
  }
}

/**
 * Reads the most promising results. Pages that cannot be read keep the snippet
 * the provider gave, so one blocked or slow site never costs the answer.
 */
export async function fetchPages(results: ExternalResult[], top = PAGE_FETCH_TOP, timeoutMs = PAGE_TIMEOUT_MS): Promise<ExternalResult[]> {
  const read = await Promise.all(results.slice(0, top).map((r) => fetchPage(r.url, timeoutMs)));
  return results.map((r, i) => {
    const page = i < read.length ? read[i] : null;
    return page ? { ...r, text: page.text, published_on: page.published_on ?? r.published_on ?? null } : r;
  });
}

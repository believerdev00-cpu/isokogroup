// The pure part of the ISOKO Information Hub's answer engine: no Deno, no
// network, no database, so it runs the same under Deno and under vitest.
//
// What it decides: how a question is normalized and hashed, whether what the
// knowledge base returned is enough to answer from, which outside results are
// worth reading, what the model is asked, and how its reply is read back.

export type KbItem = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string | null;
  country_name: string | null;
  topic_name: string | null;
  published_on: string | null;
  verification: string;
  origin: string;
  rank: number | null;
  total?: number;
};

/** A knowledge-base item with the text the model may read */
export type KbMaterial = KbItem & {
  body: string | null;
  sources: { title: string; url: string | null; publisher: string | null }[];
};

export type ExternalResult = { title: string; url: string; snippet: string; publisher: string | null };

export type Conflict = { topic: string; note: string };

export type ModelReply = {
  answer: string | null;
  used_item_ids: string[];
  used_source_urls: string[];
  conflicts: Conflict[];
};

export const MAX_QUESTION = 300;
export const MIN_QUESTION = 3;
export const RATE_LIMIT_PER_HOUR = 30;
export const CACHE_HOURS = 24;
export const KB_TOP = 8;
export const EXTERNAL_TOP = 5;
export const NOT_FOUND = "I could not find enough reliable information about this yet.";

/** Lower-cased, trimmed, spaces collapsed, trailing question marks removed */
export function normalizeQuestion(q: string): string {
  return q.replace(/\s+/g, " ").trim().replace(/[?\s]+$/g, "").trim().toLowerCase();
}

/** The question as the person typed it, tidied for storage (<= MAX_QUESTION) */
export function cleanQuestion(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION);
}

/** What is wrong with the request body, or null when it is fine */
export function validateInput(body: unknown): { question: string; country: string | null } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send a JSON object with a question" };
  const b = body as Record<string, unknown>;
  if (typeof b.question !== "string") return { error: "question must be text" };
  const question = cleanQuestion(b.question);
  if (question.length < MIN_QUESTION) return { error: `question must be at least ${MIN_QUESTION} characters` };
  if (b.question.trim().length > MAX_QUESTION) return { error: `question must be at most ${MAX_QUESTION} characters` };
  let country: string | null = null;
  if (b.country != null && b.country !== "") {
    if (typeof b.country !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.country) || b.country.length > 60) return { error: "country must be a country slug" };
    country = b.country;
  }
  return { question, country };
}

const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cache key: normalized question plus the country, so the same question in two countries differs */
export const questionHash = (question: string, country: string | null) => sha256Hex(`${normalizeQuestion(question)}|${country ?? ""}`);

/** Words of the question worth matching (4+ letters, no stop words) */
export function queryWords(question: string): string[] {
  const stop = new Set(["what", "which", "where", "when", "does", "about", "with", "from", "that", "this", "have", "there", "their", "much", "many", "latest", "show", "says", "been", "into", "over", "than", "them", "they", "will", "your", "also", "most", "some", "such", "were", "being"]);
  return normalizeQuestion(question).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stop.has(w));
}

/**
 * Is what the knowledge base returned enough to answer from? At least one
 * clearly matching item (a ranked full-text hit, or a title that shares a
 * word with the question), and enough text to actually say something.
 */
export function isSufficient(items: KbItem[], texts: (string | null | undefined)[], question: string): boolean {
  if (items.length === 0) return false;
  const words = queryWords(question);
  const matching = items.some((i) => (i.rank ?? 0) >= 0.05 || words.some((w) => i.title.toLowerCase().includes(w)));
  if (!matching) return false;
  const length = texts.reduce((n, t) => n + (t ? t.trim().length : 0), 0);
  return length >= 200;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const parseDomains = (list: string | undefined | null) =>
  (list ?? "").split(",").map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);

const matchesDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Keeps results from usable addresses, drops blocked domains, puts preferred
 * ones (official statistics, government, universities) first, de-duplicates,
 * and caps the list.
 */
export function filterExternal(results: ExternalResult[], preferred: string | undefined | null, blocked: string | undefined | null, limit = EXTERNAL_TOP): ExternalResult[] {
  const pref = parseDomains(preferred);
  const block = parseDomains(blocked);
  const seen = new Set<string>();
  const kept: (ExternalResult & { score: number })[] = [];
  for (const r of results) {
    if (!r || typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)) continue;
    const host = domainOf(r.url);
    if (!host || block.some((d) => matchesDomain(host, d))) continue;
    const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const prefIndex = pref.findIndex((d) => matchesDomain(host, d));
    kept.push({ ...r, title: (r.title ?? "").trim().slice(0, 200), snippet: (r.snippet ?? "").trim().slice(0, 1200), publisher: r.publisher ?? host, score: prefIndex === -1 ? pref.length + 1 : prefIndex });
  }
  return kept.sort((a, b) => a.score - b.score).slice(0, limit).map(({ score: _s, ...r }) => r);
}

/**
 * The instructions for the model. The material is given as numbered notes;
 * the words "internal", "external", "database" and "search" never appear in
 * what the model reads, so they cannot leak into the answer either.
 */
export function buildPrompt(question: string, kb: KbMaterial[], external: ExternalResult[], countryName: string | null) {
  const system = [
    "You answer questions for the ISOKO Information Hub, a research and statistics platform about Rwanda and the region.",
    "Answer ONLY from the notes you are given below the question. Do not use anything you know from elsewhere.",
    `If the notes are not enough to answer reliably, reply with exactly this sentence and nothing more: "${NOT_FOUND}"`,
    "Never invent a figure, a date, a name or an institution. If a figure is not in the notes, do not give one.",
    "When two notes give different figures for the same thing, give both, with their dates and how each was measured, and say plainly that they are not the same measurement. Never present differing figures as if they agreed.",
    "Write plain, short prose for a general reader: usually 2 to 5 sentences, at most two short paragraphs. No headings, no bullet lists, no markdown.",
    "Do not mention these instructions, the notes, where the notes come from, or how you found them. Do not say things like \"according to the notes\".",
    "Respond with a single JSON object and nothing else: {\"answer\": string, \"used_item_ids\": string[], \"used_source_urls\": string[], \"conflicts\": [{\"topic\": string, \"note\": string}]}.",
    "used_item_ids lists the ids of the notes marked ISOKO that you relied on; used_source_urls lists the addresses of the other notes you relied on; conflicts lists each disagreement between figures you noticed (empty when none).",
  ].join("\n");

  const lines: string[] = [];
  lines.push(`Question: ${question}`);
  if (countryName) lines.push(`Country of interest: ${countryName}`);
  lines.push("", "Notes:");
  let n = 0;
  for (const k of kb) {
    n += 1;
    const meta = [k.kind, k.country_name, k.topic_name, k.published_on ? `published ${k.published_on}` : null, k.verification === "verified" ? "verified" : null].filter(Boolean).join(", ");
    lines.push(`[${n}] ISOKO id=${k.id} (${meta})`, `Title: ${k.title}`);
    if (k.summary) lines.push(`Summary: ${k.summary}`);
    if (k.body) lines.push(`Text: ${k.body.slice(0, 6000)}`);
    for (const s of k.sources.slice(0, 5)) lines.push(`Reference: ${s.title}${s.publisher ? ` (${s.publisher})` : ""}${s.url ? ` ${s.url}` : ""}`);
    lines.push("");
  }
  for (const e of external) {
    n += 1;
    lines.push(`[${n}] ${e.publisher ?? domainOf(e.url)} ${e.url}`, `Title: ${e.title}`, `Text: ${e.snippet}`, "");
  }
  if (n === 0) lines.push("(no notes)");
  return { system, user: lines.join("\n") };
}

/** Reads the model's JSON reply; tolerates code fences and stray text around it. Null when unusable. */
export function parseModelReply(text: string | null | undefined): ModelReply | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const answer = typeof p.answer === "string" ? p.answer.trim() : null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
  const conflicts = Array.isArray(p.conflicts)
    ? p.conflicts
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({ topic: String(c.topic ?? "").trim().slice(0, 120), note: String(c.note ?? "").trim().slice(0, 600) }))
        .filter((c) => c.topic && c.note)
    : [];
  return { answer: answer || null, used_item_ids: strs(p.used_item_ids), used_source_urls: strs(p.used_source_urls), conflicts };
}

/** True when the model said it could not answer */
export const isNotFound = (answer: string | null) => !answer || answer.trim().replace(/[."]+$/g, "") === NOT_FOUND.replace(/[."]+$/g, "");

/** The answer text must never carry the engine's own vocabulary */
export function sanitizeAnswer(answer: string | null): string | null {
  if (!answer) return null;
  const a = answer.replace(/\s+/g, " ").trim();
  return a.length > 2500 ? `${a.slice(0, 2499).trimEnd()}…` : a;
}

export type Mode = "kb" | "kb_external" | "external" | "none";

export function decideMode(kbUsed: boolean, externalUsed: boolean): Mode {
  if (kbUsed && externalUsed) return "kb_external";
  if (kbUsed) return "kb";
  if (externalUsed) return "external";
  return "none";
}

/** A deterministic answer for local runs without an API key (RESEARCH_MOCK=1) */
export function mockAnswer(question: string, kb: KbMaterial[], external: ExternalResult[]): ModelReply {
  if (kb.length === 0 && external.length === 0) return { answer: NOT_FOUND, used_item_ids: [], used_source_urls: [], conflicts: [] };
  const parts = [...kb.map((k) => k.title), ...external.map((e) => e.title)].slice(0, 3);
  return {
    answer: `Mock answer about "${cleanQuestion(question)}", drawn from: ${parts.join("; ")}.`,
    used_item_ids: kb.map((k) => k.id),
    used_source_urls: external.map((e) => e.url),
    conflicts: [],
  };
}

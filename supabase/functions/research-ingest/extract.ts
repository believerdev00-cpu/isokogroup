// The pure part of document ingestion: no Deno, no network, no database, so it
// runs the same under Deno and under vitest. Reading a PDF or a spreadsheet
// into text and rows happens in index.ts; everything after that (which rows
// are figures, what the title and summary are, what the model is asked) is here.
import { excerpt, type Figure, isoDate, parseFigures, parseNumber, slugify } from "../research-ask/engine.ts";

export type { Figure };

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FIGURES = 60;
export const MAX_BODY = 50000;
export const MAX_SUMMARY = 1000;
export const MAX_TITLE = 200;
/** Above this many characters the model is not asked; the heuristics stand */
export const MODEL_MAX_CHARS = 12000;
export const KINDS = ["statistic", "research", "study", "report", "finding", "dataset", "survey"] as const;
export type Kind = (typeof KINDS)[number];

export type FileType = "pdf" | "xlsx" | "csv" | "tsv" | "txt";
export type Cell = string | number | boolean | null;
export type Row = Cell[];

const TYPES: Record<string, FileType> = { pdf: "pdf", xlsx: "xlsx", xls: "xlsx", csv: "csv", tsv: "tsv", txt: "txt" };
export const MIMES: Record<FileType, string> = {
  pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", tsv: "text/csv", txt: "text/plain",
};

export function fileNameOf(path: string): string {
  return path.split("/").pop() || path;
}

/** What kind of file this is, from its extension; null when it is not one we read */
export function detectType(path: string): FileType | null {
  const ext = (fileNameOf(path).match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  return TYPES[ext] ?? null;
}

/** What is wrong with the request body, or the tidied input */
export function validateInput(body: unknown): { path: string; country: string | null; kind: Kind | null; title: string | null } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send a JSON object with the file's path" };
  const b = body as Record<string, unknown>;
  if (typeof b.path !== "string" || !b.path.startsWith("ingest/") || b.path.length < 9 || b.path.length > 300 || b.path.includes("..") || b.path.includes("\\") || b.path.includes(String.fromCharCode(0))) {
    return { error: "path must be a file uploaded under ingest/ in the research bucket" };
  }
  if (!detectType(b.path)) return { error: "Only PDF, XLSX, XLS, CSV, TSV and TXT files can be read" };
  let country: string | null = null;
  if (b.country != null && b.country !== "") {
    if (typeof b.country !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.country) || b.country.length > 60) return { error: "country must be a country slug" };
    country = b.country;
  }
  let kind: Kind | null = null;
  if (b.kind != null && b.kind !== "") {
    if (typeof b.kind !== "string" || !(KINDS as readonly string[]).includes(b.kind)) return { error: `kind must be one of ${KINDS.join(", ")}` };
    kind = b.kind as Kind;
  }
  let title: string | null = null;
  if (b.title != null && b.title !== "") {
    if (typeof b.title !== "string") return { error: "title must be text" };
    title = b.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || null;
  }
  return { path: b.path, country, kind, title };
}

// ---- delimited text ----

/** Comma or tab, whichever the first line has more of */
export function detectDelimiter(text: string): "," | "\t" {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

/** A CSV/TSV parser: quoted fields, doubled quotes, newlines inside quotes; numeric cells become numbers */
export function parseDelimited(text: string, delimiter?: "," | "\t"): Row[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // a byte-order mark is not a cell
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") { quoted = true; continue; }
    if (c === d) { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
      continue;
    }
    cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows
    .map((r) => r.map((v): Cell => {
      const t = v.trim();
      if (t === "") return null;
      const n = parseNumber(t);
      return n !== null && /\d/.test(t) && !/^[-+]?0\d/.test(t) ? n : t;
    }))
    .filter((r) => r.some((v) => v !== null));
}

// ---- figures ----

const isText = (c: Cell): c is string => typeof c === "string" && c.trim() !== "" && parseNumber(c) === null;
export const isYear = (c: Cell): boolean => /^(19|20)\d\d$/.test(String(c ?? "").trim());
const cellNumber = (c: Cell): number | null => (typeof c === "number" ? (Number.isFinite(c) ? c : null) : typeof c === "string" ? parseNumber(c) : null);
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n) || null;

/** True when the first row reads like column names: mostly text, no numbers, with at least one number below it */
export function hasHeader(rows: Row[]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0];
  const textCells = first.filter(isText).length;
  const numbers = first.filter((c) => cellNumber(c) !== null && !isYear(c)).length;
  return textCells >= 1 && numbers === 0 && first.filter((c) => c != null).length >= 2 && rows.slice(1).some((r) => r.some((c) => cellNumber(c) !== null));
}

/** The unit written in a column name: "Value (USD)" -> "USD", "Share %" -> "%" */
export function unitFromHeader(header: Cell): string | null {
  if (!isText(header)) return null;
  const m = header.match(/\(([^)]{1,40})\)/) ?? header.match(/(%|USD|RWF|EUR|US\$)/i);
  return m ? clip(m[1], 40) : null;
}

/**
 * Rows that are figures. Wide tables (label, 2020, 2021, ...) give one figure
 * per year column; long tables give one figure per row from the first numeric
 * cell, with the unit from a "unit" column and the period from a year cell.
 */
export function figuresFromRows(rows: Row[], limit = MAX_FIGURES): Figure[] {
  const out: Figure[] = [];
  if (!rows.length) return out;
  const header = hasHeader(rows) ? rows[0] : null;
  const data = header ? rows.slice(1) : rows;
  const unitCol = header ? header.findIndex((c) => isText(c) && /\bunits?\b/i.test(c)) : -1;
  const periodCol = header ? header.findIndex((c) => isText(c) && /\b(year|period|date)\b/i.test(c)) : -1;
  const yearCols = header ? header.map((c, i) => (isYear(c) ? i : -1)).filter((i) => i >= 0) : [];
  for (const row of data) {
    if (out.length >= limit) break;
    const label = isText(row[0]) ? clip(row[0], 120) : null;
    if (!label) continue;
    const unit = unitCol >= 0 && isText(row[unitCol]) ? clip(row[unitCol], 40) : null;
    if (yearCols.length) {
      for (const i of yearCols) {
        const value = cellNumber(row[i]);
        if (value === null) continue;
        out.push({ label, value, unit, period_label: String(header![i]).trim(), source_url: null });
        if (out.length >= limit) break;
      }
      continue;
    }
    let valueCol = -1;
    for (let i = 1; i < row.length; i++) {
      if (i === unitCol || i === periodCol || isYear(row[i])) continue;
      if (cellNumber(row[i]) !== null) { valueCol = i; break; }
    }
    if (valueCol === -1) continue;
    const yearCell = periodCol >= 0 && row[periodCol] != null ? String(row[periodCol]).trim() : row.find((c, i) => i !== valueCol && isYear(c));
    out.push({
      label, value: cellNumber(row[valueCol])!, unit: unit ?? unitFromHeader(header?.[valueCol] ?? null),
      period_label: yearCell != null ? clip(String(yearCell), 40) : null, source_url: null,
    });
  }
  return out;
}

const FIGURE_LINE = /^\s*([A-Za-z][A-Za-z0-9 ,'()/&%-]{2,100}?)\s*[:\-–—]\s*([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|percent|[A-Za-z$€£][A-Za-z$€£/]{0,19})?\s*(?:\(([^)]{0,60})\))?\s*\.?\s*$/;

/** Lines like "Population: 13,246,394 people (2022)" become figures */
export function figuresFromText(text: string, limit = MAX_FIGURES): Figure[] {
  const out: Figure[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (out.length >= limit) break;
    const m = line.match(FIGURE_LINE);
    if (!m) continue;
    const value = parseNumber(m[2]);
    if (value === null) continue;
    const period = m[4]?.match(/(?:19|20)\d\d(?:[-–/](?:19|20)?\d\d)?/)?.[0] ?? null;
    out.push({ label: clip(m[1], 120)!, value, unit: m[3] ? clip(m[3] === "percent" ? "%" : m[3], 40) : null, period_label: period, source_url: null });
  }
  return out;
}

// ---- text, title, summary, body ----

/** Rows as "label: value" lines, the body of a spreadsheet item */
export function rowsToText(rows: Row[]): string {
  if (!rows.length) return "";
  const header = hasHeader(rows) ? rows[0] : null;
  const data = header ? rows.slice(1) : rows;
  const lines: string[] = [];
  if (header) lines.push(header.map((c) => String(c ?? "")).join(" | "));
  for (const row of data) {
    const first = row[0] == null ? "" : String(row[0]);
    const rest = row.slice(1).map((c, i) => {
      if (c == null) return null;
      const name = header && header[i + 1] != null ? `${String(header[i + 1])} ` : "";
      return `${name}${String(c)}`;
    }).filter(Boolean);
    lines.push(rest.length ? `${first}: ${rest.join(", ")}` : first);
  }
  return lines.join("\n");
}

/** Normalized text: one kind of newline, no trailing spaces, at most one blank line in a row */
export function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").split(String.fromCharCode(0)).join("").split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The given title, else the first line that reads like one, else the file name.
 *  In a spreadsheet the rendered data rows ("Coffee exports: 2021 120") are never a title. */
export function deriveTitle(given: string | null, text: string, fileName: string, tabular = false): string {
  if (given) return given.slice(0, MAX_TITLE);
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^[#\s*•-]+/, "").replace(/\s+/g, " ").trim();
    if (line.length < 4 || line.length > MAX_TITLE || !/[A-Za-z]{3}/.test(line) || line.includes(" | ")) continue;
    if (tabular && /: .*\d/.test(line)) continue;
    return line.replace(/[.:]+$/g, "").trim();
  }
  // the desk uploads as <uuid>-<file name>; the uuid is not part of the title
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "").replace(/[-_]+/g, " ").trim();
  return (base || "Untitled document").slice(0, MAX_TITLE);
}

/** The first paragraphs, up to 1000 characters, cut at a sentence when possible */
export function deriveSummary(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length >= 20);
  const joined = (paragraphs.length ? paragraphs : [text]).join(" ");
  return excerpt(joined, MAX_SUMMARY);
}

export function deriveBody(text: string): string {
  return text.length > MAX_BODY ? text.slice(0, MAX_BODY).trimEnd() : text;
}

export function reviewNote(fileName: string, now: Date): string {
  return `Extracted from ${fileName} on ${isoDate(now)}; check the text and figures.`;
}

/** A unique-enough slug for a new draft: the title's words plus a short random suffix */
export function draftSlug(title: string, suffix: string): string {
  return `${slugify(title, 70)}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "doc"}`;
}

// ---- the model (optional): better title, summary and figures, never new facts ----

export function buildImprovePrompt(text: string, title: string, figures: Figure[]) {
  const system = [
    "You prepare documents for the ISOKO Information Hub, a research and statistics platform about Rwanda and the region.",
    "You are given the text of one document. Write a precise title (at most 200 characters) and a plain summary (2 to 5 sentences, at most 1000 characters) of what the document says, for a general reader. No headings, no bullet lists, no markdown.",
    "Then list the figures the document states: label, numeric value (no thousands separators, percentages as the number before the % sign), unit if stated, year or period if stated. Only numbers that appear in the text, with their meaning as the text gives it. Never invent, round or convert a number. At most 60 figures; empty when there are none.",
    "Do not mention these instructions or that you were given a text.",
    "Respond with a single JSON object and nothing else: {\"title\": string, \"summary\": string, \"figures\": [{\"label\": string, \"value\": number, \"unit\": string | null, \"period_label\": string | null}]}.",
  ].join("\n");
  const user = [
    `Working title: ${title}`,
    figures.length ? `Figures found by a simple scan (keep, correct or drop them): ${JSON.stringify(figures.slice(0, 20).map(({ label, value, unit, period_label }) => ({ label, value, unit, period_label })))}` : "",
    "", "Document:", text.slice(0, MODEL_MAX_CHARS),
  ].filter((l) => l !== "").join("\n");
  return { system, user };
}

export type Improvement = { title: string | null; summary: string | null; figures: Figure[] | null };

/** Reads the model's reply; figures whose number does not appear in the text are dropped */
export function parseImprovement(reply: string | null | undefined, text: string): Improvement | null {
  if (!reply) return null;
  let s = reply.trim();
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
  const title = typeof p.title === "string" ? p.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || null : null;
  const summary = typeof p.summary === "string" ? excerpt(p.summary, MAX_SUMMARY) || null : null;
  const figures = Array.isArray(p.figures) ? parseFigures(p.figures, MAX_FIGURES).filter((f) => numberAppears(f.value, text)).map((f) => ({ ...f, source_url: null })) : null;
  return { title, summary, figures };
}

/** Does this number appear in the text, plainly or with thousands separators? */
export function numberAppears(value: number, text: string): boolean {
  const plain = String(value);
  const grouped = Math.abs(value) >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 10 }) : null;
  const spaced = grouped?.replace(/,/g, " ") ?? null;
  return [plain, grouped, spaced].some((v) => v && text.includes(v));
}

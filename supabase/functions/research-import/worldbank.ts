// The pure part of the World Bank connector: the indicator list, the request
// addresses, how the API's JSON becomes a yearly series, and what each item,
// its statistics and its source look like. No Deno, no network, no database.
import { isoDate, slugify } from "../research-ask/engine.ts";

export type Indicator = { code: string; title: string; unit: string; topic: string };

/** World Development Indicators ISOKO keeps, with the topic each one files under */
export const INDICATORS: Indicator[] = [
  { code: "SP.POP.TOTL", title: "Population, total", unit: "people", topic: "population" },
  { code: "SP.POP.GROW", title: "Population growth (annual %)", unit: "%", topic: "population" },
  { code: "NY.GDP.MKTP.CD", title: "GDP (current US$)", unit: "USD", topic: "economy" },
  { code: "NY.GDP.PCAP.CD", title: "GDP per capita (current US$)", unit: "USD", topic: "economy" },
  { code: "NY.GDP.MKTP.KD.ZG", title: "GDP growth (annual %)", unit: "%", topic: "economy" },
  { code: "FP.CPI.TOTL.ZG", title: "Inflation, consumer prices (annual %)", unit: "%", topic: "economy" },
  { code: "SL.UEM.TOTL.ZS", title: "Unemployment (% of labour force)", unit: "%", topic: "employment" },
  { code: "ST.INT.ARVL", title: "International tourist arrivals", unit: "people", topic: "tourism" },
  { code: "SP.DYN.LE00.IN", title: "Life expectancy at birth (years)", unit: "years", topic: "health" },
  { code: "SE.PRM.ENRR", title: "School enrolment, primary (% gross)", unit: "%", topic: "education" },
  { code: "SE.SEC.ENRR", title: "School enrolment, secondary (% gross)", unit: "%", topic: "education" },
  { code: "IT.NET.USER.ZS", title: "Individuals using the Internet (% of population)", unit: "%", topic: "technology" },
  { code: "EG.ELC.ACCS.ZS", title: "Access to electricity (% of population)", unit: "%", topic: "infrastructure" },
  { code: "AG.LND.AGRI.ZS", title: "Agricultural land (% of land area)", unit: "%", topic: "agriculture" },
  { code: "SP.URB.TOTL.IN.ZS", title: "Urban population (% of total)", unit: "%", topic: "housing" },
];

export const FIRST_YEAR = 1990;
export const TIMEOUT_MS = 8_000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const SOURCE_NAME = "World Bank, World Development Indicators";

export type Country = { id: string; code: string; name: string; slug: string };
export type Point = { year: number; value: number };

export const apiUrl = (code: string, iso2: string, currentYear: number) =>
  `https://api.worldbank.org/v2/country/${iso2}/indicator/${code}?format=json&per_page=100&date=${FIRST_YEAR}:${currentYear}`;

export const pageUrl = (code: string, iso2: string) => `https://data.worldbank.org/indicator/${code}?locations=${iso2}`;

export const importKey = (iso2: string, code: string) => `worldbank:${iso2}:${code}`;

/** "GDP (current US$)" -> "gdp-current-us" */
export const indicatorSlug = (indicator: Indicator) => slugify(indicator.title, 80);

export function itemSlug(country: Country, indicator: Indicator): string {
  return `${slugify(country.slug, 40)}-${indicatorSlug(indicator)}`.slice(0, 120).replace(/-+$/g, "");
}

/** "Population, total — Rwanda" */
export const itemTitle = (country: Country, indicator: Indicator) => `${indicator.title} — ${country.name}`.slice(0, 200);

/** What is wrong with the request body, or the tidied input */
export function validateBody(body: unknown): { country: string | null; indicators: Indicator[] } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let country: string | null = null;
  if (b.country != null && b.country !== "") {
    if (typeof b.country !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.country) || b.country.length > 60) return { error: "country must be a country slug" };
    country = b.country;
  }
  let indicators = INDICATORS;
  if (b.indicators != null) {
    if (!Array.isArray(b.indicators) || b.indicators.length === 0 || b.indicators.length > INDICATORS.length) return { error: "indicators must be a list of indicator codes" };
    const codes = new Set<string>();
    for (const c of b.indicators) {
      if (typeof c !== "string" || !INDICATORS.some((i) => i.code === c)) return { error: `unknown indicator ${JSON.stringify(c)}` };
      codes.add(c);
    }
    indicators = INDICATORS.filter((i) => codes.has(i.code));
  }
  return { country, indicators };
}

/**
 * The API answers [meta, rows] where each row has {date: "2023", value: 123 | null}.
 * Rows without a value are skipped; an error document ([{message: [...]}]) is reported.
 */
export function parseSeries(json: unknown): { points: Point[]; updated: string | null } | { error: string } {
  if (!Array.isArray(json) || json.length === 0) return { error: "unexpected reply" };
  const meta = json[0] as Record<string, unknown> | null;
  if (meta && Array.isArray(meta.message)) {
    const first = (meta.message[0] ?? {}) as Record<string, unknown>;
    return { error: String(first.value ?? first.key ?? "the World Bank reported an error") };
  }
  const rows = Array.isArray(json[1]) ? json[1] : [];
  const points: Point[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const year = Number(String(r.date ?? "").trim());
    const value = typeof r.value === "number" ? r.value : typeof r.value === "string" && r.value.trim() !== "" ? Number(r.value) : null;
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || value === null || !Number.isFinite(value)) continue;
    points.push({ year, value });
  }
  points.sort((a, b) => a.year - b.year);
  const updated = meta && typeof meta.lastupdated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.lastupdated) ? meta.lastupdated : null;
  return { points, updated };
}

/** A fixed five-year series per indicator, for local runs (RESEARCH_MOCK=1) */
export function mockSeries(code: string): Point[] {
  const seed = Array.from(code).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7);
  return [2019, 2020, 2021, 2022, 2023].map((year, i) => ({ year, value: Math.round((seed + i * (seed % 17 + 1)) * 100) / 100 }));
}

/** Words of the indicator title worth searching for, plus the country */
export function keywordsFor(indicator: Indicator, country: Country): string[] {
  const stop = new Set(["total", "annual", "current", "gross", "the", "of", "per", "and"]);
  const words = indicator.title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !stop.has(w));
  return Array.from(new Set([...words, country.name.toLowerCase()])).slice(0, 10);
}

export type ItemRow = {
  import_key: string;
  slug: string;
  kind: "statistic";
  title: string;
  summary: string;
  country_id: string;
  topic_id: string | null;
  origin: "external";
  source_name: string;
  source_url: string;
  verification: "unverified";
  status: "published";
  import_source: "worldbank";
  imported_at: string;
  period_start: string | null;
  period_end: string | null;
  published_on: string;
  keywords: string[];
  tags: string[];
  created_by: null;
};

export function buildItem(input: { country: Country; indicator: Indicator; points: Point[]; updated: string | null; topicId: string | null; now?: Date }): ItemRow {
  const { country, indicator, points } = input;
  const now = input.now ?? new Date();
  const first = points[0]?.year ?? null;
  const last = points[points.length - 1]?.year ?? null;
  const span = first !== null && last !== null ? (first === last ? `${first}` : `${first}–${last}`) : "no years with a value yet";
  const note = input.updated ? `last updated by the World Bank on ${input.updated}` : `retrieved on ${isoDate(now)}`;
  return {
    import_key: importKey(country.code, indicator.code),
    slug: itemSlug(country, indicator),
    kind: "statistic",
    title: itemTitle(country, indicator),
    summary: `World Bank World Development Indicators for ${country.name}: ${indicator.title}, ${span}. Values as published by the World Bank; ${note}.`.slice(0, 1000),
    country_id: country.id,
    topic_id: input.topicId,
    origin: "external",
    source_name: SOURCE_NAME,
    source_url: pageUrl(indicator.code, country.code),
    verification: "unverified",
    status: "published",
    import_source: "worldbank",
    imported_at: now.toISOString(),
    period_start: first !== null ? `${first}-01-01` : null,
    period_end: last !== null ? `${last}-12-31` : null,
    published_on: isoDate(now),
    keywords: keywordsFor(indicator, country),
    tags: ["world-bank"],
    created_by: null,
  };
}

/** The columns an existing item gets on a repeat import (an analyst's status and verification stay) */
export function updateColumns(row: ItemRow, titleToo: boolean) {
  const base = { summary: row.summary, period_start: row.period_start, period_end: row.period_end, imported_at: row.imported_at, updated_at: row.imported_at };
  return titleToo ? { ...base, title: row.title } : base;
}

export function statsRows(itemId: string, indicator: Indicator, points: Point[], country: Country) {
  const url = pageUrl(indicator.code, country.code);
  return points.map((p, i) => ({
    item_id: itemId, label: indicator.title.slice(0, 120), value: p.value, unit: indicator.unit, period_label: String(p.year), period_date: `${p.year}-01-01`,
    series: indicator.code, source_url: url, sort: i,
  }));
}

export function sourceRow(itemId: string, indicator: Indicator, country: Country, now: Date) {
  return {
    item_id: itemId, title: "World Development Indicators", url: pageUrl(indicator.code, country.code), publisher: "World Bank",
    source_type: "international_org" as const, retrieved_at: now.toISOString(), sort: 0,
  };
}

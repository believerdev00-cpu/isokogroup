// The World Bank connector for the ISOKO Information Hub: POST /functions/v1/research-import
//
// For every active country and each indicator ISOKO keeps, the World Development
// Indicators API is read (one request at a time, 8 seconds each) and one
// published statistic item per country and indicator is created or refreshed,
// with its yearly series, its source and an import record. Items keep what an
// analyst changed: a repeat run updates the summary, period and dates, and the
// title only while the item was never verified.
//
//   Callers: the weekly cron with the service-role key, or a signed-in member
//   of the data staff (the "Import now" button). Anyone else gets 401/403.
//   POST { country?: slug, indicators?: [codes] }  (defaults: every active country, every indicator)
//   -> 200 { runs: [{ country, created, updated, failed }], total_created, total_updated }
//
// With RESEARCH_MOCK=1 (local only) a fixed five-year series replaces the API.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mocksAllowed } from "../_shared/environment.ts";
import { corsFor, identifyCaller } from "../_shared/research-staff.ts";
import {
  apiUrl, buildItem, type Country, type Indicator, MAX_CONSECUTIVE_FAILURES, mockSeries, parseSeries, type Point, sourceRow, statsRows, TIMEOUT_MS,
  updateColumns, validateBody,
} from "./worldbank.ts";

const env = Deno.env;
const admin = createClient(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MOCK = env.get("RESEARCH_MOCK") === "1" && mocksAllowed(env);

const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(env, req), "Content-Type": "application/json" } });

/** One indicator's yearly series for a country, from the API or the mock */
async function fetchSeries(country: Country, indicator: Indicator): Promise<{ points: Point[]; updated: string | null }> {
  if (MOCK) return { points: mockSeries(indicator.code), updated: null };
  const res = await fetch(apiUrl(indicator.code, country.code, new Date().getUTCFullYear()), {
    headers: { Accept: "application/json", "User-Agent": "ISOKO Information Hub (research-import)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`the World Bank answered ${res.status}`);
  const parsed = parseSeries(await res.json());
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

/** Creates or refreshes the item, replaces its series, keeps one source row. Returns whether it was new. */
async function storeIndicator(country: Country, indicator: Indicator, series: { points: Point[]; updated: string | null }, topicId: string | null): Promise<"created" | "updated"> {
  const now = new Date();
  const row = buildItem({ country, indicator, points: series.points, updated: series.updated, topicId, now });
  const { data: existing, error: findError } = await admin.from("research_items").select("id, verification").eq("import_key", row.import_key).maybeSingle();
  if (findError) throw new Error(`lookup failed: ${findError.message}`);
  let id: string;
  let outcome: "created" | "updated";
  if (existing) {
    const { error } = await admin.from("research_items").update(updateColumns(row, existing.verification !== "verified")).eq("id", existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
    id = existing.id;
    outcome = "updated";
  } else {
    const { data, error } = await admin.from("research_items").insert(row).select("id").single();
    if (error || !data) throw new Error(`insert failed: ${error?.message ?? "no row"}`);
    id = data.id;
    outcome = "created";
  }
  if (series.points.length) {
    const { error: delError } = await admin.from("research_stats").delete().eq("item_id", id).eq("series", indicator.code);
    if (delError) throw new Error(`could not clear the series: ${delError.message}`);
    const { error: insError } = await admin.from("research_stats").insert(statsRows(id, indicator, series.points, country));
    if (insError) throw new Error(`could not store the series: ${insError.message}`);
  }
  const source = sourceRow(id, indicator, country, now);
  const { data: existingSource } = await admin.from("research_sources").select("id").eq("item_id", id).eq("url", source.url).maybeSingle();
  if (existingSource) await admin.from("research_sources").update({ retrieved_at: source.retrieved_at, publisher: source.publisher, title: source.title }).eq("id", existingSource.id);
  else await admin.from("research_sources").insert(source);
  return outcome;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(env, req) });
  if (req.method !== "POST") return reply(req, 405, { error: "Method not allowed" });

  const caller = await identifyCaller(env, req, true);
  if (caller.kind === "none") return reply(req, caller.status, { error: caller.error });
  const triggeredBy = caller.kind === "staff" ? caller.userId : null;

  let body: unknown = {};
  const raw = await req.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(req, 400, { error: "Send a JSON object" });
    }
  }
  const input = validateBody(body);
  if ("error" in input) return reply(req, 400, { error: input.error });

  const countryQuery = admin.from("research_countries").select("id, code, name, slug, is_active").order("sort").order("name");
  const { data: countryRows, error: countryError } = input.country ? await countryQuery.eq("slug", input.country) : await countryQuery.eq("is_active", true);
  if (countryError) {
    console.error(`research-import: could not list countries: ${countryError.message}`);
    return reply(req, 500, { error: "The import could not start right now" });
  }
  const countries = ((countryRows ?? []) as (Country & { is_active: boolean })[]).filter((c) => /^[A-Z]{2}$/.test(c.code));
  if (input.country && countries.length === 0) return reply(req, 400, { error: "Unknown country" });

  const { data: topics } = await admin.from("research_topics").select("id, slug");
  const topicId = new Map(((topics ?? []) as { id: string; slug: string }[]).map((t) => [t.slug, t.id]));

  const runs: { country: string; created: number; updated: number; failed: number }[] = [];
  let consecutiveFailures = 0;
  let stopped = false;
  for (const country of countries) {
    const started = new Date();
    const run = { country: country.slug, created: 0, updated: 0, failed: 0 };
    let lastError: string | null = null;
    for (const indicator of input.indicators) {
      if (stopped) {
        run.failed += 1;
        continue;
      }
      try {
        const series = await fetchSeries(country, indicator);
        const outcome = await storeIndicator(country, indicator, series, topicId.get(indicator.topic) ?? null);
        run[outcome] += 1;
        consecutiveFailures = 0;
      } catch (e) {
        run.failed += 1;
        consecutiveFailures += 1;
        lastError = `${indicator.code}: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`research-import: ${country.code} ${lastError}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopped = true;
          lastError = `stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row (${lastError})`;
        }
      }
    }
    runs.push(run);
    const { error: logError } = await admin.from("research_imports").insert({
      source: "worldbank", country_id: country.id, started_at: started.toISOString(), finished_at: new Date().toISOString(),
      status: run.failed && run.created + run.updated === 0 ? "failed" : "done", created_items: run.created, updated_items: run.updated,
      error: run.failed ? (lastError ?? `${run.failed} indicators failed`).slice(0, 2000) : null, triggered_by: triggeredBy,
    });
    if (logError) console.error(`research-import: could not record the run: ${logError.message}`);
  }

  return reply(req, 200, {
    runs, total_created: runs.reduce((n, r) => n + r.created, 0), total_updated: runs.reduce((n, r) => n + r.updated, 0),
  });
});

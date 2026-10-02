// End-to-end check of how the Information Hub fills itself, against a local
// Supabase with the research hub and research feeds migrations applied, in
// mock mode (no model key, no search key, no World Bank call):
//
//   RESEARCH_MOCK=1 supabase functions serve research-ask research-ingest research-import
//   node supabase/tests/research-feeds.e2e.mjs
//
// Override ASK_URL / INGEST_URL / IMPORT_URL / SUPABASE_URL for a throwaway
// edge runtime. Refuses to run against anything but 127.0.0.1 / localhost.
//
// It creates two local accounts (a data analyst and a plain user), signs them
// in for their JWTs, and removes everything it created: the accounts, the
// question draft, the ingested item and its file, every World Bank item
// (import_source = 'worldbank', local database only) and the import log rows
// written while it ran.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ASK = process.env.ASK_URL ?? `${URL}/functions/v1/research-ask`;
const INGEST = process.env.INGEST_URL ?? `${URL}/functions/v1/research-ingest`;
const IMPORT = process.env.IMPORT_URL ?? `${URL}/functions/v1/research-import`;
for (const u of [URL, ASK, INGEST, IMPORT]) if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error(`Refusing to run against ${u}`);
// The public demo keys of every local Supabase
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Math.random().toString(36).slice(2, 8);
const startedAt = new Date().toISOString();
const today = startedAt.slice(0, 10);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const ip = `10.98.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const call = async (url, body, token) => {
  const headers = { "Content-Type": "application/json", apikey: ANON, "x-forwarded-for": ip };
  if (token !== null) headers.Authorization = `Bearer ${token ?? ANON}`;
  const res = await fetch(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// ---- two local accounts: a data analyst and a plain user ----
const PASSWORD = `E2e-pass-${run}-Aa1`;
const makeUser = async (label, role) => {
  const email = `rf-${label}-${run}@test.local`;
  const user = must(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `Feeds ${label}` } }), `create ${label}`).user;
  if (role) must(await admin.from("user_roles").insert({ user_id: user.id, role }), `role ${label}`);
  const session = must(await createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email, password: PASSWORD }), `sign in ${label}`).session;
  return { id: user.id, token: session.access_token };
};
const analyst = await makeUser("analyst", "data_analyst");
const plain = await makeUser("plain", null);

const rwanda = must(await admin.from("research_countries").upsert({ code: "RW", name: "Rwanda", slug: "rwanda", is_active: true }, { onConflict: "slug" }).select("id").single(), "country");
const populationTopic = (await admin.from("research_topics").select("id").eq("slug", "population").maybeSingle()).data;

const created = { items: [], paths: [], hashes: [] };
const cleanup = async () => {
  await admin.from("research_items").delete().eq("import_source", "question").ilike("title", `%${run}%`);
  if (created.items.length) await admin.from("research_items").delete().in("id", created.items);
  await admin.from("research_items").delete().eq("import_source", "worldbank");
  await admin.from("research_imports").delete().gte("started_at", startedAt);
  if (created.paths.length) await admin.storage.from("research").remove(created.paths);
  await admin.from("research_questions").delete().ilike("question", `%${run}%`);
  if (created.hashes.length) await admin.from("research_answers").delete().in("question_hash", created.hashes);
  await admin.from("research_ask_log").delete().eq("key_hash", sha(`ip:${ip}`));
  await admin.auth.admin.deleteUser(analyst.id);
  await admin.auth.admin.deleteUser(plain.id);
};

try {
  // ================= 1. the review queue: an outside answer becomes one draft =================
  const question = `What is the volcano tourism revenue ${run}?`;
  let r = await call(ASK, { question });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, "external");
  assert.equal(r.body.cached, false);
  assert.ok(r.body.answer.includes("Mock answer"));
  assert.deepEqual(Object.keys(r.body).sort(), ["ai", "answer", "cached", "conflicts", "items", "mode", "sources"], "the public response shape is unchanged");
  const answerRow = must(await admin.from("research_answers").select("question_hash").eq("question", question).single(), "answer row");
  created.hashes.push(answerRow.question_hash);
  ok("an outside (mock) answer: mode external, public response unchanged");

  const drafts = () => admin.from("research_items").select("id, slug, kind, title, summary, body, status, origin, verification, import_source, review_hash, review_note, keywords, country_id, created_by").eq("import_source", "question").ilike("title", `%${run}%`);
  let found = must(await drafts(), "drafts");
  assert.equal(found.length, 1, "exactly one draft");
  const draft = found[0];
  assert.equal(draft.kind, "finding");
  assert.equal(draft.status, "draft");
  assert.equal(draft.origin, "external");
  assert.equal(draft.verification, "unverified");
  assert.equal(draft.review_hash, answerRow.question_hash, "keyed by the question hash");
  assert.equal(draft.title, `What is the volcano tourism revenue ${run}`);
  assert.equal(draft.slug, `what-is-the-volcano-tourism-revenue-${run}-${answerRow.question_hash.slice(0, 8)}`);
  assert.equal(draft.summary, r.body.answer);
  assert.equal(draft.body, r.body.answer);
  assert.equal(draft.review_note, `Written by the answer engine from outside sources on ${today}. Check the figures against the sources before publishing.`);
  assert.ok(draft.keywords.includes("volcano") && draft.keywords.includes("tourism"));
  assert.equal(draft.country_id, null);
  assert.equal(draft.created_by, null);
  ok("the draft: finding, draft, external, unverified, keyed by the question hash, with a review note and keywords");

  const sources = must(await admin.from("research_sources").select("title, url, publisher, source_type, sort").eq("item_id", draft.id).order("sort"), "draft sources");
  assert.deepEqual(sources.map((s) => s.url), ["https://statistics.example.org/bulletin", "https://university.example.org/research"]);
  assert.ok(sources.every((s) => s.source_type === "other" && s.publisher));
  const stats = must(await admin.from("research_stats").select("label, value, unit, period_label, period_date, source_url").eq("item_id", draft.id), "draft stats");
  assert.deepEqual(stats, [{ label: "Reported value", value: 42, unit: null, period_label: "2024", period_date: "2024-01-01", source_url: "https://statistics.example.org/bulletin" }]);
  ok("the draft carries the two outside sources and the one mock figure");

  r = await call(ASK, { question });
  assert.equal(r.body.cached, true);
  found = must(await drafts(), "drafts after cache");
  assert.equal(found.length, 1, "a cached repeat creates no second draft");
  must(await admin.from("research_items").update({ title: `Edited by an analyst ${run}` }).eq("id", draft.id), "edit");
  must(await admin.from("research_answers").delete().eq("question_hash", answerRow.question_hash), "expire cache");
  r = await call(ASK, { question });
  assert.equal(r.body.cached, false);
  found = must(await drafts(), "drafts after re-ask");
  assert.equal(found.length, 1);
  assert.equal(found[0].title, `Edited by an analyst ${run}`, "the analyst's edit is kept");
  assert.equal(must(await admin.from("research_sources").select("id").eq("item_id", draft.id), "sources again").length, 2, "no duplicate sources");
  ok("a cached repeat and a fresh re-ask create no second draft and never overwrite the analyst's edits");

  // ================= 2. documents: a CSV uploaded by staff becomes a draft with figures =================
  const csvPath = `ingest/e2e-${run}.csv`;
  const csv = "Indicator,Value,Unit,Year\nPopulation,13246394,people,2022\nGrowth rate,2.3,%,2022\nNote,,,\n";
  must(await admin.storage.from("research").upload(csvPath, new Blob([csv], { type: "text/csv" }), { contentType: "text/csv" }), "upload csv");
  created.paths.push(csvPath);

  r = await call(INGEST, { path: csvPath }, plain.token);
  assert.equal(r.status, 403, JSON.stringify(r.body));
  r = await call(INGEST, { path: csvPath }, undefined);
  assert.equal(r.status, 401, JSON.stringify(r.body));
  r = await call(INGEST, { path: "other/x.csv" }, analyst.token);
  assert.equal(r.status, 400);
  r = await call(INGEST, { path: csvPath, kind: "poem" }, analyst.token);
  assert.equal(r.status, 400);
  r = await call(INGEST, { path: `ingest/missing-${run}.csv` }, analyst.token);
  assert.equal(r.status, 404, JSON.stringify(r.body));
  ok("ingest: a plain user gets 403, no user 401, bad input 400, a missing file 404");

  const title = `E2E census figures ${run}`;
  r = await call(INGEST, { path: csvPath, country: "rwanda", kind: "dataset", title }, analyst.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ["chars", "figures", "item_id", "slug", "title"]);
  assert.equal(r.body.title, title);
  assert.equal(r.body.figures, 2);
  assert.ok(r.body.chars > 40);
  created.items.push(r.body.item_id);
  const ingested = must(await admin.from("research_items").select("slug, kind, title, summary, body, status, origin, verification, import_source, review_note, country_id, created_by").eq("id", r.body.item_id).single(), "ingested item");
  assert.equal(ingested.slug, r.body.slug);
  assert.ok(ingested.slug.startsWith(`e2e-census-figures-${run}-`));
  assert.equal(ingested.kind, "dataset");
  assert.equal(ingested.status, "draft");
  assert.equal(ingested.origin, "isoko");
  assert.equal(ingested.verification, "unverified");
  assert.equal(ingested.import_source, "document");
  assert.equal(ingested.country_id, rwanda.id);
  assert.equal(ingested.created_by, analyst.id);
  assert.equal(ingested.review_note, `Extracted from e2e-${run}.csv on ${today}; check the text and figures.`);
  assert.ok(ingested.body.includes("Population: Value 13246394, Unit people, Year 2022"), ingested.body);
  assert.ok(ingested.summary.length > 0 && ingested.summary.length <= 1000);
  ok("ingest: the CSV became a draft dataset in Rwanda with the analyst as author and a review note");

  const figures = must(await admin.from("research_stats").select("label, value, unit, period_label, period_date, sort").eq("item_id", r.body.item_id).order("sort"), "ingested stats");
  assert.deepEqual(figures, [
    { label: "Population", value: 13246394, unit: "people", period_label: "2022", period_date: "2022-01-01", sort: 0 },
    { label: "Growth rate", value: 2.3, unit: "%", period_label: "2022", period_date: "2022-01-01", sort: 1 },
  ]);
  const docs = must(await admin.from("research_documents").select("name, path, size, mime, created_by").eq("item_id", r.body.item_id), "documents");
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, `e2e-${run}.csv`);
  assert.equal(docs[0].path, `${r.body.item_id}/e2e-${run}.csv`, "the file was moved under the item");
  assert.equal(docs[0].size, csv.length);
  assert.equal(docs[0].created_by, analyst.id);
  created.paths.push(docs[0].path);
  const moved = must(await admin.storage.from("research").list(r.body.item_id), "list item folder");
  assert.ok(moved.some((f) => f.name === `e2e-${run}.csv`), "the object exists under the item folder");
  const docImports = must(await admin.from("research_imports").select("source, country_id, status, created_items, updated_items, error, triggered_by, finished_at").eq("source", "document").gte("started_at", startedAt), "document imports");
  assert.equal(docImports.length, 1);
  assert.deepEqual(docImports[0], { source: "document", country_id: rwanda.id, status: "done", created_items: 1, updated_items: 0, error: null, triggered_by: analyst.id, finished_at: docImports[0].finished_at });
  assert.ok(docImports[0].finished_at);
  ok("ingest: two figures, the document attached under the item, one import record");

  const emptyPath = `ingest/empty-${run}.txt`;
  must(await admin.storage.from("research").upload(emptyPath, new Blob(["   \n\n"], { type: "text/plain" }), { contentType: "text/plain" }), "upload empty");
  created.paths.push(emptyPath);
  r = await call(INGEST, { path: emptyPath }, analyst.token);
  assert.equal(r.status, 422, JSON.stringify(r.body));
  const stillThere = must(await admin.storage.from("research").list("ingest"), "list ingest");
  assert.ok(stillThere.some((f) => f.name === `empty-${run}.txt`), "the file is kept");
  const emptyItems = must(await admin.from("research_items").select("id").eq("import_source", "document").gte("created_at", startedAt), "document items");
  assert.equal(emptyItems.length, 1, "no item was created for the empty file");
  ok("ingest: a file without text answers 422, keeps the file and creates nothing");

  // ================= 3. the World Bank connector (mock series) =================
  r = await call(IMPORT, {}, null);
  assert.equal(r.status, 401, JSON.stringify(r.body));
  r = await call(IMPORT, {}, undefined);
  assert.equal(r.status, 401, JSON.stringify(r.body));
  r = await call(IMPORT, {}, plain.token);
  assert.equal(r.status, 403, JSON.stringify(r.body));
  r = await call(IMPORT, { indicators: ["XX.YY"] }, SERVICE);
  assert.equal(r.status, 400);
  r = await call(IMPORT, { country: "atlantis" }, SERVICE);
  assert.equal(r.status, 400);
  ok("import: no token or the anon key 401, a plain user 403, bad input 400");

  r = await call(IMPORT, {}, SERVICE);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body.runs) && r.body.runs.length >= 1);
  const rw = r.body.runs.find((x) => x.country === "rwanda");
  assert.ok(rw, "Rwanda was imported");
  assert.equal(rw.failed, 0);
  assert.equal(rw.created + rw.updated, 15);
  assert.equal(r.body.total_created + r.body.total_updated, 15 * r.body.runs.length);
  assert.ok(r.body.runs.every((x) => x.failed === 0 && x.created + x.updated === 15));
  ok(`import with the service key: ${r.body.runs.length} active countr${r.body.runs.length === 1 ? "y" : "ies"}, 15 indicators each, none failed`);

  const wb = () => admin.from("research_items").select("id, slug, title, kind, status, origin, verification, source_name, source_url, import_key, import_source, imported_at, period_start, period_end, published_on, topic_id, tags, keywords, country_id").like("import_key", "worldbank:RW:%").order("slug");
  let items = must(await wb(), "world bank items");
  assert.equal(items.length, 15);
  const pop = items.find((i) => i.import_key === "worldbank:RW:SP.POP.TOTL");
  assert.ok(pop);
  assert.equal(pop.slug, "rwanda-population-total");
  assert.equal(pop.title, "Population, total — Rwanda");
  assert.equal(pop.kind, "statistic");
  assert.equal(pop.status, "published");
  assert.equal(pop.origin, "external");
  assert.equal(pop.verification, "unverified");
  assert.equal(pop.source_name, "World Bank, World Development Indicators");
  assert.equal(pop.source_url, "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW");
  assert.equal(pop.import_source, "worldbank");
  assert.equal(pop.period_start, "2019-01-01");
  assert.equal(pop.period_end, "2023-12-31");
  assert.equal(pop.published_on, today);
  assert.equal(pop.country_id, rwanda.id);
  assert.deepEqual(pop.tags, ["world-bank"]);
  assert.deepEqual(pop.keywords, ["population", "rwanda"]);
  if (populationTopic) assert.equal(pop.topic_id, populationTopic.id, "filed under the population topic");
  const series = must(await admin.from("research_stats").select("label, value, unit, period_label, period_date, series, source_url, sort").eq("item_id", pop.id).order("sort"), "series");
  assert.equal(series.length, 5);
  assert.deepEqual(series.map((s) => s.period_label), ["2019", "2020", "2021", "2022", "2023"]);
  assert.ok(series.every((s) => s.series === "SP.POP.TOTL" && s.unit === "people" && s.label === "Population, total" && s.source_url === pop.source_url && s.period_date === `${s.period_label}-01-01`));
  const wbSources = must(await admin.from("research_sources").select("title, url, publisher, source_type").eq("item_id", pop.id), "wb sources");
  assert.deepEqual(wbSources, [{ title: "World Development Indicators", url: pop.source_url, publisher: "World Bank", source_type: "international_org" }]);
  ok("import: published statistic items with a five-year series, the World Bank as source, filed by topic");

  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const hits = must(await anon.rpc("research_search", { p_query: "population total rwanda", p_country: "rwanda", p_limit: 10, p_offset: 0 }), "public search");
  assert.ok(hits.some((h) => h.slug === "rwanda-population-total"), "visitors find the imported statistic");
  ok("import: the imported statistic is public");

  // an analyst's edits survive a repeat run; the connector's own columns are refreshed
  const gdp = items.find((i) => i.import_key === "worldbank:RW:NY.GDP.MKTP.CD");
  const infl = items.find((i) => i.import_key === "worldbank:RW:FP.CPI.TOTL.ZG");
  must(await admin.from("research_items").update({ title: `Checked GDP ${run}`, verification: "verified" }).eq("id", gdp.id), "verify gdp");
  must(await admin.from("research_items").update({ status: "archived", title: `Renamed inflation ${run}` }).eq("id", infl.id), "archive inflation");
  r = await call(IMPORT, { country: "rwanda" }, analyst.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { runs: [{ country: "rwanda", created: 0, updated: 15, failed: 0 }], total_created: 0, total_updated: 15 });
  items = must(await wb(), "world bank items again");
  assert.equal(items.length, 15, "a repeat run creates no duplicates");
  assert.equal(items.find((i) => i.id === gdp.id).title, `Checked GDP ${run}`, "a verified item's title is kept");
  assert.equal(items.find((i) => i.id === gdp.id).verification, "verified");
  assert.equal(items.find((i) => i.id === infl.id).status, "archived", "an archived item stays archived");
  assert.equal(items.find((i) => i.id === infl.id).title, "Inflation, consumer prices (annual %) — Rwanda", "an unverified item's title is refreshed");
  assert.ok(new Date(items.find((i) => i.id === pop.id).imported_at) > new Date(pop.imported_at), "imported_at moved forward");
  assert.equal(must(await admin.from("research_stats").select("id").eq("item_id", pop.id), "series again").length, 5, "the series is replaced, not duplicated");
  assert.equal(must(await admin.from("research_sources").select("id").eq("item_id", pop.id), "wb sources again").length, 1, "one source row");
  const wbImports = must(await admin.from("research_imports").select("country_id, status, created_items, updated_items, error, triggered_by").eq("source", "worldbank").gte("started_at", startedAt).order("started_at"), "wb imports");
  assert.ok(wbImports.length >= 2);
  const rwImports = wbImports.filter((i) => i.country_id === rwanda.id);
  assert.deepEqual(rwImports.map((i) => [i.status, i.created_items, i.updated_items, i.error, i.triggered_by]), [["done", rw.created, rw.updated, null, null], ["done", 0, 15, null, analyst.id]]);
  ok("import: a staff-triggered repeat run updates everything, keeps the analyst's edits, logs both runs");

  console.log(`\nresearch-feeds e2e: ${passed} checks passed`);
} finally {
  await cleanup();
}

// End-to-end check of the research-ask and research-sitemap Edge Functions
// against a local Supabase with the research hub migration applied, in mock
// mode (no model key, no search key):
//
//   RESEARCH_MOCK=1 supabase functions serve research-ask research-sitemap
//   node supabase/tests/research-ask.e2e.mjs
//
// Override ASK_URL / SITEMAP_URL / SUPABASE_URL for a throwaway edge runtime.
// Refuses to run against anything but 127.0.0.1 / localhost. Seeds one
// published item in Rwanda and removes everything it created.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ASK = process.env.ASK_URL ?? `${URL}/functions/v1/research-ask`;
const SITEMAP = process.env.SITEMAP_URL ?? `${URL}/functions/v1/research-sitemap`;
for (const u of [URL, ASK, SITEMAP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error(`Refusing to run against ${u}`);
// The public demo keys of every local Supabase
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Math.random().toString(36).slice(2, 8);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const ip = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const ask = async (body, headers = {}) => {
  const res = await fetch(ASK, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}`, "x-forwarded-for": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};

// ---- seed: Rwanda, a topic, one published item with a long body and a source ----
const country = must(await admin.from("research_countries").upsert({ code: "RW", name: "Rwanda", slug: "rwanda", is_active: true }, { onConflict: "slug" }).select("id, slug").single(), "country");
const topic = must(await admin.from("research_topics").upsert({ slug: `e2e-topic-${run}`, name: `E2E topic ${run}` }, { onConflict: "slug" }).select("id").single(), "topic");
const slug = `e2e-coffee-exports-${run}`;
const item = must(await admin.from("research_items").insert({
  slug, kind: "statistic", title: `Coffee exports of Rwanda ${run}`, summary: "How much coffee Rwanda exported, by year.",
  body: ("Rwanda exported coffee worth a growing amount each year according to the mock figures used in this test. " +
    "The figures cover the calendar years and are given in United States dollars at the exchange rate of each year. ").repeat(3),
  country_id: country.id, topic_id: topic.id, published_on: "2024-06-01", origin: "isoko", verification: "verified", status: "published",
  keywords: ["coffee", "exports"], is_demo: true,
}).select("id").single(), "item");
must(await admin.from("research_sources").insert({ item_id: item.id, title: "Coffee export bulletin", url: "https://statistics.example.org/coffee", publisher: "NAEB", source_type: "other" }), "source");
const question = `How much coffee does Rwanda export ${run}?`;
const hashes = [];
const cleanup = async () => {
  await admin.from("research_items").delete().eq("id", item.id);
  await admin.from("research_topics").delete().eq("id", topic.id);
  await admin.from("research_questions").delete().ilike("question", `%${run}%`);
  if (hashes.length) await admin.from("research_answers").delete().in("question_hash", hashes);
  await admin.from("research_ask_log").delete().eq("key_hash", sha(`ip:${ip}`));
};

try {
  // ---- CORS and input ----
  const pre = await fetch(ASK, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
  assert.equal(pre.status, 204);
  assert.ok(pre.headers.get("access-control-allow-origin"));
  ok("OPTIONS answers 204 with CORS headers");

  assert.equal((await ask("not json")).status, 400);
  assert.equal((await ask({ question: "ab" })).status, 400);
  assert.equal((await ask({ question: "x".repeat(301) })).status, 400);
  assert.equal((await ask({ question: "Coffee?", country: "Rwanda!" })).status, 400);
  ok("bad input answers 400");

  // ---- a question the knowledge base can answer ----
  let r = await ask({ question, country: "rwanda" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cached, false);
  assert.equal(r.body.ai, true);
  assert.equal(r.body.mode, "kb");
  assert.ok(typeof r.body.answer === "string" && r.body.answer.includes("Mock answer"), "mock answer");
  assert.ok(r.body.items.some((i) => i.slug === slug), "the seeded item is returned");
  const found = r.body.items.find((i) => i.slug === slug);
  assert.deepEqual(Object.keys(found).sort(), ["country_name", "id", "kind", "published_on", "slug", "summary", "title", "topic_name", "verification"]);
  assert.equal(found.country_name, "Rwanda");
  assert.ok(r.body.sources.some((s) => s.url === "https://statistics.example.org/coffee" && s.publisher === "NAEB"), "the item's source is cited");
  assert.deepEqual(r.body.conflicts, []);
  ok("a question the knowledge base covers: mode kb, mock answer, items, sources");

  // ---- the cache ----
  r = await ask({ question: question.toUpperCase() + "  ", country: "rwanda" });
  assert.equal(r.status, 200);
  assert.equal(r.body.cached, true);
  assert.equal(r.body.mode, "kb");
  assert.ok(r.body.items.some((i) => i.slug === slug));
  assert.ok(r.body.answer.includes("Mock answer"));
  ok("the same question (any case, extra spaces) comes from the cache");

  const stored = must(await admin.from("research_answers").select("question_hash, mode, item_ids, sources, model, expires_at").eq("question", question).maybeSingle(), "stored answer");
  assert.ok(stored, "answer stored");
  hashes.push(stored.question_hash);
  assert.equal(stored.model, "mock");
  assert.ok(stored.item_ids.includes(item.id));
  assert.ok(stored.sources.every((s) => s.origin === "isoko"));
  assert.ok(new Date(stored.expires_at).getTime() > Date.now() + 23 * 3600_000);
  ok("the answer is stored with provenance and a 24h expiry");

  // ---- a question nothing in the knowledge base covers: outside (mock) ----
  const other = `What is the volcano tourism revenue ${run}?`;
  r = await ask({ question: other });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, "external");
  assert.equal(r.body.ai, true);
  assert.ok(r.body.answer.includes("Mock answer"));
  assert.ok(r.body.sources.some((s) => s.url.startsWith("https://statistics.example.org/")), "outside sources cited");
  assert.ok(!r.body.items.some((i) => i.slug === slug), "unrelated item not returned");
  const stored2 = must(await admin.from("research_answers").select("question_hash").eq("question", other).maybeSingle(), "stored 2");
  if (stored2) hashes.push(stored2.question_hash);
  ok("a question the knowledge base does not cover: mode external with mock outside sources");

  // ---- trending questions ----
  const trending = must(await admin.rpc("research_trending_questions", { p_limit: 50 }), "trending");
  assert.ok(trending.some((q) => q.question === question), "the answered question is trending");
  const counted = must(await admin.from("research_questions").select("ask_count").eq("question", question).single(), "question row");
  assert.equal(counted.ask_count, 1, "the cached repeat did not count twice");
  ok("the question feeds the trending list once");

  // ---- the rate limit ----
  const key = sha(`ip:${ip}`);
  const { count } = await admin.from("research_ask_log").select("id", { count: "exact", head: true }).eq("key_hash", key);
  assert.ok(count >= 2, "asks were logged by a hashed key");
  must(await admin.from("research_ask_log").insert(Array.from({ length: 30 - count }, () => ({ key_hash: key }))), "fill log");
  r = await ask({ question: `Yet another question ${run}?` });
  assert.equal(r.status, 429);
  assert.equal(r.body.error, "Too many questions. Try again in a few minutes.");
  assert.equal(r.headers.get("retry-after"), "600");
  const { data: notRecorded } = await admin.from("research_questions").select("id").ilike("question", `Yet another question ${run}%`);
  assert.equal((notRecorded ?? []).length, 0, "a rate-limited question is not recorded");
  ok("the 31st question in an hour answers 429 and is not recorded");

  // ---- the sitemap ----
  const sm = await fetch(SITEMAP);
  assert.equal(sm.status, 200);
  assert.match(sm.headers.get("content-type"), /application\/xml/);
  assert.equal(sm.headers.get("cache-control"), "public, max-age=3600");
  const xml = await sm.text();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes(`/research/${slug}</loc>`), "the published item is listed");
  assert.ok(xml.includes("/research/countries/rwanda</loc>"), "the country page is listed");
  assert.ok(xml.includes(`/research/topics/e2e-topic-${run}</loc>`), "the topic page is listed");
  must(await admin.from("research_items").update({ status: "draft" }).eq("id", item.id), "unpublish");
  const xml2 = await (await fetch(SITEMAP)).text();
  assert.ok(!xml2.includes(`/research/${slug}</loc>`), "a draft is not listed");
  ok("the sitemap lists public items, countries and topics, never drafts");

  console.log(`\nresearch-ask e2e: ${passed} checks passed`);
} finally {
  await cleanup();
}

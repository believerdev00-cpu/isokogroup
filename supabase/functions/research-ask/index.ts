// The ISOKO Information Hub's answer engine: POST /functions/v1/research-ask
//
// A visitor asks a question in plain words. The engine looks in ISOKO's own
// knowledge base first; when that is not enough it looks outside (a search
// provider configured as a secret), then has the model write one short answer
// from the material it was given, never from memory. The answer is cached for
// a day, every answer keeps its sources and any conflicting figures internally,
// and the question (never who asked) feeds the "trending questions" list.
//
// Without ANTHROPIC_API_KEY the matching items are returned and the answer is
// null (ai: false). With RESEARCH_MOCK=1, locally only, fake outside results
// and a deterministic answer let the e2e script run without any key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mocksAllowed } from "../_shared/environment.ts";
import {
  buildPrompt, CACHE_HOURS, decideMode, draftFromAnswer, isNotFound, isSufficient, KB_TOP, mockAnswer, parseModelReply, questionHash,
  RATE_LIMIT_PER_HOUR, sanitizeAnswer, sha256Hex, validateInput, type Conflict, type ExternalResult, type Figure, type KbItem, type KbMaterial, type Mode,
} from "./engine.ts";
import { searchExternal } from "./external.ts";
import { askModel, hasModelKey } from "./llm.ts";

const env = Deno.env;
const admin = createClient(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MOCK = env.get("RESEARCH_MOCK") === "1" && mocksAllowed(env);
const ORIGINS = (env.get("SITE_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ORIGINS.includes(origin) ? origin : mocksAllowed(env) ? "*" : (ORIGINS[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const reply = (req: Request, status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(req), "Content-Type": "application/json", ...extra } });

/** Who is asking, for the rate limit only: the signed-in user id, else the address. Hashed before it is stored. */
async function callerKey(req: Request): Promise<string> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "authenticated" && typeof payload.sub === "string") return sha256Hex(`user:${payload.sub}`);
  } catch {
    // no user token: fall through to the address
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  return sha256Hex(`ip:${ip}`);
}

async function rateLimited(key: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin.from("research_ask_log").select("id", { count: "exact", head: true }).eq("key_hash", key).gte("created_at", since);
  if (error) {
    console.error(`research-ask: rate limit check failed: ${error.message}`);
    return false; // a broken counter must not block everyone
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return true;
  await admin.from("research_ask_log").insert({ key_hash: key });
  return false;
}

type PublicItem = Pick<KbItem, "id" | "slug" | "kind" | "title" | "summary" | "country_name" | "topic_name" | "published_on" | "verification">;
const publicItem = (i: KbItem): PublicItem => ({
  id: i.id, slug: i.slug, kind: i.kind, title: i.title, summary: i.summary, country_name: i.country_name, topic_name: i.topic_name,
  published_on: i.published_on, verification: i.verification,
});

type Source = { title: string; url: string | null; publisher: string | null; origin: "isoko" | "external" };

/** The bodies and references of the top items, for the model and the sufficiency check */
async function material(items: KbItem[]): Promise<KbMaterial[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const [bodies, sources] = await Promise.all([
    admin.from("research_items").select("id, body").in("id", ids),
    admin.from("research_sources").select("item_id, title, url, publisher").in("item_id", ids).order("sort"),
  ]);
  const bodyOf = new Map((bodies.data ?? []).map((b: { id: string; body: string | null }) => [b.id, b.body]));
  const sourcesOf = new Map<string, KbMaterial["sources"]>();
  for (const s of (sources.data ?? []) as { item_id: string; title: string; url: string | null; publisher: string | null }[]) {
    sourcesOf.set(s.item_id, [...(sourcesOf.get(s.item_id) ?? []), { title: s.title, url: s.url, publisher: s.publisher }]);
  }
  return items.map((i) => ({ ...i, body: bodyOf.get(i.id) ?? null, sources: sourcesOf.get(i.id) ?? [] }));
}

/** Public items by id, for a cached answer (published or scheduled-and-due only) */
async function itemsByIds(ids: string[]): Promise<PublicItem[]> {
  if (ids.length === 0) return [];
  const { data } = await admin.from("research_items")
    .select("id, slug, kind, title, summary, published_on, verification, status, publish_at, country:research_countries(name), topic:research_topics!research_items_topic_id_fkey(name)")
    .in("id", ids);
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => r.status === "published" || (r.status === "scheduled" && r.publish_at && new Date(String(r.publish_at)).getTime() <= now))
    .map((r) => ({
      id: String(r.id), slug: String(r.slug), kind: String(r.kind), title: String(r.title), summary: (r.summary as string | null) ?? null,
      country_name: ((r.country as { name?: string } | null)?.name) ?? null, topic_name: ((r.topic as { name?: string } | null)?.name) ?? null,
      published_on: (r.published_on as string | null) ?? null, verification: String(r.verification),
    }));
}

async function countryName(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const { data } = await admin.from("research_countries").select("id, name").eq("slug", slug).maybeSingle();
  return data?.name ?? null;
}

async function countryId(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const { data } = await admin.from("research_countries").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

/**
 * The review queue: an answer written from outside sources becomes one draft
 * item (keyed by the question hash, never created twice, never overwriting an
 * analyst's edits) with the sources it used and the figures the model listed.
 * Failures are logged; the visitor's answer does not depend on this.
 */
async function queueForReview(input: { question: string; answer: string; countryId: string | null; reviewHash: string; sources: Source[]; figures: Figure[] }) {
  const draft = draftFromAnswer({
    ...input,
    sources: input.sources.filter((s) => s.origin === "external").map(({ title, url, publisher }) => ({ title, url, publisher })),
  });
  const { data, error } = await admin.from("research_items").upsert(draft.item, { onConflict: "review_hash", ignoreDuplicates: true }).select("id");
  if (error) {
    console.error(`research-ask: could not queue the answer for review: ${error.message}`);
    return;
  }
  const id = data?.[0]?.id as string | undefined;
  if (!id) return; // the draft already exists
  if (draft.sources.length) {
    const { error: sErr } = await admin.from("research_sources").insert(draft.sources.map((s) => ({ ...s, item_id: id })));
    if (sErr) console.error(`research-ask: could not store the draft's sources: ${sErr.message}`);
  }
  if (draft.stats.length) {
    const { error: fErr } = await admin.from("research_stats").insert(draft.stats.map((s) => ({ ...s, item_id: id })));
    if (fErr) console.error(`research-ask: could not store the draft's figures: ${fErr.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "Method not allowed" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: "Send a JSON object with a question" });
  }
  const input = validateInput(body);
  if ("error" in input) return reply(req, 400, { error: input.error });
  const { question, country } = input;

  const key = await callerKey(req);
  if (await rateLimited(key)) return reply(req, 429, { error: "Too many questions. Try again in a few minutes." }, { "Retry-After": "600" });

  // ---- the cache: the same question in the same country within a day ----
  const hash = await questionHash(question, country);
  const { data: cached } = await admin.from("research_answers").select("answer, mode, item_ids, sources, conflicts")
    .eq("question_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (cached) {
    const items = await itemsByIds((cached.item_ids as string[]) ?? []);
    const sources = ((cached.sources as Source[]) ?? []).map(({ title, url, publisher }) => ({ title, url, publisher }));
    const conflicts = ((cached.conflicts as Conflict[]) ?? []).map(({ topic, note }) => ({ topic, note }));
    return reply(req, 200, { answer: cached.answer, mode: cached.mode as Mode, items, sources, conflicts, cached: true, ai: cached.answer != null });
  }

  // ---- 1. ISOKO's own knowledge base ----
  const { data: hits, error: searchError } = await admin.rpc("research_search", { p_query: question, p_country: country, p_limit: KB_TOP, p_offset: 0 });
  if (searchError) {
    console.error(`research-ask: research_search failed: ${searchError.message}`);
    return reply(req, 500, { error: "The information service is not available right now. Please try again." });
  }
  const kbItems = (hits ?? []) as KbItem[];
  const kb = await material(kbItems);
  const enough = isSufficient(kbItems, kb.flatMap((k) => [k.summary, k.body]), question);

  // ---- 2. outside, only when needed ----
  let external: ExternalResult[] = [];
  if (!enough) {
    const found = await searchExternal(env, question, MOCK);
    external = found.results;
    if (found.reason && !MOCK) console.log(`research-ask: no outside results: ${found.reason}`);
  }

  // ---- 3. one written answer, from the material only ----
  const name = await countryName(country);
  let answer: string | null = null;
  let usedItems: string[] = [];
  let usedUrls: string[] = [];
  let conflicts: Conflict[] = [];
  let figures: Figure[] = [];
  let model: string | null = null;
  let ai = false;
  if (kb.length > 0 || external.length > 0) {
    if (MOCK) {
      const m = mockAnswer(question, kb, external);
      answer = m.answer; usedItems = m.used_item_ids; usedUrls = m.used_source_urls; conflicts = m.conflicts; figures = m.figures; model = "mock"; ai = true;
    } else if (hasModelKey(env)) {
      const prompt = buildPrompt(question, kb, external, name);
      const result = await askModel(env, prompt.system, prompt.user);
      model = result.model;
      if (result.error) console.error(`research-ask: model: ${result.error}`);
      const parsed = parseModelReply(result.text);
      if (parsed) {
        ai = true;
        answer = isNotFound(parsed.answer) ? null : sanitizeAnswer(parsed.answer);
        usedItems = parsed.used_item_ids.filter((id) => kb.some((k) => k.id === id));
        usedUrls = parsed.used_source_urls.filter((u) => external.some((e) => e.url === u));
        conflicts = parsed.conflicts;
        // a figure's address must be one of the notes the model was given
        const known = new Set([...external.map((e) => e.url), ...kb.flatMap((k) => k.sources.map((s) => s.url)).filter((u): u is string => !!u)]);
        figures = parsed.figures.map((f) => ({ ...f, source_url: f.source_url && known.has(f.source_url) ? f.source_url : null }));
      }
    }
  }
  if (!ai || answer === null) {
    // nothing written: the items still help the visitor find their way
    usedItems = kb.map((k) => k.id);
    usedUrls = [];
  }

  const kbUsed = usedItems.length > 0 || (answer !== null && kb.length > 0 && usedItems.length === 0);
  const externalUsed = answer !== null && usedUrls.length > 0;
  const mode = decideMode(kbUsed || (answer === null && kb.length > 0), externalUsed);
  const sources: Source[] = [
    ...kb.filter((k) => usedItems.includes(k.id)).flatMap((k) =>
      k.sources.length ? k.sources.map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, origin: "isoko" as const })) : [{ title: k.title, url: null, publisher: "ISOKO", origin: "isoko" as const }]),
    ...external.filter((e) => usedUrls.includes(e.url)).map((e) => ({ title: e.title, url: e.url, publisher: e.publisher, origin: "external" as const })),
  ];

  // ---- provenance kept, question counted (never who asked) ----
  const expires = new Date(Date.now() + CACHE_HOURS * 3600_000).toISOString();
  const { error: cacheError } = await admin.from("research_answers").upsert({
    question_hash: hash, question, country_id: await countryId(country), answer, mode, item_ids: usedItems, sources, conflicts, model, expires_at: expires,
  }, { onConflict: "question_hash" });
  if (cacheError) console.error(`research-ask: could not store the answer: ${cacheError.message}`);
  if (answer !== null || kbItems.length > 0) {
    const { error: qError } = await admin.rpc("research_record_question", { p_question: question, p_country: country });
    if (qError) console.error(`research-ask: could not record the question: ${qError.message}`);
  }
  if (answer !== null && (mode === "external" || mode === "kb_external")) {
    await queueForReview({ question, answer, countryId: await countryId(country), reviewHash: hash, sources, figures });
  }

  return reply(req, 200, {
    answer, mode, items: kbItems.map(publicItem),
    sources: sources.map(({ title, url, publisher }) => ({ title, url, publisher })),
    conflicts, cached: false, ai,
  });
});

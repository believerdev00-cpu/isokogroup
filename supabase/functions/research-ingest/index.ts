// Document ingestion for the ISOKO Information Hub: POST /functions/v1/research-ingest
//
// A member of the data staff uploads a PDF, spreadsheet, CSV or text file to
// the private 'research' bucket under ingest/, then calls this function with
// its path. The file is read, its text and figures are pulled out (the model
// tidies the title, summary and figures when a key is set, never adding a
// fact), and a draft item is created for the review queue with its statistics,
// the document attached and an import record. Nothing is published here.
//
//   POST { path: "ingest/<file>", country?: slug, kind?: kind, title?: text }
//   -> 200 { item_id, slug, title, figures, chars }
//   400 bad input or unsupported type, 403 not data staff, 404 no such file,
//   413 too large, 422 no readable text (the file is kept), 500 otherwise.
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf";
import * as XLSX from "npm:xlsx";
import { mocksAllowed } from "../_shared/environment.ts";
import { corsFor, identifyCaller } from "../_shared/research-staff.ts";
import { askModel, hasModelKey } from "../research-ask/llm.ts";
import {
  buildImprovePrompt, cleanText, deriveBody, deriveSummary, deriveTitle, detectType, draftSlug, type Figure, figuresFromRows, figuresFromText,
  fileNameOf, MAX_BYTES, MAX_FIGURES, MIMES, MODEL_MAX_CHARS, parseDelimited, parseImprovement, reviewNote, type Row, rowsToText, validateInput,
} from "./extract.ts";

const env = Deno.env;
const BUCKET = "research";
const admin = createClient(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MOCK = env.get("RESEARCH_MOCK") === "1" && mocksAllowed(env);

const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(env, req), "Content-Type": "application/json" } });

type Extracted = { text: string; rows: Row[]; figures: Figure[] };

async function readPdf(bytes: Uint8Array): Promise<Extracted> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const clean = cleanText(text);
  return { text: clean, rows: [], figures: figuresFromText(clean) };
}

function readSpreadsheet(bytes: Uint8Array): Extracted {
  const book = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  const rows: Row[] = [];
  const figures: Figure[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const sheetRows = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as Row[])
      .map((r) => r.map((c) => (typeof c === "string" ? c.trim() : c)))
      .filter((r) => r.some((c) => c !== null && c !== ""));
    if (!sheetRows.length) continue;
    parts.push(book.SheetNames.length > 1 ? `## ${name}\n${rowsToText(sheetRows)}` : rowsToText(sheetRows));
    rows.push(...sheetRows);
    if (figures.length < MAX_FIGURES) figures.push(...figuresFromRows(sheetRows, MAX_FIGURES - figures.length));
  }
  return { text: cleanText(parts.join("\n\n")), rows, figures };
}

function readDelimited(bytes: Uint8Array, delimiter: "," | "\t"): Extracted {
  const rows = parseDelimited(new TextDecoder("utf-8").decode(bytes), delimiter);
  return { text: cleanText(rowsToText(rows)), rows, figures: figuresFromRows(rows) };
}

function readText(bytes: Uint8Array): Extracted {
  const text = cleanText(new TextDecoder("utf-8").decode(bytes));
  return { text, rows: [], figures: figuresFromText(text) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(env, req) });
  if (req.method !== "POST") return reply(req, 405, { error: "Method not allowed" });

  const caller = await identifyCaller(env, req, false);
  if (caller.kind !== "staff") return reply(req, caller.kind === "none" ? caller.status : 403, { error: caller.kind === "none" ? caller.error : "Only ISOKO's data staff can do this" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: "Send a JSON object with the file's path" });
  }
  const input = validateInput(body);
  if ("error" in input) return reply(req, 400, { error: input.error });
  const type = detectType(input.path)!;
  const fileName = fileNameOf(input.path);

  let countryId: string | null = null;
  if (input.country) {
    const { data } = await admin.from("research_countries").select("id").eq("slug", input.country).maybeSingle();
    if (!data) return reply(req, 400, { error: "Unknown country" });
    countryId = data.id;
  }

  // ---- the file ----
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(input.path);
  if (downloadError || !blob) {
    const notFound = /not found|404|does not exist/i.test(downloadError?.message ?? "");
    if (!notFound) console.error(`research-ingest: download failed: ${downloadError?.message ?? "no data"}`);
    return reply(req, notFound ? 404 : 500, { error: notFound ? "File not found" : "The file could not be read right now" });
  }
  if (blob.size > MAX_BYTES) return reply(req, 413, { error: "The file is larger than 25 MB" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const started = new Date();

  const recordImport = async (status: "done" | "failed", error: string | null, created: number) => {
    const { error: iErr } = await admin.from("research_imports").insert({
      source: "document", country_id: countryId, started_at: started.toISOString(), finished_at: new Date().toISOString(), status,
      created_items: created, updated_items: 0, error, triggered_by: caller.userId,
    });
    if (iErr) console.error(`research-ingest: could not record the import: ${iErr.message}`);
  };

  // ---- the text and figures ----
  let extracted: Extracted;
  try {
    extracted = type === "pdf" ? await readPdf(bytes)
      : type === "xlsx" ? readSpreadsheet(bytes)
      : type === "csv" ? readDelimited(bytes, ",")
      : type === "tsv" ? readDelimited(bytes, "\t")
      : readText(bytes);
  } catch (e) {
    console.error(`research-ingest: could not read ${type}: ${e instanceof Error ? e.message : String(e)}`);
    await recordImport("failed", `could not read the ${type} file`, 0);
    return reply(req, 422, { error: "The file could not be read. Is it a valid document?" });
  }
  if (extracted.text.replace(/\s+/g, "").length < 20) {
    await recordImport("failed", "no readable text in the file", 0);
    return reply(req, 422, { error: "No readable text was found in the file. A scanned PDF needs to be converted to text first." });
  }

  let title = deriveTitle(input.title, extracted.text, fileName, type === "xlsx" || type === "csv" || type === "tsv");
  let summary = deriveSummary(extracted.text);
  let figures = extracted.figures.slice(0, MAX_FIGURES);
  const bodyText = deriveBody(extracted.text);

  // ---- the model, when it can read the whole text: better title, summary, figures; never new facts ----
  if (!MOCK && hasModelKey(env) && extracted.text.length < MODEL_MAX_CHARS) {
    const prompt = buildImprovePrompt(extracted.text, title, figures);
    const result = await askModel(env, prompt.system, prompt.user);
    if (result.error) console.error(`research-ingest: model: ${result.error}`);
    const better = parseImprovement(result.text, extracted.text);
    if (better) {
      if (!input.title && better.title) title = better.title;
      if (better.summary) summary = better.summary;
      if (better.figures && better.figures.length) figures = better.figures;
    }
  }

  // ---- the draft item ----
  const now = new Date();
  const base = {
    kind: input.kind ?? "report", title, summary, body: bodyText, country_id: countryId, origin: "isoko", verification: "unverified", status: "draft",
    import_source: "document", imported_at: now.toISOString(), review_note: reviewNote(fileName, now), created_by: caller.userId,
  };
  let item: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 3 && !item; attempt++) {
    const slug = draftSlug(title, crypto.randomUUID().replace(/-/g, "").slice(0, 8));
    const { data, error } = await admin.from("research_items").insert({ ...base, slug }).select("id, slug").single();
    if (!error && data) item = data;
    else if (error && error.code !== "23505") {
      console.error(`research-ingest: could not create the item: ${error.message}`);
      await recordImport("failed", "could not create the item", 0);
      return reply(req, 500, { error: "The item could not be created right now" });
    }
  }
  if (!item) {
    await recordImport("failed", "could not find a free slug", 0);
    return reply(req, 500, { error: "The item could not be created right now" });
  }

  if (figures.length) {
    const { error } = await admin.from("research_stats").insert(figures.map((f, i) => ({
      item_id: item!.id, label: f.label, value: f.value, unit: f.unit, period_label: f.period_label,
      period_date: /^(19|20)\d\d$/.test(f.period_label ?? "") ? `${f.period_label}-01-01` : null, source_url: null, sort: i,
    })));
    if (error) {
      console.error(`research-ingest: could not store the figures: ${error.message}`);
      figures = [];
    }
  }

  // ---- the document, filed under the item when the move works ----
  let path = input.path;
  const target = `${item.id}/${fileName}`;
  const { error: moveError } = await admin.storage.from(BUCKET).move(input.path, target);
  if (!moveError) path = target;
  else console.error(`research-ingest: could not move the file under the item: ${moveError.message}`);
  const { error: docError } = await admin.from("research_documents").insert({
    item_id: item.id, name: fileName.slice(0, 200), path, size: blob.size, mime: blob.type || MIMES[type], created_by: caller.userId,
  });
  if (docError) console.error(`research-ingest: could not attach the document: ${docError.message}`);

  await recordImport("done", null, 1);
  return reply(req, 200, { item_id: item.id, slug: item.slug, title, figures: figures.length, chars: extracted.text.length });
});

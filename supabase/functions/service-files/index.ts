// Customer file access for Travel, Consultancy and Data Analysis.
//
// Customers have no account, only the private link of their request (an access
// token). Storage never lets them in directly (otherwise folder listings would
// reveal other customers' folders); instead this function checks the link and
// hands out a short-lived signed URL:
//
//   POST { action: "upload",   service, token, filename } -> { path, signedToken }
//   POST { action: "download", service, token, path }     -> { url }
//
// Files live in the request's folder (its files_key, which stays the same when
// the link is reset): uploads go to <service>/<files_key>/client/, downloads come
// from its client/ or shared/ folder. Expired or reset links get nothing,
// requests are limited per address, and every download is recorded.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "service-files";
const SERVICES = new Set(["travel", "consultancy", "data"]);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function safeName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-80);
  return clean || "file";
}

function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
}

/** False once this address made too many requests of this kind. */
async function withinLimit(bucket: string, max: number, ip: string | null) {
  const { error } = await admin.rpc("rate_limit", { p_bucket: bucket, p_max: max, p_window_seconds: 3600, p_key: ip });
  return !error;
}

async function folder(service: string, token: string, write: boolean) {
  const { data, error } = await admin.rpc("service_file_customer_folder", { _service: service, _token: token, _write: write });
  return error ? null : (data as string | null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const body = await req.json().catch(() => null) as
    | { action?: string; service?: string; token?: string; filename?: string; path?: string }
    | null;
  const service = body?.service ?? "";
  const token = body?.token ?? "";
  if (!SERVICES.has(service) || !/^[0-9a-f]{64}$/.test(token)) return reply(400, { error: "Invalid request" });
  const ip = clientIp(req);

  if (body?.action === "upload") {
    if (!(await withinLimit("files:upload", 60, ip))) return reply(429, { error: "Too many uploads. Please wait a little and try again." });
    const key = await folder(service, token, true);
    if (!key) return reply(403, { error: "This request no longer accepts files" });
    const path = `${service}/${key}/client/${Date.now()}-${safeName(String(body.filename ?? ""))}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return reply(500, { error: "Could not prepare the upload" });
    return reply(200, { path, signedToken: data.token });
  }

  if (body?.action === "download") {
    if (!(await withinLimit("files:download", 300, ip))) return reply(429, { error: "Too many downloads. Please wait a little and try again." });
    const path = String(body.path ?? "");
    const key = await folder(service, token, false);
    const area = path.split("/")[2];
    if (!key || !path.startsWith(`${service}/${key}/`) || path.includes("..") || !["client", "shared"].includes(area)) {
      return reply(404, { error: "File not found" });
    }
    const name = path.split("/").pop()!.replace(/^\d+-/, "");
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300, { download: name });
    if (error || !data) return reply(404, { error: "File not found" });
    await admin.rpc("audit_event", {
      p_action: "file.downloaded", p_entity_table: BUCKET, p_entity_id: path,
      p_details: { via: "customer link", service, ip },
    });
    // Relative, so it works whatever address the function reaches Storage by
    const signed = new URL(data.signedUrl);
    return reply(200, { url: signed.pathname + signed.search });
  }

  return reply(400, { error: "Unknown action" });
});

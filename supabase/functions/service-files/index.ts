// Customer file access for Travel, Consultancy and Data Analysis.
//
// Customers have no account, only the private link of their request (an access
// token). Storage never lets them in directly (otherwise folder listings would
// reveal other customers' links); instead this function checks the link and
// hands out a short-lived signed URL:
//
//   POST { action: "upload",   service, token, filename } -> { path, signedToken }
//   POST { action: "download", service, token, path }     -> { url }
//
// Uploads go to <service>/<token>/client/, downloads come from the client/ or
// shared/ folder of that same request.
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

async function allowed(path: string, write: boolean) {
  const { data, error } = await admin.rpc("service_file_customer_access", { _name: path, _write: write });
  return !error && data === true;
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

  if (body?.action === "upload") {
    const path = `${service}/${token}/client/${Date.now()}-${safeName(String(body.filename ?? ""))}`;
    if (!(await allowed(path, true))) return reply(403, { error: "This request no longer accepts files" });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return reply(500, { error: "Could not prepare the upload" });
    return reply(200, { path, signedToken: data.token });
  }

  if (body?.action === "download") {
    const path = String(body.path ?? "");
    if (!path.startsWith(`${service}/${token}/`) || path.includes("..") || !(await allowed(path, false))) {
      return reply(404, { error: "File not found" });
    }
    const name = path.split("/").pop()!.replace(/^\d+-/, "");
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300, { download: name });
    if (error || !data) return reply(404, { error: "File not found" });
    // Relative, so it works whatever address the function reaches Storage by
    const signed = new URL(data.signedUrl);
    return reply(200, { url: signed.pathname + signed.search });
  }

  return reply(400, { error: "Unknown action" });
});

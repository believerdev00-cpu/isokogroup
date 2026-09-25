// Opens a protected file for a signed-in person: POST { bucket, path, download? } -> { url }
//
// For files nobody should open straight from storage: customers' uploads to
// Travel, Consultancy and Data Analysis (passports, datasets), sellers' ID
// documents and delivery proofs. The database decides, as the caller, whether
// they may open it (file_access_check: assigned staff, admins, the owner) and
// records every attempt in the audit log; only then is a two-minute link made.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKETS = new Set(["service-files", "id-documents", "delivery-proofs"]);
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer .+/i.test(authorization)) return reply(401, { error: "Please sign in" });

  const body = await req.json().catch(() => null) as { bucket?: string; path?: string; download?: string } | null;
  const bucket = body?.bucket ?? "";
  const path = String(body?.path ?? "");
  if (!BUCKETS.has(bucket) || !path || path.includes("..") || path.length > 500) return reply(400, { error: "Invalid request" });

  // Asked as the caller, so auth.uid() in the database is them
  const asCaller = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization, "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "" } },
  });
  const { data: allowed, error } = await asCaller.rpc("file_access_check", { p_bucket: bucket, p_path: path });
  if (error) {
    const limited = /too many/i.test(error.message);
    return reply(limited ? 429 : 403, { error: limited ? error.message : "You can't open this file" });
  }
  if (allowed !== true) return reply(403, { error: "You can't open this file" });

  const download = body?.download ? String(body.download).slice(0, 120) : undefined;
  const { data, error: signError } = await admin.storage.from(bucket).createSignedUrl(path, 120, download ? { download } : undefined);
  if (signError || !data) return reply(404, { error: "File not found" });
  const signed = new URL(data.signedUrl);
  return reply(200, { url: signed.pathname + signed.search });
});

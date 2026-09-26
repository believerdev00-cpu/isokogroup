// What providers report after accepting a message: POST /functions/v1/notifications-status/twilio
//
// Twilio calls this (the StatusCallback set by notifications-dispatch) when a
// WhatsApp message or SMS is delivered, read, or fails after all (e.g. no
// approved template). Each report is signed with the account's auth token
// (X-Twilio-Signature); unsigned or wrongly signed reports are refused.
// Deploy with verify_jwt = false (Twilio sends no Supabase token).
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;
const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
// The address Twilio was given, exactly (what it signs)
const publicUrl = `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/notifications-status/twilio`;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Twilio's signature: base64 HMAC-SHA1 of the URL followed by each POST field, sorted by name, as name+value. */
export async function twilioSignature(authToken: string, url: string, params: URLSearchParams) {
  const data = url + [...params.keys()].filter((k, i, a) => a.indexOf(k) === i).sort()
    .map((k) => params.getAll(k).map((v) => k + v).join("")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...mac));
}

function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const provider = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (provider !== "twilio" || !token) return reply(404, { error: "Not found" });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply(413, { error: "Too large" });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: "Too large" });
  const params = new URLSearchParams(raw);

  const expected = await twilioSignature(token, publicUrl, params);
  if (!sameText(req.headers.get("x-twilio-signature") ?? "", expected)) {
    console.warn("notifications-status: rejected a report with a wrong signature");
    return reply(403, { error: "Invalid signature" });
  }

  const sid = params.get("MessageSid") ?? params.get("SmsSid") ?? "";
  const status = (params.get("MessageStatus") ?? params.get("SmsStatus") ?? "").toLowerCase();
  const outcome = ["delivered", "read"].includes(status) ? "delivered" : ["failed", "undelivered"].includes(status) ? "failed" : null;
  if (!sid || !outcome) return reply(200, { received: true }); // queued, sent, ...: nothing to record
  const code = params.get("ErrorCode");
  const { data, error } = await admin.rpc("notification_provider_status", {
    p_provider: "twilio",
    p_message_id: sid,
    p_status: outcome,
    p_error: outcome === "failed" ? `Twilio: ${status}${code ? ` (error ${code})` : ""}` : null,
  });
  if (error) {
    console.error(`notifications-status: ${sid}: ${error.message}`);
    return reply(500, { error: "Could not record the report" }); // Twilio retries
  }
  return reply(200, { received: true, outcome: data });
});

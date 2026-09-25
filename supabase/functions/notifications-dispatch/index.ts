// Sends due email / WhatsApp / SMS notifications: POST /functions/v1/notifications-dispatch
//
// Run it every minute with the service-role key (Supabase Dashboard > Integrations >
// Cron, an HTTP request to this function). Each run claims up to 25 due
// deliveries per batch in the database (locked, so two runs never send the
// same message), sends them, and records the result; failures are retried with
// growing delays, up to 5 attempts. In-app notifications don't pass through
// here: they are written when the event happens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { configuredProviders, type Channel } from "./channels.ts";

const BATCH = 25;
const MAX_BATCHES = 8; // stays well inside the function's time limit
const providers = configuredProviders(Deno.env);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Delivery = { id: string; channel: Channel; recipient_address: string; recipient_name: string | null; subject: string; body: string };

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The gateway checks the token's signature; only the service role may run the sender. */
function isServiceRole(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (!isServiceRole(req)) return reply(403, { error: "Forbidden" });

  const counts: Record<string, number> = {};
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await admin.rpc("notification_claim", { p_limit: BATCH });
    if (error) {
      console.error(`notifications-dispatch: claim failed: ${error.message}`);
      return reply(500, { error: "Could not claim deliveries", counts });
    }
    const due = (data ?? []) as Delivery[];
    for (const d of due) {
      const provider = providers.get(d.channel);
      let result: { ok: boolean; provider: string | null; messageId: string | null; error: string | null; retry: boolean };
      if (typeof provider === "string" || !provider) {
        result = { ok: false, provider: null, messageId: null, error: provider ?? "Unknown channel", retry: false };
      } else {
        try {
          const r = await provider.send({ id: d.id, to: d.recipient_address, name: d.recipient_name, subject: d.subject, body: d.body });
          result = r.ok
            ? { ok: true, provider: provider.id, messageId: r.messageId, error: null, retry: false }
            : { ok: false, provider: provider.id, messageId: null, error: r.error, retry: r.retry };
        } catch (e) {
          result = { ok: false, provider: provider.id, messageId: null, error: e instanceof Error ? e.message : "Send failed", retry: true };
        }
      }
      const { data: outcome, error: saveError } = await admin.rpc("notification_result", {
        p_delivery_id: d.id, p_ok: result.ok, p_provider: result.provider, p_message_id: result.messageId,
        p_error: result.error, p_retry: result.retry,
      });
      // Delivery ids only: never log addresses or message text
      if (saveError) console.error(`notifications-dispatch: could not save the result of ${d.id}: ${saveError.message}`);
      const key = String(outcome ?? "error");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    if (due.length < BATCH) break;
  }
  return reply(200, { counts });
});

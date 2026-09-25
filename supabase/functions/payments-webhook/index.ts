// Payment-provider webhooks: POST /functions/v1/payments-webhook/<provider>
//
// A payment is only ever marked successful here, after the provider's
// signature is checked, and by the database function that dedupes events,
// refuses a second use of the same provider transaction and holds amounts that
// don't match for review. Deploy with verify_jwt = false (providers don't send
// a Supabase token); the signature is the authentication.
import { createClient } from "npm:@supabase/supabase-js@2";
import { enabledProviders } from "./providers.ts";

const MAX_BODY_BYTES = 64 * 1024;
const providers = enabledProviders(Deno.env);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const providerId = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const provider = providers.get(providerId);
  if (!provider) return reply(404, { error: "Unknown payment provider" });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply(413, { error: "Too large" });
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return reply(413, { error: "Too large" });

  if (!(await provider.verify(req, rawBody))) {
    console.warn(`payments-webhook: rejected signature from provider ${provider.id}`);
    return reply(401, { error: "Invalid signature" });
  }

  let event;
  try {
    event = provider.parse(rawBody);
  } catch {
    return reply(400, { error: "Invalid event" });
  }

  const { data: outcome, error } = await admin.rpc("finance_apply_provider_event", {
    p_provider: provider.id,
    p_event_id: event.eventId,
    p_payment_id: event.paymentId,
    p_provider_txn_id: event.providerTxnId,
    p_status: event.status,
    p_amount: event.amount,
    p_currency: event.currency,
    p_failure_reason: event.failureReason,
    p_payload: JSON.parse(rawBody),
  });
  if (error) {
    // Logged for Isoko; the provider only learns to retry later
    console.error(`payments-webhook: ${provider.id} event ${event.eventId} failed: ${error.message}`);
    return reply(500, { error: "Could not process the event" });
  }
  // 200 for duplicates too, so the provider stops retrying
  return reply(200, { received: true, outcome });
});

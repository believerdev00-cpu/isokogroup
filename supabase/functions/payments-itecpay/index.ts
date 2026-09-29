// Mobile-money payments through ItecPay: /functions/v1/payments-itecpay/<route>
//
//   POST send       {payment_id}  the customer's screen, right after the database
//                                  function mobile_money_start recorded the payment:
//                                  sends it to ItecPay, once (the customer gets the prompt)
//   POST check      {payment_id}  "I've approved it": asks ItecPay now
//   POST callback/<ITECPAY_CALLBACK_SECRET>
//                                  ItecPay's notification. It isn't signed, so it is
//                                  never believed: it only makes us ask ItecPay.
//   POST sweep      (service-role key) run every minute: asks ItecPay about every
//                                  waiting payment, stops waiting after 15 minutes
//
// A payment is marked paid only by ItecPay's own status check, through
// finance_apply_provider_event (each result once, the amount checked against
// what was asked, the ledger entry, the customer's message). Deploy with
// verify_jwt = false: ItecPay sends no token; send/check need the payment id,
// which only the customer who started the payment receives. Never logs keys,
// phone numbers or request bodies.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mocksAllowed } from "../_shared/environment.ts";
import { ItecPay, outcomeOf, type Network, type VerifyResult } from "./itecpay.ts";

// No approval by then: stop waiting (a late approval is still recorded). Local
// tests can shorten it; hosted Supabase always waits 15 minutes.
const WAIT_SECONDS = (mocksAllowed(Deno.env) && Number(Deno.env.get("MOBILE_MONEY_WAIT_SECONDS"))) || 15 * 60;
const UNSENT_SECONDS = 5 * 60; // started but never sent to ItecPay
const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const itecpay = new ItecPay(Deno.env);
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const callbackSecret = Deno.env.get("ITECPAY_CALLBACK_SECRET") ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

async function apply(paymentId: string, eventId: string, status: "successful" | "failed" | "cancelled", o: {
  amount?: number | null; transactionId?: string | null; reason?: string | null; payload: Record<string, unknown>;
}) {
  const { data, error } = await admin.rpc("finance_apply_provider_event", {
    p_provider: "itecpay",
    p_event_id: eventId,
    p_payment_id: paymentId,
    p_provider_txn_id: o.transactionId ?? null,
    p_status: status,
    p_amount: o.amount ?? null,
    p_currency: "RWF", // ItecPay only handles RWF (mobile_money_start refuses other currencies)
    p_failure_reason: o.reason ?? null,
    p_payload: o.payload,
  });
  if (error) console.error(`payments-itecpay: could not apply ${eventId}: ${error.message}`);
  else console.log(`payments-itecpay: ${eventId} -> ${data}`);
}

type Due = { payment_id: string; network: Network; amount: number; provider_txn_id: string | null; sent: boolean; age_seconds: number };

/** Asks ItecPay about one waiting payment and records the answer. */
async function settle(p: Due, reported?: string | null) {
  let v: VerifyResult | null = null;
  if (p.sent) {
    v = await itecpay.verify({ paymentId: p.payment_id, network: p.network });
    if (v.kind === "status" && (v.outcome === "successful" || v.outcome === "failed")) {
      await apply(p.payment_id, `verify:${p.payment_id}:${v.status}`, v.outcome, {
        amount: v.amount,
        transactionId: v.transactionId,
        reason: v.outcome === "failed" ? `Not paid (${v.status.toLowerCase()})` : null,
        payload: { source: "status_check", status: v.status, amount: v.amount, transaction_id: v.transactionId },
      });
      return;
    }
    if (v.kind === "status" && v.outcome === "unknown") {
      console.warn(`payments-itecpay: unknown status "${v.status}" for ${p.payment_id}; still waiting`);
    }
    // When MTN or Airtel fail a request, ItecPay's status check answers with an
    // error ("Payment request failed") instead of a status, and its callback may
    // say FAILED. The customer is told at once. Recorded as cancelled, not failed:
    // if money did leave the phone after all, the checks still record it.
    const failedByCallback = !!reported && outcomeOf(reported) === "failed" && !(v.kind === "status" && v.outcome === "successful");
    if ((v.kind === "refused" && p.age_seconds >= 10) || failedByCallback) {
      const why = v.kind === "refused" ? v.message : `ItecPay reported ${String(reported).toLowerCase()}`;
      console.warn(`payments-itecpay: ${p.payment_id} not paid: ${why}`);
      await apply(p.payment_id, `declined:${p.payment_id}`, "cancelled", {
        reason: `The payment didn't go through (${why.slice(0, 120)}). Please try again.`,
        payload: { source: v.kind === "refused" ? "status_check" : "callback", message: why.slice(0, 200) },
      });
      return;
    }
  }
  // Nothing final: stop waiting after a while (ItecPay's answer, if it comes later, still counts)
  if (!p.sent && p.age_seconds > UNSENT_SECONDS) {
    await apply(p.payment_id, `expired:${p.payment_id}`, "cancelled", {
      reason: "The request didn't reach your phone", payload: { source: "isoko", reason: "not_sent" },
    });
  } else if (p.age_seconds > WAIT_SECONDS) {
    await apply(p.payment_id, `expired:${p.payment_id}`, "cancelled", {
      reason: "Not approved in time", payload: { source: "isoko", reason: "timeout", last: v ? v.kind : null },
    });
  }
}

async function due(paymentId?: string, limit = 50, now = false): Promise<Due[]> {
  const { data, error } = await admin.rpc("mobile_money_due", { p_limit: limit, p_payment_id: paymentId ?? null, p_now: now });
  if (error) throw new Error(error.message);
  return (data ?? []) as Due[];
}

async function status(paymentId: string) {
  const { data } = await admin.from("finance_payments").select("status, amount, failure_reason")
    .eq("id", paymentId).eq("provider", "itecpay").maybeSingle();
  if (!data) return null;
  const done = ["successful", "partially_refunded", "refunded"].includes(data.status);
  return {
    status: done ? "successful" : data.status,
    amount: Number(data.amount),
    message: ["failed", "cancelled"].includes(data.status) ? data.failure_reason : null,
  };
}

async function send(paymentId: string) {
  const { data: claim, error } = await admin.rpc("mobile_money_claim_send", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
  if (!claim) return reply(409, { error: "This payment was already sent, or has expired", ...(await status(paymentId)) });
  const network = claim.network as Network;
  if (!itecpay.hasKey(network)) {
    await apply(paymentId, `send:${paymentId}`, "cancelled", {
      reason: "This payment method isn't available right now", payload: { source: "isoko", reason: "no_key" },
    });
    return reply(503, { status: "cancelled", message: "This payment method isn't available right now" });
  }
  const r = await itecpay.pay({ paymentId, network, phone: claim.phone, amount: Number(claim.amount) });
  if (r.kind === "accepted") {
    const { error: e } = await admin.rpc("mobile_money_sent", {
      p_payment_id: paymentId, p_transaction_id: r.transactionId, p_financial_transaction_id: r.financialTransactionId,
    });
    if (e) console.error(`payments-itecpay: could not record transaction for ${paymentId}: ${e.message}`);
    return reply(200, { status: "processing" });
  }
  if (r.kind === "refused") {
    await apply(paymentId, `send:${paymentId}`, "failed", {
      reason: r.message.slice(0, 200), payload: { source: "request_payment", message: r.message.slice(0, 200) },
    });
    return reply(200, { status: "failed", message: r.message.slice(0, 200) });
  }
  // No clear answer: ItecPay may still have it. The status check decides.
  console.warn(`payments-itecpay: send ${paymentId}: ${r.reason}`);
  return reply(200, { status: "pending" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const at = parts.indexOf("payments-itecpay");
  const [route, secret] = parts.slice(at + 1);

  try {
    if (route === "send" || route === "check") {
      const body = await readJson(req);
      const id = String(body?.payment_id ?? "");
      if (!UUID.test(id)) return reply(400, { error: "payment_id is required" });
      if (route === "send") return await send(id);
      for (const p of await due(id, 1)) await settle(p);
      const s = await status(id);
      return s ? reply(200, s) : reply(404, { error: "Payment not found" });
    }

    if (route === "callback") {
      // Wrong or unset secret: look like nothing is here
      if (callbackSecret.length < 32 || !secret || !sameSecret(secret, callbackSecret)) return reply(404, { error: "Not found" });
      const body = await readJson(req);
      const data = (body?.data ?? body ?? {}) as Record<string, unknown>;
      const ref = String(data.req_ref ?? "");
      let paymentId = UUID.test(ref) ? ref : null;
      const txn = String(data.transaction_id ?? data.transID ?? "");
      if (!paymentId && txn) {
        const { data: found } = await admin.rpc("mobile_money_by_transaction", { p_transaction_id: txn.slice(0, 100) });
        paymentId = (found as string | null) ?? null;
      }
      const reported = typeof data.status === "string" ? data.status : null;
      if (paymentId) for (const p of await due(paymentId, 1, true)) await settle(p, reported);
      else console.warn("payments-itecpay: callback for a transaction we don't know");
      return reply(200, { received: true });
    }

    if (route === "sweep") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
      if (!token || !sameSecret(token, serviceKey)) return reply(403, { error: "Forbidden" });
      const list = await due(undefined, 100);
      for (const p of list) await settle(p);
      return reply(200, { checked: list.length });
    }
  } catch (e) {
    console.error(`payments-itecpay: ${route}: ${e instanceof Error ? e.message : e}`);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
  return reply(404, { error: "Not found" });
});

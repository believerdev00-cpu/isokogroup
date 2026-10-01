// End-to-end check of the payments-webhook Edge Function with the mock provider,
// against a local Supabase (`supabase start`) and a local copy of the function:
//
//   supabase functions serve payments-webhook --env-file <file with PAYMENTS_MOCK_SECRET>
//   PAYMENTS_MOCK_SECRET=... WEBHOOK_URL=http://127.0.0.1:54321/functions/v1/payments-webhook node supabase/tests/payments-webhook.e2e.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const WEBHOOK = process.env.WEBHOOK_URL ?? `${URL}/functions/v1/payments-webhook`;
for (const u of [URL, WEBHOOK]) if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error(`Refusing to run against ${u}`);
const SECRET = process.env.PAYMENTS_MOCK_SECRET;
if (!SECRET) throw new Error("Set PAYMENTS_MOCK_SECRET to the secret the function runs with");
// The public demo keys of every local Supabase
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const anon = createClient(URL, ANON, opts);
const run = Math.random().toString(36).slice(2, 8);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };

// Sending a request needs an account (20261002120000_requests_require_account.sql):
// a fresh customer, signed in
async function customer() {
  const email = `cust-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = "Test-pass-123";
  must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create customer");
  const c = createClient(URL, ANON, opts);
  must(await c.auth.signInWithPassword({ email, password }), "sign in customer");
  return c;
}
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function send(provider, event, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const body = JSON.stringify(event);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const res = await fetch(`${WEBHOOK}/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Isoko-Timestamp": String(ts), "X-Isoko-Signature": `sha256=${sig}` },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log("Payment webhooks (mock provider)");
// A confirmed 1,000 USD trip
const trip = must(await (await customer()).rpc("travel_request_trip", { p: {
  arrival_date: inDays(30), departure_date: inDays(33), travelers: 1, needs: ["hotel"], name: `Webhook ${run}`, phone: "1", email: "w@x.co",
} }), "trip");
const { id: tripId } = must(await admin.from("travel_trips").select("id").eq("access_token", trip.token).single(), "trip id");
must(await admin.from("travel_trips").update({ status: "confirmed", quote_total: 1000, accepted_at: new Date().toISOString() }).eq("id", tripId), "confirm trip");

const paymentId = must(await admin.rpc("finance_create_intent", {
  p_entity_table: "travel_trips", p_entity_id: tripId, p_amount: 400, p_method: "momo", p_provider: "mock", p_idempotency_key: `wh-${run}`,
}), "intent");
const event = { event_id: `ev-${run}-1`, payment_id: paymentId, provider_txn_id: `TX-${run}`, status: "successful", amount: 400, currency: "USD" };
const payment = async () => must(await admin.from("finance_payments").select("status, provider_txn_id").eq("id", paymentId).single(), "payment");

assert.equal((await send("stripe", event)).status, 404); ok("unknown provider refused");
assert.equal((await send("mock", event, { secret: "wrong-secret-wrong-secret" })).status, 401); ok("wrong signature refused");
assert.equal((await send("mock", event, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401); ok("an hour-old (replayed) webhook refused");
assert.equal((await payment()).status, "pending"); ok("... and the payment is still only started");
assert.equal((await send("mock", { ...event, amount: -1 })).status, 400); ok("invalid event refused");

let r = await send("mock", event);
assert.equal(r.status, 200); assert.equal(r.body.outcome, "applied");
assert.equal((await payment()).status, "successful"); ok("signed successful webhook books the payment");
r = await send("mock", event);
assert.equal(r.status, 200); assert.equal(r.body.outcome, "duplicate"); ok("the same event again is acknowledged, not booked twice");
r = await send("mock", { ...event, event_id: `ev-${run}-2` });
assert.equal(r.body.outcome, "already_applied"); ok("a second event for the same payment changes nothing");

const { data: ledger } = await admin.from("finance_ledger").select("amount").eq("payment_id", paymentId);
assert.equal(ledger.length, 1); assert.equal(Number(ledger[0].amount), -400); ok("one ledger entry of -400");

const second = must(await admin.rpc("finance_create_intent", {
  p_entity_table: "travel_trips", p_entity_id: tripId, p_amount: 100, p_method: "momo", p_provider: "mock", p_idempotency_key: `wh-${run}-b`,
}), "intent 2");
r = await send("mock", { ...event, event_id: `ev-${run}-3`, payment_id: second, amount: 90 });
assert.equal(r.body.outcome, "needs_review"); ok("a different amount is held for review");
r = await send("mock", { ...event, event_id: `ev-${run}-4`, payment_id: second, amount: 100, status: "failed", provider_txn_id: null, failure_reason: "Declined" });
assert.equal(r.body.outcome, "applied");
const failed = must(await admin.from("finance_payments").select("status, failure_reason").eq("id", second).single(), "failed");
assert.deepEqual(failed, { status: "failed", failure_reason: "Declined" }); ok("a failed payment is recorded with its reason");

console.log(`\nAll ${passed} checks passed.`);

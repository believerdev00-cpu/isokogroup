// End-to-end check of paying from the phone: the website's database functions,
// the payments-itecpay Edge Function, and a fake ItecPay that answers like the
// real one (docs/ITECPAY_INTEGRATION.md). No real money moves.
//
// The function must run with the fake's address and keys, a short wait, and no
// SPENN key:
//   ITECPAY_BASE_URL=http://<address the function can reach this machine at>:54399
//   ITECPAY_KEY_MTN=fake-mtn-key-0123456789  ITECPAY_KEY_AIRTEL=fake-airtel-key-0123456789
//   ITECPAY_CALLBACK_SECRET=fake-callback-secret-0123456789abcdef  MOBILE_MONEY_WAIT_SECONDS=6
// then: node supabase/tests/mobile-money.e2e.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const FN = process.env.FUNCTION_URL ?? `${URL_}/functions/v1/payments-itecpay`;
for (const u of [URL_, FN]) if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error(`Refusing to run against ${u}`);
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const KEYS = { mtn: "fake-mtn-key-0123456789", airtel: "fake-airtel-key-0123456789" };
const SECRET = "fake-callback-secret-0123456789abcdef";
const WAIT_SECONDS = 6;
const PORT = Number(process.env.FAKE_ITECPAY_PORT ?? 54399);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ---------- A fake ItecPay (V2 mobile money) ----------
const fake = { requests: [], txns: new Map() }; // req_ref -> { transaction_id, amount, status }
const keyNetwork = Object.fromEntries(Object.entries(KEYS).map(([n, k]) => [k, n]));
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (json, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    let b = {};
    try { b = JSON.parse(body); } catch { return send({ status: 400, data: { message: "Bad JSON" } }); }
    fake.requests.push({ path: req.url, body: b });
    if (!keyNetwork[b.key]) return send({ status: 400, data: { message: "Unauthorized" } });
    if (req.url === "/api2/pay") {
      if (b.phone === "0780000400") return send({ status: 400, data: { message: "Payment request failed" } });
      if (b.phone === "0780000500") { res.writeHead(502, { "Content-Type": "text/html" }); return res.end("<html>Bad gateway</html>"); }
      const t = { transaction_id: crypto.randomUUID(), amount: String(b.amount), status: "PENDING" };
      fake.txns.set(b.req_ref, t);
      return send({ status: 200, data: { financial_transaction_id: String(Date.now()), transaction_id: t.transaction_id, amount: t.amount, currency: "RWF", status: "PENDING" } });
    }
    if (req.url === "/api2/verify") {
      const t = fake.txns.get(b.req_ref);
      if (!t) return send({ status: 400, data: { message: "Transaction not found" } });
      return send({ status: 200, data: { transaction_id: t.transaction_id, amount: t.amount, status: t.status } });
    }
    send({ status: 404, data: { message: "Not found" } }, 404);
  });
});
await new Promise((r) => server.listen(PORT, "0.0.0.0", r));

// ---------- Helpers ----------
const post = (path, body, headers = {}) =>
  fetch(`${FN}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, ...headers }, body: JSON.stringify(body ?? {}) })
    .then(async (r) => ({ status: r.status, text: await r.text() }))
    .then((r) => ({ ...r, json: (() => { try { return JSON.parse(r.text); } catch { return null; } })() }));
const run = Math.random().toString(36).slice(2, 8);

/** A trip accepted at `total` RWF; returns its link token and id. */
async function trip(total) {
  const t = must(await anon.rpc("travel_request_trip", { p: {
    arrival_date: inDays(30), departure_date: inDays(33), travelers: 1, needs: ["hotel"], name: `MoMo ${run}`, phone: "0788000000", email: `momo-${run}@example.com`,
  } }), "trip");
  const { id } = must(await admin.from("travel_trips").select("id").eq("access_token", t.token).single(), "trip id");
  must(await admin.from("travel_trips").update({ currency: "RWF", status: "quoted", quote_total: total, quote_sent_at: new Date().toISOString() }).eq("id", id), "quote");
  must(await anon.rpc("travel_accept_quote", { p_token: t.token }), "accept");
  return { token: t.token, id };
}
const start = async (token, network, phone, amount) =>
  must(await anon.rpc("mobile_money_start", { p_entity_table: "travel_trips", p_entity_id: null, p_token: token, p_network: network, p_phone: phone, p_amount: amount ?? null }), "start");
const payment = async (id) => must(await admin.from("finance_payments").select("*").eq("id", id).single(), "payment");
const balance = async (tripId) => Number(must(await admin.rpc("finance_totals_for", { _entity_table: "travel_trips", _entity_id: tripId }), "totals").balance);
const everyResponse = [];
const callback = (body, secret = SECRET) => post(`callback/${secret}`, body).then((r) => (everyResponse.push(r.text), r));

const setting = must(await admin.from("platform_settings").select("value").eq("key", "mobile_money").single(), "setting").value;
must(await admin.from("platform_settings").update({ value: "on" }).eq("key", "mobile_money"), "switch on");
console.log("Paying from the phone (fake ItecPay)");
try {
  // ---------- MTN: request, approve, paid once ----------
  const a = await trip(5000);
  const p = await start(a.token, "mtn", "0788 123 456");
  assert.equal(Number(p.amount), 5000);
  const sent = await post("send", { payment_id: p.payment_id });
  everyResponse.push(sent.text);
  assert.deepEqual([sent.status, sent.json.status], [200, "processing"]);
  const req = fake.requests.find((r) => r.path === "/api2/pay" && r.body.req_ref === p.payment_id);
  assert.equal(req.body.key, KEYS.mtn);
  assert.equal(req.body.phone, "0788123456");
  assert.equal(Number(req.body.amount), 5000);
  ok("the payment is sent to ItecPay with our payment id, the MTN key and the tidied number");
  assert.equal((await payment(p.payment_id)).provider_txn_id, fake.txns.get(p.payment_id).transaction_id);
  ok("ItecPay's transaction id is kept");
  const again = await post("send", { payment_id: p.payment_id });
  assert.equal(again.status, 409);
  assert.equal(fake.requests.filter((r) => r.path === "/api2/pay" && r.body.req_ref === p.payment_id).length, 1);
  ok("sending the same payment again does nothing");

  assert.equal((await callback({ status: 200, data: { transaction_id: fake.txns.get(p.payment_id).transaction_id, amount: "5000", status: "SUCCESSFUL" } }, "wrong-secret")).status, 404);
  const forged = await callback({ status: 200, data: { transaction_id: fake.txns.get(p.payment_id).transaction_id, amount: "5000", status: "SUCCESSFUL" } });
  assert.equal(forged.status, 200);
  assert.equal((await payment(p.payment_id)).status, "processing");
  assert.equal(await balance(a.id), 5000);
  ok("a callback saying SUCCESSFUL isn't believed: ItecPay's status check still says PENDING, nothing is paid");

  fake.txns.get(p.payment_id).status = "SUCCESSFUL";
  await callback({ status: 200, data: { transaction_id: fake.txns.get(p.payment_id).transaction_id, amount: "5000", status: "SUCCESSFUL" } });
  assert.equal((await payment(p.payment_id)).status, "successful");
  assert.equal(await balance(a.id), 0);
  ok("approved on the phone: the callback makes us ask ItecPay, which confirms it; the trip is paid");
  await callback({ status: 200, data: { transaction_id: fake.txns.get(p.payment_id).transaction_id, amount: "5000", status: "SUCCESSFUL" } });
  const account = must(await admin.from("finance_accounts").select("id").eq("entity_table", "travel_trips").eq("entity_id", a.id).single(), "account");
  const entries = must(await admin.from("finance_ledger").select("kind").eq("account_id", account.id).eq("kind", "payment"), "ledger");
  assert.equal(entries.length, 1);
  ok("the same callback twice records the money once");
  const note = must(await admin.from("notification_events").select("id").eq("event_key", `PAYMENT_SUCCESSFUL:${p.payment_id}`), "event");
  assert.equal(note.length, 1);
  ok("the customer is told the payment was received");
  const status = await anon.rpc("mobile_money_status", { p_payment_id: p.payment_id });
  assert.equal(status.data.status, "successful");
  ok("the customer's screen sees it paid");

  // ---------- Refused, unknown, not set up ----------
  const b = await trip(3000);
  const refused = await start(b.token, "mtn", "0780000400", 1000);
  const r1 = await post("send", { payment_id: refused.payment_id });
  everyResponse.push(r1.text);
  assert.equal(r1.json.status, "failed");
  assert.equal((await payment(refused.payment_id)).status, "failed");
  assert.equal(await balance(b.id), 3000);
  ok("ItecPay refusing the request: the payment fails with ItecPay's reason, nothing is owed on it");

  const spenn = await start(b.token, "spenn", "0788555555", 500);
  const r2 = await post("send", { payment_id: spenn.payment_id });
  everyResponse.push(r2.text);
  assert.equal(r2.status, 503);
  assert.equal((await payment(spenn.payment_id)).status, "cancelled");
  ok("a network without a key configured is refused without calling ItecPay");

  const unclear = await start(b.token, "mtn", "0780000500", 700);
  const r3 = await post("send", { payment_id: unclear.payment_id });
  everyResponse.push(r3.text);
  assert.equal(r3.json.status, "pending");
  assert.equal((await payment(unclear.payment_id)).status, "pending");
  ok("an unclear answer from ItecPay isn't a failure: the payment waits for the status check");

  // ---------- Too late, then approved anyway; a wrong amount ----------
  const c = await trip(4000);
  const late = await start(c.token, "airtel", "0731234567", 2500);
  await post("send", { payment_id: late.payment_id });
  const d = await trip(4000);
  const odd = await start(d.token, "mtn", "0789999999", 4000);
  await post("send", { payment_id: odd.payment_id });

  assert.equal((await post("sweep", {})).status, 403);
  assert.equal((await post("sweep", {}, { Authorization: `Bearer ${ANON}` })).status, 403);
  ok("only the service role can run the sweep");
  await sleep((WAIT_SECONDS + 1) * 1000);
  // an unrelated check made the last 20 seconds mustn't hide these from the sweep
  const swept = await post("sweep", {}, { Authorization: `Bearer ${SERVICE}` });
  assert.equal(swept.status, 200);
  const lateP = await payment(late.payment_id);
  assert.deepEqual([lateP.status, lateP.failure_reason], ["cancelled", "Not approved in time"]);
  assert.equal((await payment(unclear.payment_id)).status, "cancelled");
  assert.equal(await balance(c.id), 4000);
  ok("no approval in time: cancelled, and the customer can try again");

  fake.txns.get(late.payment_id).status = "SUCCESSFUL";
  await callback({ status: 200, data: { transaction_id: fake.txns.get(late.payment_id).transaction_id } });
  assert.equal((await payment(late.payment_id)).status, "successful");
  assert.equal(await balance(c.id), 1500);
  ok("approved on the phone afterwards: the money is still recorded");

  // (the sweep cancelled `odd` too; a real approval with a different amount is held for finance)
  fake.txns.get(odd.payment_id).status = "SUCCESSFUL";
  fake.txns.get(odd.payment_id).amount = "400";
  await callback({ status: 200, data: { transaction_id: fake.txns.get(odd.payment_id).transaction_id } });
  assert.notEqual((await payment(odd.payment_id)).status, "successful");
  const review = must(await admin.from("finance_provider_events").select("outcome").eq("payment_id", odd.payment_id).eq("outcome", "needs_review"), "review");
  assert.equal(review.length, 1);
  ok("ItecPay confirming a different amount isn't applied: finance reviews it");

  // ---------- The keys never leave the server ----------
  for (const text of everyResponse) for (const k of Object.values(KEYS)) assert.ok(!text.includes(k));
  ok("no response to the browser or to ItecPay contains an API key");
} finally {
  await admin.from("platform_settings").update({ value: setting }).eq("key", "mobile_money");
  server.close();
}
console.log(`\nAll ${passed} checks passed.`);

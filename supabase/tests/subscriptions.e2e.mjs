// End-to-end check of subscriptions (20260930100000_subscription_manual_momo.sql)
// against a local Supabase (`supabase start`), through the same HTTP API the
// website uses, as signed-in people trying to get around the page:
//
//   node supabase/tests/subscriptions.e2e.mjs
//
// Time passing is simulated by moving the subscription's dates in the local
// database (docker exec psql). Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error(`Refusing to run against ${URL}`);
// The public demo keys of every local Supabase
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_isoko-local-check";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const anon = () => createClient(URL, ANON, opts);
const run = Math.random().toString(36).slice(2, 8);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
const fails = async (p, pattern, what) => {
  const { error } = await p;
  assert.ok(error, `${what}: expected an error`);
  if (pattern) assert.match(error.message, pattern, what);
  ok(what);
};
const people = [];

async function person(label, role) {
  const email = `${label}-${run}@test.local`;
  const password = "Test-pass-123";
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${label} ${run}` } }), `create ${label}`).user;
  people.push(user.id);
  if (role) must(await admin.from("user_roles").insert({ user_id: user.id, role }), `role ${label}`);
  const client = anon();
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, email, client };
}

/** Runs SQL as the database owner in the local container (only to move the clock) */
function sql(text) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAq"], { input: text }).toString().trim();
}
const moveDates = (userId, column, when) => sql(`BEGIN;
SELECT set_config('isoko.subscription_internal', 'on', true);
UPDATE public.subscriptions SET ${column} = ${when} WHERE user_id = '${userId}';
COMMIT;`);
const state = async (p) => must(await p.client.rpc("subscription_state"), "subscription_state");
// the plan the customer chooses: 7 days for 50 RWF, else the month (or as given)
const report = (p, amount, reference, plan) => p.client.rpc("submit_subscription_payment", {
  p_plan: plan ?? (amount <= 50 ? "week" : "monthly"), p_payer_name: "Payer Name", p_reference: reference, p_amount: amount,
});

try {
  const cust = await person("sub-cust");
  const other = await person("sub-other");
  const finance = await person("sub-finance", "finance");
  const product = must(await admin.from("products").insert({ seller_id: finance.id, name: `E2E ${run}`, price: 1000, category: "x", stock: 10 }).select("id").single(), "product");

  // ---------- Trial ----------
  must(await cust.client.rpc("start_trial"), "start_trial");
  let s = await state(cust);
  assert.equal(s.status, "trial"); assert.equal(s.has_access, true);
  assert.ok(s.seconds_left > 590 && s.seconds_left <= 600, `seconds_left ${s.seconds_left}`);
  ok("sign-in starts a 10-minute trial, counted by the server");
  const sub = must(await cust.client.from("subscriptions").select("*").eq("user_id", cust.id).single(), "own subscription");
  assert.equal(new Date(sub.trial_expires_at) - new Date(sub.trial_started_at), 10 * 60 * 1000);
  ok("trial_started_at and trial_expires_at are stored");
  must(await cust.client.from("cart_items").insert({ user_id: cust.id, product_id: product.id }), "cart during trial");
  const orders = must(await cust.client.rpc("place_order", { p_items: [{ product_id: product.id, quantity: 1 }], p_shipping_address: "Kigali", p_payment_method: "momo", p_payment_reference: `E2E-OK-${run}` }), "checkout");
  assert.equal(orders.length, 1);
  ok("during the trial the member APIs work, checkout included (through the website's API)");

  // ---------- Getting around the page ----------
  const { data: patched } = await cust.client.from("subscriptions").update({ status: "active", expires_at: "2099-01-01T00:00:00Z" }).eq("user_id", cust.id).select();
  assert.ok(!patched || patched.length === 0);
  assert.equal((await state(cust)).status, "trial");
  ok("a customer can't make the subscription active or extend it through the API");
  await fails(cust.client.from("subscriptions").insert({ user_id: cust.id, status: "active", plan: "monthly" }), null, "nor create one");
  await fails(cust.client.from("subscription_payments").insert({ subscription_id: sub.id, user_id: cust.id, plan: "week", amount: 50, reference: "FAKE-1", reference_key: "FAKE1", status: "confirmed" }), null,
    "nor write a confirmed payment");
  await fails(cust.client.from("user_roles").insert({ user_id: cust.id, role: "admin" }), null, "nor make themselves admin");
  await fails(cust.client.rpc("subscription_sweep"), null, "nor run the expiry sweep");
  await fails(cust.client.rpc("subscription_payments_list", { p_status: "all" }), null, "nor list other customers' payments");

  // ---------- The trial ends ----------
  moveDates(cust.id, "trial_expires_at", "now() - interval '1 second'");
  s = await state(cust);
  assert.equal(s.has_access, false); assert.equal(s.ended, "trial"); assert.equal(s.next_plan, "week"); assert.equal(Number(s.next_price), 50);
  ok("the trial ends: no access, 50 RWF for 7 days offered");
  await fails(cust.client.from("cart_items").update({ quantity: 3 }).eq("user_id", cust.id), /access has ended/, "expired: cart API refused");
  await fails(cust.client.from("logistics_requests").insert({ user_id: cust.id, pickup: "A", dropoff: "B" }), /access has ended/, "expired: logistics API refused");
  await fails(cust.client.rpc("place_order", { p_items: [{ product_id: product.id, quantity: 1 }], p_shipping_address: "Kigali", p_payment_method: "momo", p_payment_reference: `E2E-${run}` }),
    /access has ended/, "expired: ordering refused");
  // (applying as a seller needs no running access: the seller plan includes it; seller-subscription.e2e.mjs)
  const inbox = must(await cust.client.from("notifications").select("event_type"), "inbox").map((n) => n.event_type);
  assert.ok(inbox.includes("TRIAL_STARTED") && inbox.includes("TRIAL_EXPIRED"), inbox.join(","));
  ok("in-app messages: trial started, trial expired");

  // ---------- 50 RWF for 7 days ----------
  await fails(report(cust, 200, `MP-${run}-1`, "week"), /This payment is 50 RWF/, "the customer can't change the price");
  const p1 = must(await report(cust, 50, `MP-${run}-1`), "report 50");
  assert.equal(p1.status, "pending");
  s = await state(cust);
  assert.equal(s.has_access, false); assert.equal(s.payment_pending, true);
  ok("the 50 RWF report is pending and gives no access");
  await fails(cust.client.rpc("subscription_confirm_payment", { p_payment_id: p1.id }), null, "the customer can't confirm it");
  const { data: forged } = await cust.client.from("subscription_payments").update({ status: "confirmed" }).eq("id", p1.id).select();
  assert.ok(!forged || forged.length === 0);
  ok("nor mark it confirmed in the table");
  must(await other.client.rpc("start_trial"), "other trial");
  await fails(report(other, 50, `mp ${run} 1`), /already used/, "another customer can't reuse the transaction ID");

  const listed = must(await finance.client.rpc("subscription_payments_list", { p_status: "pending" }), "list");
  assert.ok(listed.some((r) => r.id === p1.id && r.customer_email === cust.email && r.payer_name === "Payer Name"));
  ok("finance sees the pending report with the customer's e-mail and number");
  const confirmed = must(await finance.client.rpc("subscription_confirm_payment", { p_payment_id: p1.id }), "confirm");
  assert.equal(confirmed.status, "confirmed"); assert.equal(confirmed.confirmed_by, finance.id);
  assert.equal(new Date(confirmed.period_ends_at) - new Date(confirmed.period_starts_at), 7 * 86_400_000);
  s = await state(cust);
  assert.equal(s.has_access, true); assert.equal(s.plan, "week");
  ok("finance confirms: exactly 7 days of full access");
  await fails(finance.client.rpc("subscription_confirm_payment", { p_payment_id: p1.id }), /already confirmed/, "a payment is confirmed once");
  await fails(report(other, 50, `MP-${run}-1`), /already used/, "a confirmed transaction ID can't be reused");

  // ---------- Expiry and 200 RWF a month ----------
  moveDates(cust.id, "expires_at", "now() - interval '1 second'");
  must(await admin.rpc("subscription_sweep"), "sweep (service role)");
  s = await state(cust);
  assert.equal(s.has_access, false); assert.equal(s.ended, "week"); assert.equal(Number(s.next_price), 200);
  ok("the 7 days expire; 200 RWF for a month is offered");
  const p2 = must(await report(cust, 200, `MP-${run}-2`), "report 200");
  must(await finance.client.rpc("subscription_reject_payment", { p_payment_id: p2.id, p_reason: "Not on the company account" }), "reject");
  s = await state(cust);
  assert.equal(s.has_access, false); assert.equal(s.last_rejection.reason, "Not on the company account");
  ok("a rejected payment gives no access and the customer sees why");
  const p3 = must(await report(cust, 200, `MP-${run}-3`), "report 200 again");
  const c3 = must(await finance.client.rpc("subscription_confirm_payment", { p_payment_id: p3.id }), "confirm monthly");
  const start = new Date(c3.period_starts_at), end = new Date(c3.period_ends_at);
  const expected = new Date(start); expected.setUTCMonth(expected.getUTCMonth() + 1);
  assert.ok(Math.abs(end - expected) < 3 * 86_400_000, `${start.toISOString()} -> ${end.toISOString()}`);
  assert.equal((await state(cust)).plan, "monthly");
  ok("the monthly payment confirmed: a calendar month of access");
} finally {
  for (const id of people) await admin.auth.admin.deleteUser(id);
  await admin.from("products").delete().like("name", `E2E ${run}`);
}
console.log(`\n${passed} checks passed`);

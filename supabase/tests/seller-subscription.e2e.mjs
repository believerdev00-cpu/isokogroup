// End-to-end check of the seller subscription (20260930130000_seller_subscription.sql)
// against a local Supabase (`supabase start`), through the same HTTP API the website uses:
// register as a seller -> apply -> pay 1,500 RWF -> an admin confirms -> the existing
// seller system opens, with normal access included; a buyer chooses 7 days or a month.
//
//   node supabase/tests/seller-subscription.e2e.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error(`Refusing to run against ${URL}`);
// The public demo keys of every local Supabase
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

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

async function person(label, { role, metadata } = {}) {
  const email = `${label}-${run}@test.local`;
  const password = "Test-pass-123";
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata ?? {} }), `create ${label}`).user;
  people.push(user.id);
  if (role) must(await admin.from("user_roles").insert({ user_id: user.id, role }), `role ${label}`);
  const client = anon();
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, email, client };
}
const pay = (p, plan, amount, reference) => p.client.rpc("submit_subscription_payment", {
  p_plan: plan, p_payer_name: "Payer Name", p_reference: reference, p_amount: amount,
});
const state = async (p) => must(await p.client.rpc("subscription_state"), "subscription_state");

try {
  // what the registration form sends for "Seller"
  const seller = await person("ssub-seller", { metadata: { full_name: `Seller ${run}`, register_as: "seller" } });
  const buyer = await person("ssub-buyer");
  const boss = await person("ssub-admin", { role: "admin" });

  // ---------- Buyer: 50 RWF / 7 days OR 200 RWF / month ----------
  must(await buyer.client.rpc("start_trial"), "trial");
  let s = await state(buyer);
  assert.deepEqual(s.plans.map((p) => [p.plan, Number(p.price)]), [["week", 50], ["monthly", 200]]);
  ok("a normal user is offered 50 RWF / 7 days or 200 RWF / 1 month");
  await fails(pay(buyer, "seller", 1500, `SSUB-${run}-B0`), /7 days or 1 month/, "a normal user can't take the seller plan");

  // ---------- Seller: 1,500 RWF / month ----------
  must(await seller.client.from("seller_applications").insert({
    user_id: seller.id, full_name: `Seller ${run}`, business_name: `Shop ${run}`, phone: "0788000000", id_number: "1199", email: seller.email,
    country: "Rwanda", tin: "123456789", business_address: "Kigali", payment_provider: "MTN MoMo",
    payment_account: "0788000000", payment_account_name: `Seller ${run}`, agreement_version: "2026-10-01",
  }), "application (no trial, no subscription)");
  s = await state(seller);
  assert.deepEqual(s.plans.map((p) => [p.plan, Number(p.price)]), [["seller", 1500]]);
  assert.equal(s.seller_path, true);
  ok("after applying, the only plan is the seller plan: 1,500 RWF a month");
  await fails(pay(seller, "week", 50, `SSUB-${run}-S0`), /seller subscription/, "a seller can't pay 50 RWF instead");

  // the short form: the payer's name and a screenshot of the MoMo message, nothing else
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const shot = `${seller.id}/${Date.now()}.png`;
  must(await seller.client.storage.from("payment-proofs").upload(shot, png, { contentType: "image/png" }), "upload screenshot");
  await fails(seller.client.storage.from("payment-proofs").upload(`${buyer.id}/x.png`, png, { contentType: "image/png" }), null,
    "a customer can't upload into someone else's folder");
  const p1 = must(await seller.client.rpc("submit_subscription_payment", { p_plan: "seller", p_payer_name: `Seller ${run}`, p_proof_path: shot }), "pay with a screenshot");
  assert.equal(p1.status, "pending"); assert.equal(p1.reference, null); assert.equal(Number(p1.amount), 1500);
  ok("the seller reports the payment with just the payer's name and a screenshot");
  const listedShot = must(await boss.client.rpc("subscription_payments_list", { p_status: "pending" }), "admin list").find((r) => r.id === p1.id);
  assert.equal(listedShot.payer_name, `Seller ${run}`); assert.equal(listedShot.proof_path, shot);
  must(await boss.client.storage.from("payment-proofs").createSignedUrl(shot, 120), "admin opens it");
  const { data: peek } = await buyer.client.storage.from("payment-proofs").createSignedUrl(shot, 120);
  assert.ok(!peek?.signedUrl);
  ok("the admin sees the payer's name and opens the screenshot; another customer can't");
  s = await state(seller);
  assert.equal(s.renewal_status, "renewal_pending"); assert.equal(s.payment_status, "pending");
  const app = must(await boss.client.from("seller_applications").select("id").eq("user_id", seller.id).single(), "app");
  await fails(boss.client.rpc("approve_seller_application", { p_application_id: app.id }), /seller subscription payment/,
    "the approve button alone can't open a seller account");
  ok("the 1,500 RWF payment is pending; not a seller yet");

  must(await boss.client.rpc("subscription_confirm_payment", { p_payment_id: p1.id }), "confirm");
  const roles = must(await seller.client.from("user_roles").select("role").eq("user_id", seller.id), "roles");
  assert.ok(roles.some((r) => r.role === "seller"));
  s = await state(seller);
  assert.equal(s.has_access, true); assert.equal(s.plan, "seller"); assert.equal(s.renewal_status, "active");
  assert.ok(s.period_started_at && s.access_until);
  ok("the admin confirms: seller approved, seller subscription active (start, expiry, renewal status tracked)");

  must(await seller.client.from("products").insert({ seller_id: seller.id, name: `E2E ssub ${run}`, price: 1000, category: "x", stock: 1 }), "product");
  must(await seller.client.from("logistics_requests").insert({ user_id: seller.id, pickup: "A", dropoff: "B" }), "logistics");
  ok("the seller sells in the existing seller system and uses normal services, with no 50/200 RWF subscription");
} finally {
  await admin.from("products").delete().like("name", `E2E ssub ${run}`);
  for (const id of people) await admin.auth.admin.deleteUser(id);
}
console.log(`\n${passed} checks passed`);

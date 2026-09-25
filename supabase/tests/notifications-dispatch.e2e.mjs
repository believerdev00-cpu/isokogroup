// End-to-end check of the notifications-dispatch Edge Function against a local
// Supabase, with the mock provider for email and WhatsApp and no SMS provider:
//
//   EMAIL_PROVIDER=mock WHATSAPP_PROVIDER=mock supabase functions serve notifications-dispatch
//   DISPATCH_URL=http://127.0.0.1:54321/functions/v1/notifications-dispatch node supabase/tests/notifications-dispatch.e2e.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const DISPATCH = process.env.DISPATCH_URL ?? `${URL}/functions/v1/notifications-dispatch`;
for (const u of [URL, DISPATCH]) if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error(`Refusing to run against ${u}`);
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
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const dispatch = (key) => fetch(DISPATCH, { method: "POST", headers: { Authorization: `Bearer ${key}` } });

async function trip(email, phone) {
  const t = must(await anon.rpc("travel_request_trip", { p: {
    arrival_date: inDays(20), departure_date: inDays(22), travelers: 1, needs: ["hotel"], name: `Dispatch ${run}`, phone, email,
  } }), "trip");
  const { id } = must(await admin.from("travel_trips").select("id").eq("access_token", t.token).single(), "trip id");
  return id;
}
async function deliveries(tripId) {
  const events = must(await admin.from("notification_events").select("id").eq("entity_id", tripId).eq("event_type", "TRIP_REQUESTED"), "events");
  const rows = must(await admin.from("notification_deliveries").select("channel, status, provider, provider_message_id, attempts, error")
    .in("event_id", events.map((e) => e.id)), "deliveries");
  return Object.fromEntries(rows.map((r) => [r.channel, r]));
}

console.log("Notification sending (mock email and WhatsApp, no SMS provider)");
const { data: before } = await admin.from("platform_settings").select("value").eq("key", "site_url").single();
must(await admin.from("platform_settings").update({ value: "https://isoko.test" }).eq("key", "site_url"), "site url");
try {
  const good = await trip(`good-${run}@example.com`, "+250788100200");
  const bad = await trip(`bad-${run}@example.invalid`, "+250788100201");
  const slow = await trip(`timeout-${run}@example.com`, "+250788100202");

  assert.equal((await dispatch(ANON)).status, 403); ok("only the service role can run the sender");
  assert.equal((await deliveries(good)).email.status, "pending"); ok("... and nothing was sent");

  const res = await dispatch(SERVICE);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.counts.sent >= 3, JSON.stringify(body)); ok(`the sender ran: ${JSON.stringify(body.counts)}`);

  const g = await deliveries(good);
  assert.equal(g.email.status, "sent"); assert.equal(g.email.provider, "mock"); assert.match(g.email.provider_message_id, /^mock-/);
  assert.equal(g.whatsapp.status, "sent"); ok("email and WhatsApp sent, with the provider's message ids");
  assert.equal((await deliveries(bad)).email.status, "failed"); ok("an invalid address fails for good");
  const s = await deliveries(slow);
  assert.equal(s.email.status, "pending"); assert.equal(s.email.attempts, 1); assert.equal(s.email.error, "Provider timeout");
  ok("a timeout is kept for a later retry");

  const again = await (await dispatch(SERVICE)).json();
  assert.equal(again.counts.sent ?? 0, 0); ok("a second run sends nothing twice");
  assert.equal((await deliveries(good)).email.provider_message_id, g.email.provider_message_id); ok("... the sent message is untouched");
} finally {
  await admin.from("platform_settings").update({ value: before?.value ?? "" }).eq("key", "site_url");
}
console.log(`\nAll ${passed} checks passed.`);

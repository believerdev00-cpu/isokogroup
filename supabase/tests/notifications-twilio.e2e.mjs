// End-to-end check of WhatsApp and SMS through Twilio: notifications-dispatch
// sending to a fake Twilio (as Twilio's Messages API answers), and
// notifications-status receiving signed delivery reports. Nothing is sent.
//
// The functions must run with:
//   WHATSAPP_PROVIDER=twilio SMS_PROVIDER=twilio EMAIL_PROVIDER=mock
//   TWILIO_API_BASE=http://<address the functions can reach this machine at>:54398
//   TWILIO_ACCOUNT_SID=ACtest0123456789abcdef0123456789ab TWILIO_AUTH_TOKEN=fake-twilio-token-0123456789
//   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 TWILIO_SMS_FROM=MGtest0123456789abcdef0123456789ab
// then: node supabase/tests/notifications-twilio.e2e.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_)) throw new Error(`Refusing to run against ${URL_}`);
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SID = "ACtest0123456789abcdef0123456789ab";
const TOKEN = "fake-twilio-token-0123456789";
const FROM = "whatsapp:+14155238886";
const SMS_FROM = "MGtest0123456789abcdef0123456789ab";
// The address the status function believes Twilio called (its SUPABASE_URL + path): what Twilio signs
const SIGNED_URL = process.env.STATUS_SIGNED_URL ?? "http://kong:8000/functions/v1/notifications-status/twilio";
const PORT = Number(process.env.FAKE_TWILIO_PORT ?? 54398);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);
let passed = 0;
const ok = (what) => { passed++; console.log(`  ok  ${what}`); };
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const run = Math.random().toString(36).slice(2, 7);
const num = (last3) => `0788${String(Date.now()).slice(-3)}${last3}`; // unique per run

// ---------- A fake Twilio Messages API ----------
const sent = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const reply = (code, json) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    const form = Object.fromEntries(new URLSearchParams(body));
    const authOk = req.headers.authorization === "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
    if (!authOk) return reply(401, { code: 20003, message: "Authenticate", status: 401 });
    if (req.url !== `/2010-04-01/Accounts/${SID}/Messages.json`) return reply(404, { code: 20404, message: "Not found", status: 404 });
    sent.push(form);
    if (form.To.endsWith("063")) return reply(400, { code: 63016, message: "Failed to send freeform message because you are outside the allowed window.", status: 400 });
    if (form.To.endsWith("503")) return reply(503, { code: 20500, message: "Service unavailable", status: 503 });
    reply(201, { sid: "SM" + crypto.randomBytes(16).toString("hex"), status: "queued" });
  });
});
await new Promise((r) => server.listen(PORT, "0.0.0.0", r));

async function trip(phone) {
  const t = must(await anon.rpc("travel_request_trip", { p: {
    arrival_date: inDays(20), departure_date: inDays(22), travelers: 1, needs: ["hotel"], name: `Twilio ${run}`, phone, email: `tw-${run}@example.com`,
  } }), "trip");
  return must(await admin.from("travel_trips").select("id").eq("access_token", t.token).single(), "trip id").id;
}
async function delivery(tripId, channel) {
  const events = must(await admin.from("notification_events").select("id").eq("entity_id", tripId).eq("event_type", "TRIP_REQUESTED"), "events");
  return must(await admin.from("notification_deliveries").select("*").in("event_id", events.map((e) => e.id)).eq("channel", channel).single(), channel);
}
const dispatch = () => fetch(`${URL_}/functions/v1/notifications-dispatch`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());
function signature(params) {
  const data = SIGNED_URL + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", TOKEN).update(data).digest("base64");
}
const report = (params, sig = signature(params)) => fetch(`${URL_}/functions/v1/notifications-status/twilio`, {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": sig }, body: new URLSearchParams(params),
});

const siteUrl = must(await admin.from("platform_settings").select("value").eq("key", "site_url").single(), "site_url").value;
const eventType = must(await admin.from("notification_event_types").select("channels").eq("event_type", "TRIP_REQUESTED").single(), "event type");
must(await admin.from("platform_settings").update({ value: "https://isoko.test" }).eq("key", "site_url"), "set site_url");
console.log("WhatsApp and SMS through Twilio (fake Twilio)");
try {
  // ---------- Text, while no template is approved ----------
  const phoneA = num("001");
  const a = await trip(phoneA);
  await dispatch();
  const msgA = sent.find((m) => m.To === `whatsapp:+250${phoneA.slice(1)}`);
  assert.ok(msgA, "the message reached Twilio");
  assert.equal(msgA.From, FROM);
  assert.match(msgA.Body, new RegExp(`Twilio ${run}`));
  assert.match(msgA.Body, /https:\/\/isoko\.test\/travel\/trip\//);
  assert.equal(msgA.ContentSid, undefined);
  ok("WhatsApp goes to Twilio from our sender, to +250…, with the account's login");
  const dA = await delivery(a, "whatsapp");
  assert.deepEqual([dA.status, dA.provider], ["sent", "twilio"]);
  assert.match(dA.provider_message_id, /^SM/);
  ok("the delivery is sent, with Twilio's message id");

  // ---------- An approved template ----------
  must(await admin.from("notification_templates").upsert({
    event_type: "TRIP_REQUESTED", channel: "whatsapp", subject: "Trip request",
    body: "Hello {{name}}, we received your trip request. {{link}}",
    provider_template: "HXtest0123456789abcdef0123456789ab", provider_variables: ["name", "link"],
  }), "template");
  const phoneB = num("002");
  await trip(phoneB);
  await dispatch();
  const msgB = sent.find((m) => m.To === `whatsapp:+250${phoneB.slice(1)}`);
  assert.equal(msgB.ContentSid, "HXtest0123456789abcdef0123456789ab");
  const vars = JSON.parse(msgB.ContentVariables);
  assert.equal(vars["1"], `Twilio ${run}`);
  assert.match(vars["2"], /^https:\/\/isoko\.test\/travel\/trip\//);
  assert.equal(msgB.Body, undefined);
  ok("with an approved template: its SID and the numbered values ({{1}} name, {{2}} link), no free text");
  must(await admin.from("notification_templates").delete().eq("event_type", "TRIP_REQUESTED").eq("channel", "whatsapp"), "remove template");

  // ---------- Twilio refusing, or down ----------
  const c = await trip(num("063"));
  const d = await trip(num("503"));
  await dispatch();
  const dC = await delivery(c, "whatsapp");
  assert.equal(dC.status, "failed");
  assert.match(dC.error, /approved WhatsApp template/);
  ok("outside WhatsApp's 24-hour window without a template: failed for good, saying why");
  const dD = await delivery(d, "whatsapp");
  assert.equal(dD.status, "pending");
  assert.match(dD.error, /503/);
  ok("Twilio unavailable: tried again later");

  // ---------- SMS through the same account ----------
  must(await admin.from("notification_event_types").update({ channels: [...eventType.channels, "sms"] }).eq("event_type", "TRIP_REQUESTED"), "add sms");
  const phoneE = num("005");
  const e = await trip(phoneE);
  await dispatch();
  const sms = sent.find((m) => m.To === `+250${phoneE.slice(1)}`);
  assert.equal(sms.MessagingServiceSid, SMS_FROM);
  assert.ok(sms.Body.length > 0);
  assert.equal((await delivery(e, "sms")).status, "sent");
  ok("SMS goes through the messaging service, to +250…");

  // ---------- Delivery reports ----------
  const forged = await report({ MessageSid: dA.provider_message_id, MessageStatus: "delivered" }, "bm90IGEgc2lnbmF0dXJl");
  assert.equal(forged.status, 403);
  assert.equal((await delivery(a, "whatsapp")).status, "sent");
  ok("a report without Twilio's signature is refused");
  assert.equal((await report({ AccountSid: SID, MessageSid: dA.provider_message_id, MessageStatus: "delivered" })).status, 200);
  assert.equal((await delivery(a, "whatsapp")).status, "delivered");
  ok("Twilio's signed report: delivered");
  const dE = await delivery(e, "sms");
  assert.equal((await report({ AccountSid: SID, MessageSid: dE.provider_message_id, MessageStatus: "undelivered", ErrorCode: "30008" })).status, 200);
  const failed = await delivery(e, "sms");
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /undelivered \(error 30008\)/);
  ok("accepted, then undelivered: failed with Twilio's error code");
} finally {
  await admin.from("notification_templates").delete().eq("event_type", "TRIP_REQUESTED").eq("channel", "whatsapp");
  await admin.from("notification_event_types").update({ channels: eventType.channels }).eq("event_type", "TRIP_REQUESTED");
  await admin.from("platform_settings").update({ value: siteUrl }).eq("key", "site_url");
  server.close();
}
console.log(`\nAll ${passed} checks passed.`);

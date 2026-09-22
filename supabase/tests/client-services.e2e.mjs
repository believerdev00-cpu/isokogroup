// End-to-end check of Travel, Consultancy and Data Analysis against a local
// Supabase (`supabase start`), through the same API the website uses:
// database functions, row-level security and Storage policies.
//
//   node supabase/tests/client-services.e2e.mjs
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
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function person(label, role) {
  const email = `${label}-${run}@test.local`;
  const password = "Test-pass-123";
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${label} ${run}` } }), `create ${label}`).user;
  if (role) must(await admin.from("user_roles").insert({ user_id: user.id, role }), `role ${label}`);
  const client = anon();
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, email, client };
}
const file = (name, type, text = "hello") => new Blob([text], { type });

// Customers reach their files only through the service-files Edge Function
async function clientUpload(client, service, token, name, type, text) {
  const { data, error } = await client.functions.invoke("service-files", { body: { action: "upload", service, token, filename: name } });
  if (error) throw new Error(`upload url: ${error.message}`);
  must(await client.storage.from("service-files").uploadToSignedUrl(data.path, data.signedToken, file(name, type, text), { contentType: type }), `upload ${name}`);
  return data.path;
}
async function clientDownload(client, service, token, path) {
  const { data, error } = await client.functions.invoke("service-files", { body: { action: "download", service, token, path } });
  if (error) return null;
  return (await fetch(new globalThis.URL(data.url, URL))).text();
}

console.log("Travel Agency");
const traveler = anon();
await fails(traveler.rpc("travel_request_trip", { p: { arrival_date: inDays(-2), departure_date: inDays(3), travelers: 2, needs: ["hotel"], name: "A", phone: "1", email: "a@b.co" } }), /past/, "past arrival refused");
const trip = must(await traveler.rpc("travel_request_trip", { p: {
  travelling_from: "Dubai", arrival_date: inDays(0), departure_date: inDays(7), travelers: 2,
  needs: ["airport_pickup", "hotel", "transport", "activities", "airport_dropoff"], name: `John Doe ${run}`, phone: "+971500000000", email: `john-${run}@example.com`,
} }), "request trip");
assert.match(trip.reference, /^ISO-TRIP-\d{5}$/); ok(`trip requested without an account (${trip.reference})`);
assert.equal((must(await traveler.from("travel_trips").select("id"), "anon select")).length, 0); ok("anonymous visitors can't list trips");

const travelStaff = await person("travel", "travel_staff");
const consultant = await person("consultant", "consultancy_staff");
const analyst = await person("analyst", "data_analyst");
const boss = await person("admin", "admin");
const customer = await person("customer");

assert.equal(must(await consultant.client.from("travel_trips").select("id"), "consultant trips").length, 0); ok("consultancy staff can't see trips");
const staffTrip = must(await travelStaff.client.from("travel_trips").select("*").eq("reference", trip.reference).single(), "staff trip");
ok("travel staff see the request");
const dir = must(await travelStaff.client.rpc("service_staff_directory", { _service: "travel" }), "directory");
assert.ok(dir.some((d) => d.user_id === travelStaff.id)); ok("travel staff directory lists colleagues");
await fails(consultant.client.rpc("admin_service_staff"), /administrators/, "only admins list service staff");

must(await travelStaff.client.from("travel_items").insert([
  { trip_id: staffTrip.id, section: "arrival", title: "Airport pickup", price: 50, start_date: inDays(0), start_time: "14:30", driver_name: "Patrick", driver_phone: "+250788000000", status: "confirmed", supplier: "SecretCabs", internal_cost: 30 },
  { trip_id: staffTrip.id, section: "hotel", title: "Kigali Serena", price: 700, start_date: inDays(0), end_date: inDays(3), status: "confirmed", internal_note: "margin 20%" },
  { trip_id: staffTrip.id, section: "transport", title: "Private car", price: 400, status: "planned" },
  { trip_id: staffTrip.id, section: "experience", title: "Kigali City Tour", price: 500, start_date: inDays(0), start_time: "10:00", pickup_time: "09:30", driver_name: "Patrick", status: "planned" },
  { trip_id: staffTrip.id, section: "departure", title: "Airport drop-off", price: 50, start_date: inDays(7), status: "planned" },
]), "items");
must(await travelStaff.client.from("travel_documents").insert({ trip_id: staffTrip.id, kind: "passport", label: "Passport" }), "doc");
must(await travelStaff.client.from("travel_trips").update({ status: "quoted", quote_total: 1700, quote_sent_at: new Date().toISOString() }).eq("id", staffTrip.id), "send quote");
let view = must(await traveler.rpc("travel_trip_view", { p_token: trip.token }), "view");
assert.equal(Number(view.quote_total), 1700);
assert.ok(!JSON.stringify(view).includes("SecretCabs") && !JSON.stringify(view).includes("margin") && !JSON.stringify(view).includes('"price"'));
ok("customer sees the $1,700 total, no suppliers, costs or line prices");
must(await traveler.rpc("travel_accept_quote", { p_token: trip.token }), "accept");
view = must(await traveler.rpc("travel_trip_view", { p_token: trip.token }), "view");
assert.equal(view.status, "confirmed"); ok("customer accepts: trip confirmed");

const docPath = await clientUpload(traveler, "travel", trip.token, "passport.pdf", "application/pdf", "hello");
assert.ok(docPath.startsWith(`travel/${trip.token}/client/`)); ok("customer uploads a document with the private link (Edge Function)");
await fails(traveler.storage.from("service-files").upload(`travel/${trip.token}/client/direct.pdf`, file("x.pdf", "application/pdf")), null, "customers can't write to Storage directly");
assert.equal(must(await anon().storage.from("service-files").list(`travel/${trip.token}/client`), "anon list").length, 0); ok("nobody can list customer folders without an account");
assert.equal(must(await consultant.client.storage.from("service-files").list(`travel/${trip.token}/client`), "consultant list").length, 0); ok("other services' staff can't list travel folders");
assert.ok(must(await travelStaff.client.storage.from("service-files").list(`travel/${trip.token}/client`), "staff list").length > 0); ok("travel staff can");
{
  const { error } = await traveler.functions.invoke("service-files", { body: { action: "upload", service: "travel", token: "a".repeat(64), filename: "x.pdf" } });
  assert.ok(error); ok("a made-up link can't upload");
}
assert.equal(await clientDownload(traveler, "travel", trip.token, docPath), "hello"); ok("customer re-opens their own document");
assert.equal(await clientDownload(anon(), "travel", "b".repeat(64), docPath), null); ok("another link can't open it");
must(await traveler.rpc("travel_document_uploaded", { p_token: trip.token, p_document_id: view.documents[0].id, p_path: docPath }), "doc uploaded");
const signed = must(await travelStaff.client.storage.from("service-files").createSignedUrl(docPath, 60), "staff signed url");
assert.equal(await (await fetch(signed.signedUrl)).text(), "hello"); ok("travel staff open the passport");
await fails(consultant.client.storage.from("service-files").createSignedUrl(docPath, 60), null, "other services' staff can't open it");

must(await traveler.rpc("travel_submit_payment", { p_token: trip.token, p_amount: 700, p_method: "momo", p_reference: "MP12345" }), "pay");
const pay = must(await travelStaff.client.from("travel_payments").select("*").eq("trip_id", staffTrip.id).single(), "payment");
must(await travelStaff.client.from("travel_payments").update({ status: "confirmed", confirmed_by: travelStaff.id, confirmed_at: new Date().toISOString() }).eq("id", pay.id), "confirm");
view = must(await traveler.rpc("travel_trip_view", { p_token: trip.token }), "view");
assert.equal(Number(view.paid), 700); ok("payment reported by customer, confirmed by staff: paid $700 of $1,700");
must(await travelStaff.client.from("travel_trips").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", staffTrip.id), "complete");
ok("trip completed");

console.log("Consultancy");
const client = anon();
await fails(client.rpc("consult_submit_request", { p: { service: "investment", description: "x", name: "A", phone: "1", email: "a@b.co" } }), /help with/, "a switched-off service can't be requested");
const con = must(await client.rpc("consult_submit_request", { p: { service: "operations", description: "We need help improving our business operations.", name: "Alice", organization: `ABC ${run}`, phone: "+250788111111", email: `alice-${run}@abc.rw` } }), "consult request");
ok(`consultancy request (${con.reference})`);
const conPath = await clientUpload(client, "consultancy", con.token, "profile.pdf", "application/pdf", "profile");
must(await client.rpc("consult_client_file", { p_token: con.token, p_path: conPath, p_name: "profile.pdf", p_size: 5 }), "record file");
const req = must(await consultant.client.from("consult_requests").select("*").eq("reference", con.reference).single(), "staff request");
assert.equal(must(await analyst.client.from("consult_requests").select("id"), "analyst").length, 0); ok("analysts can't see consultancy requests");
must(await consultant.client.from("consult_requests").update({ status: "assessment", assigned_to: consultant.id }).eq("id", req.id), "assess");
must(await consultant.client.from("consult_proposals").insert({ request_id: req.id, service_title: "Business Operations Consultancy", scope: ["Process review", "Operations assessment", "Recommendations", "Implementation support"], fee: 2000, timeline: "4 weeks", status: "sent", sent_at: new Date().toISOString() }), "proposal");
must(await consultant.client.from("consult_requests").update({ status: "proposal_sent" }).eq("id", req.id), "proposal sent");
must(await client.rpc("consult_request_changes", { p_token: con.token, p_message: "Can it take 3 weeks?" }), "changes");
let cv = must(await client.rpc("consult_request_view", { p_token: con.token }), "view");
assert.equal(cv.status, "assessment"); ok("client asks for changes: back to assessment");
must(await consultant.client.from("consult_proposals").insert({ request_id: req.id, service_title: "Business Operations Consultancy", scope: ["Process review"], fee: 2000, timeline: "3 weeks", status: "sent", sent_at: new Date().toISOString() }), "proposal 2");
must(await consultant.client.from("consult_requests").update({ status: "proposal_sent" }).eq("id", req.id), "sent again");
must(await client.rpc("consult_accept_proposal", { p_token: con.token }), "accept");
cv = must(await client.rpc("consult_request_view", { p_token: con.token }), "view");
assert.equal(cv.status, "approved"); assert.equal(cv.proposal.timeline, "3 weeks"); assert.equal(cv.consultant, `consultant ${run}`);
ok("client accepts the updated proposal; project approved with a named consultant");
const internal = `consultancy/internal/${req.id}/${Date.now()}-report.pdf`;
must(await consultant.client.storage.from("service-files").upload(internal, file("report.pdf", "application/pdf", "final report")), "internal upload");
await fails(client.storage.from("service-files").createSignedUrl(internal, 60), null, "client can't open internal files");
const shared = `consultancy/${con.token}/shared/${Date.now()}-report.pdf`;
must(await consultant.client.storage.from("service-files").copy(internal, shared), "share copy");
must(await consultant.client.from("consult_files").insert({ request_id: req.id, kind: "deliverable", name: "Final report.pdf", path: internal, shared_path: shared, shared_at: new Date().toISOString() }), "deliverable row");
cv = must(await client.rpc("consult_request_view", { p_token: con.token }), "view");
const deliverable = cv.files.find((f) => f.kind === "deliverable");
assert.equal(await clientDownload(client, "consultancy", con.token, deliverable.path), "final report"); ok("client downloads the shared report");
assert.equal(await clientDownload(client, "consultancy", con.token, internal), null); ok("the client link can't open internal files");
must(await consultant.client.from("consult_requests").update({ status: "completed" }).eq("id", req.id), "complete");
ok("consultancy project completed");

console.log("Data Analysis");
const org = customer.client; // a signed-in Isoko customer this time
const dr = must(await org.rpc("data_submit_request", { p: { service: "survey", description: "Survey data from 500 respondents; need analysis and a report.", data_later: false, name: "Bob", organization: `ABC Org ${run}`, phone: "+250788222222", email: customer.email } }), "data request");
ok(`data request (${dr.reference})`);
const dataPath = await clientUpload(org, "data", dr.token, "survey_results.csv", "text/csv", "id,answer\n1,yes");
must(await org.rpc("data_client_file", { p_token: dr.token, p_path: dataPath, p_name: "survey_results.csv", p_size: 14 }), "record csv");
const mine = must(await org.rpc("my_service_requests"), "mine");
assert.ok(mine.some((m) => m.reference === dr.reference)); ok("the signed-in customer finds the project in their requests");
const proj = must(await analyst.client.from("data_requests").select("*").eq("reference", dr.reference).single(), "analyst project");
const csv = must(await analyst.client.storage.from("service-files").createSignedUrl(dataPath, 60), "analyst signed");
assert.match(await (await fetch(csv.signedUrl)).text(), /answer/); ok("analyst downloads the client's data");
must(await analyst.client.from("data_requests").update({ status: "data_received", assigned_to: analyst.id, fee: 500, deadline: inDays(14) }).eq("id", proj.id), "receive");
const reportInternal = `data/internal/${proj.id}/${Date.now()}-report.pdf`;
must(await analyst.client.storage.from("service-files").upload(reportInternal, file("report.pdf", "application/pdf", "analysis report")), "upload report");
const reportShared = `data/${dr.token}/shared/${Date.now()}-report.pdf`;
must(await analyst.client.storage.from("service-files").copy(reportInternal, reportShared), "share report");
must(await analyst.client.from("data_deliverables").insert([
  { request_id: proj.id, kind: "cleaned_dataset", name: "Cleaned Dataset", status: "in_progress", file_path: null, file_name: null, shared_path: null, completed_at: null },
  { request_id: proj.id, kind: "final_report", name: "Final Report", status: "done", file_path: reportInternal, file_name: "report.pdf", shared_path: reportShared, completed_at: new Date().toISOString() },
]), "deliverables");
must(await analyst.client.from("data_requests").update({ status: "client_review" }).eq("id", proj.id), "review");
let dv = must(await org.rpc("data_request_view", { p_token: dr.token }), "view");
assert.ok(!JSON.stringify(dv).includes("/internal/")); ok("client never sees internal file paths");
assert.equal(await clientDownload(org, "data", dr.token, dv.deliverables.find((d) => d.status === "done").path), "analysis report"); ok("client downloads the report");
must(await org.rpc("data_review", { p_token: dr.token, p_approve: false, p_message: "Please add charts by region" }), "changes");
dv = must(await org.rpc("data_request_view", { p_token: dr.token }), "view");
assert.equal(dv.status, "analysis"); ok("client asks for changes: back to analysis");
must(await analyst.client.from("data_requests").update({ status: "client_review" }).eq("id", proj.id), "review 2");
must(await org.rpc("data_review", { p_token: dr.token, p_approve: true, p_message: null }), "approve");
must(await org.rpc("data_submit_payment", { p_token: dr.token, p_amount: 500, p_method: "bank", p_reference: "BK-99881" }), "pay");
dv = must(await org.rpc("data_request_view", { p_token: dr.token }), "view");
assert.equal(dv.status, "completed"); assert.equal(Number(dv.pending_payment), 500); ok("client approves (completed) and reports the payment");

console.log("Administration");
must(await boss.client.rpc("admin_set_service_role", { p_email: customer.email, p_role: "data_analyst", p_grant: true }), "grant");
assert.ok(must(await customer.client.rpc("is_service_staff", { _service: "data" }), "is staff")); ok("admin gives a person Data Analysis access by email");
const staffList = must(await boss.client.rpc("admin_service_staff"), "list");
assert.ok(staffList.some((s) => s.email === customer.email && s.roles.includes("data_analyst"))); ok("admin sees who works on which service");
must(await boss.client.rpc("admin_set_service_role", { p_email: customer.email, p_role: "data_analyst", p_grant: false }), "revoke");
assert.equal(must(await customer.client.rpc("is_service_staff", { _service: "data" }), "not staff"), false); ok("and removes it again");
await fails(travelStaff.client.rpc("admin_set_service_role", { p_email: customer.email, p_role: "travel_staff", p_grant: true }), /administrators/, "staff can't give themselves more access");
must(await boss.client.from("service_offerings").update({ is_active: true }).eq("service", "consultancy").eq("key", "investment"), "activate");
assert.equal(must(await anon().from("service_offerings").select("key").eq("key", "investment"), "public offerings").length, 1); ok("admin switches a consultancy service on");
must(await boss.client.from("service_offerings").update({ is_active: false }).eq("service", "consultancy").eq("key", "investment"), "deactivate");

console.log(`\nAll ${passed} checks passed.`);

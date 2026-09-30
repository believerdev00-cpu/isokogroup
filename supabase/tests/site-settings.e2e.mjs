// End-to-end check of site settings (20260930120000_site_settings.sql) against a
// local Supabase (`supabase start`), through the same HTTP API as Admin > Settings
// and every page that shows the company's details:
//
//   node supabase/tests/site-settings.e2e.mjs
//
// Every value it changes is put back. Refuses to run against anything but 127.0.0.1 / localhost.
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
const people = [];

async function person(label, role) {
  const email = `${label}-${run}@test.local`;
  const password = "Test-pass-123";
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `create ${label}`).user;
  people.push(user.id);
  if (role) must(await admin.from("user_roles").insert({ user_id: user.id, role }), `role ${label}`);
  const client = anon();
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, client };
}

const before = Object.fromEntries(must(await admin.from("platform_settings").select("key, value"), "settings").map((r) => [r.key, r.value]));
try {
  const boss = await person("set-admin", "admin");
  const cust = await person("set-cust");

  const shown = must(await anon().rpc("site_settings"), "site_settings");
  assert.equal(shown.company_email, before.company_email);
  assert.ok(Array.isArray(shown.company_phones) && Array.isArray(shown.social_links));
  assert.equal(shown.site_url, undefined);
  ok("a visitor reads the company's public details (and nothing internal)");

  const { data: forged } = await cust.client.from("platform_settings").update({ value: "0" }).eq("key", "marketplace_commission_percent").select();
  assert.ok(!forged || forged.length === 0);
  const { error: forgedInsert } = await cust.client.from("platform_settings").upsert({ key: "company_momo_code", value: "*999#" }, { onConflict: "key" });
  assert.ok(forgedInsert);
  assert.equal(must(await anon().rpc("site_settings"), "again").company_momo_code, before.company_momo_code);
  ok("a customer can't change the MoMo code or the commission");

  must(await boss.client.from("platform_settings").upsert({ key: "company_momo_code", value: "*182*8*1*000000#" }, { onConflict: "key" }), "admin saves");
  must(await boss.client.from("platform_settings").upsert({ key: "company_phones", value: JSON.stringify(["0788 000 111", "0788 000 222"]) }, { onConflict: "key" }), "admin phones");
  const after = must(await anon().rpc("site_settings"), "after");
  assert.equal(after.company_momo_code, "*182*8*1*000000#");
  assert.deepEqual(after.company_phones, ["0788 000 111", "0788 000 222"]);
  ok("an admin changes the MoMo code and the phones as Admin > Settings does; visitors see them");

  const { error: bad } = await boss.client.from("platform_settings").upsert({ key: "marketplace_commission_percent", value: "90" }, { onConflict: "key" });
  assert.match(bad?.message ?? "", /0 to 50/);
  ok("a value that would break the site is refused with a clear message");
} finally {
  for (const [key, value] of Object.entries(before)) {
    if (["company_momo_code", "company_phones", "marketplace_commission_percent"].includes(key)) {
      await admin.from("platform_settings").update({ value }).eq("key", key);
    }
  }
  for (const id of people) await admin.auth.admin.deleteUser(id);
}
console.log(`\n${passed} checks passed`);

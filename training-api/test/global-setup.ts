import fs from "node:fs";
import pg from "pg";

// Test emails are never sent: they would otherwise wait in the platform's shared
// notification queue (and fill the batches other test suites claim).
const SKIP_TEST_EMAILS = `UPDATE public.notification_deliveries SET status = 'skipped', error = 'Test run'
  WHERE status IN ('pending', 'sending') AND recipient_address LIKE '%@test.local';
  DELETE FROM public.notification_secrets s USING public.notification_deliveries d
  WHERE d.id = s.delivery_id AND d.status = 'skipped'`;

// Tests run against the local Supabase (`supabase start`): a fresh "training"
// schema from the migration for every run, and no leftover test accounts.
// Refuses any database that isn't on this machine.
export default async function setup() {
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Refusing to reset the training schema on ${host}`);

  // The migrations that build the training schema, in order
  const migrations = [
    "20260922100000_training_center.sql",
    "20260925150100_training_hardening.sql",
    // also (re)defines the public-schema pieces that tie training to the payment and notification engines
    "20260925160000_training_on_engines.sql",
    // registration fee on the ledger, applicants' payment links
    "20260929100000_training_application_fee.sql",
    // a deadline per program, moving applications, editable announcements
    "20260930110000_training_admin_edits.sql",
    // the website's moving intake band: show_in_ticker, is_featured, ticker_priority
    "20261003120000_training_intake_ticker.sql",
  ].map((name) =>
    fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"),
  );
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS training CASCADE");
    for (const migration of migrations) await client.query(migration);
    await client.query("DELETE FROM auth.users WHERE email LIKE '%@test.local'");
    await client.query("DELETE FROM public.rate_limit_counters WHERE bucket LIKE 'training:%'");
    await client.query(SKIP_TEST_EMAILS);
  } finally {
    await client.end();
  }
  return async function teardown() {
    const done = new pg.Client({ connectionString: url });
    await done.connect();
    try {
      await done.query(SKIP_TEST_EMAILS);
    } finally {
      await done.end();
    }
  };
}

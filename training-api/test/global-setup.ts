import fs from "node:fs";
import pg from "pg";

// Tests run against the local Supabase (`supabase start`): a fresh "training"
// schema from the migration for every run, and no leftover test accounts.
// Refuses any database that isn't on this machine.
export default async function setup() {
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Refusing to reset the training schema on ${host}`);

  const migration = fs.readFileSync(new URL("../../supabase/migrations/20260922100000_training_center.sql", import.meta.url), "utf8");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS training CASCADE");
    await client.query(migration);
    await client.query("DELETE FROM auth.users WHERE email LIKE '%@test.local'");
  } finally {
    await client.end();
  }
}

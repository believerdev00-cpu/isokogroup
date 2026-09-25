// Runs every supabase/tests/*.test.sql against a local Supabase database and
// reports each one. Every suite runs in a transaction that it rolls back.
//
//   npm run test:db
//
// Uses psql with SUPABASE_DB_URL (default: the local `supabase start`
// database) when psql is installed, or `docker exec` into the database
// container named by SUPABASE_DB_CONTAINER (default: the first running
// supabase_db_* container). Refuses any database that isn't on this machine.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const suites = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.sql"))
  .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
  .sort();

const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error(`Refusing to run against ${new URL(url).hostname}`);

const has = (cmd, args) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
let run;
if (has("psql", ["--version"])) {
  run = (sql) => spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, encoding: "utf8" });
} else {
  const container =
    process.env.SUPABASE_DB_CONTAINER ??
    execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
      .split("\n")
      .find((n) => n.startsWith("supabase_db_"));
  if (!container) throw new Error("No psql and no running supabase_db_* container: start Supabase first");
  run = (sql) =>
    spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
      input: sql,
      encoding: "utf8",
    });
}

let failed = 0;
for (const suite of suites) {
  const started = Date.now();
  const r = run(fs.readFileSync(path.join(dir, suite), "utf8"));
  const checks = (r.stderr.match(/NOTICE: {2}ok {2}/g) ?? []).length;
  const ms = Date.now() - started;
  if (r.status === 0) {
    console.log(`  pass  ${suite}  (${checks} checks, ${ms} ms)`);
  } else {
    failed++;
    const error = r.stderr.split("\n").filter((l) => /ERROR|FAILED|^\s{4}/.test(l)).slice(0, 8).join("\n        ");
    console.log(`  FAIL  ${suite}  (after ${checks} checks)\n        ${error}`);
  }
}
console.log(failed ? `\n${failed} of ${suites.length} suites failed` : `\nAll ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);

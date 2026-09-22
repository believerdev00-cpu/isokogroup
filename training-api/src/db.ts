import pg from "pg";
import { config } from "./config.js";

// Return int8 (count(*), sums) as numbers; amounts here are far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// numeric columns (weights, commission_rate) as numbers, matching the old API
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// Keep DATE columns as 'YYYY-MM-DD' strings instead of shifting them by timezone
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// The Training Center's tables live in their own "training" schema of the Isoko
// Supabase database, which the public Supabase API does not expose.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4, idleTimeoutMillis: 20_000 });
pool.on("connect", (client) => {
  client.query("SET search_path TO training, public").catch(() => {});
});

export type Queryable = Pick<pg.PoolClient, "query">;

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const res = await client.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

const rollbackHooks = new WeakMap<object, (() => Promise<void>)[]>();

/** Work outside the database (e.g. a created auth account) to undo if the transaction fails. */
export function onRollback(client: Queryable, undo: () => Promise<void>) {
  rollbackHooks.get(client)?.push(undo);
}

/** Runs fn in a transaction; rolls back if it throws. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const hooks: (() => Promise<void>)[] = [];
  rollbackHooks.set(client, hooks);
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    await Promise.all(hooks.map((undo) => undo().catch(() => undefined)));
    throw err;
  } finally {
    rollbackHooks.delete(client);
    client.release();
  }
}

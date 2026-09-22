import { pool, type Queryable } from "../db.js";

/** Records who did an important action (decisions, money, certificates, overrides). */
export async function logActivity(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
  client: Queryable = pool,
) {
  await client.query(
    "INSERT INTO activity_log (actor_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
    [actorId, action, entity, entityId, JSON.stringify(details)],
  );
}

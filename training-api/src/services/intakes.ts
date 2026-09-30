import { pool, query, type Queryable } from "../db.js";
import { notify } from "./notifications.js";
import { today } from "./settings.js";

/**
 * Keeps automatic intakes in step with their dates and seats:
 *   before the opening date      → upcoming
 *   after the closing date        → closed
 *   every program past its own deadline → closed (a program may close early)
 *   no program with a free seat   → full
 *   otherwise                     → open
 * Intakes an admin has pinned (manual mode) and draft/completed/archived ones are
 * left alone. Admins are told when an intake opens or closes.
 */
export async function refreshIntakeStatuses(client: Queryable = pool, intakeId?: string) {
  const d = await today(client);
  const changed = await query<{ id: string; name: string; old_status: string; status: string }>(
    `WITH computed AS (
       SELECT i.id, i.status AS old_status,
              CASE
                WHEN $1::date < i.application_opens_on THEN 'upcoming'
                WHEN $1::date > i.application_closes_on THEN 'closed'
                WHEN EXISTS (SELECT 1 FROM intake_program_stats s WHERE s.intake_id = i.id)
                 AND NOT EXISTS (SELECT 1 FROM intake_program_stats s WHERE s.intake_id = i.id
                                 AND (s.application_closes_on IS NULL OR $1::date <= s.application_closes_on))
                  THEN 'closed'
                WHEN NOT EXISTS (SELECT 1 FROM intake_program_stats s
                                 WHERE s.intake_id = i.id AND s.accepting_applications AND s.available_seats > 0
                                   AND (s.application_closes_on IS NULL OR $1::date <= s.application_closes_on))
                  THEN 'full'
                ELSE 'open'
              END AS new_status
       FROM intakes i
       WHERE i.status_mode = 'auto' AND i.status NOT IN ('draft', 'completed', 'archived')
         AND ($2::uuid IS NULL OR i.id = $2::uuid)
     )
     UPDATE intakes i SET status = c.new_status
     FROM computed c
     WHERE i.id = c.id AND c.new_status <> c.old_status
     RETURNING i.id, i.name, c.old_status, i.status`,
    [d, intakeId ?? null],
    client,
  );
  for (const c of changed) {
    if (c.status === "open" || c.status === "closed") {
      const admins = await query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active", [], client);
      for (const a of admins) {
        await notify(
          {
            userId: a.id,
            type: c.status === "open" ? "intake_opening" : "intake_closing",
            title: c.status === "open" ? `${c.name}: applications are open` : `${c.name}: applications have closed`,
            body: c.status === "open"
              ? "The application period has started. New applications will appear under Applications."
              : "The application deadline has passed. Review the remaining pending applications.",
            link: `/admin/intakes/${c.id}`,
          },
          client,
        );
      }
    }
  }
  return changed;
}

/**
 * The condition for accepting an application to an intake program, as SQL over
 * aliases i (intakes) and s (intake_program_stats); `todayParam` is the $n holding
 * today's date. An admin's manual "open" overrides the intake's dates; a
 * program's own deadline (when it has one) and a free seat always apply.
 */
export const acceptingSql = (todayParam: string) => `
  i.status = 'open'
  AND (i.status_mode = 'manual' OR (${todayParam}::date BETWEEN i.application_opens_on AND i.application_closes_on))
  AND s.accepting_applications AND s.available_seats > 0
  AND (s.application_closes_on IS NULL OR ${todayParam}::date <= s.application_closes_on)`;

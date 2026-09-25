import { config } from "../config.js";
import { pool, query, queryOne, type Queryable } from "../db.js";

export type NoticeType =
  | "application_submitted"
  | "application_approved"
  | "application_rejected"
  | "application_waitlisted"
  | "intake_opening"
  | "intake_closing"
  | "payment_received"
  | "announcement"
  | "assessment_result"
  | "certificate_issued"
  | "account_created";

type Notice = {
  userId?: string | null;
  email?: string | null;
  type: NoticeType;
  title: string;
  body: string;
  link?: string | null;
  /** Added to the email only (e.g. a temporary password): never shown in-app or stored with the message, deleted once the email is sent or given up on. */
  emailSecret?: string | null;
};

/** A portal path as a full address for emails. */
const fullLink = (link: string | null | undefined) =>
  !link ? "" : link.startsWith("http") ? link : config.publicUrl + config.basePath + link;

/**
 * Stores a notification (shown in the user's portal when userId is set) and,
 * when an address is given, raises a TRAINING_NOTICE event: the platform's
 * notification engine sends the email (notifications-dispatch), with retries,
 * the recipient's channel preferences and delivery status. Runs inside the
 * caller's transaction, so a rolled-back action never sends anything.
 */
export async function notify(n: Notice, client: Queryable = pool) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO notifications (user_id, email, type, title, body, link, email_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'none') RETURNING id`,
    [n.userId ?? null, n.email ?? null, n.type, n.title, n.body, n.link ?? null],
    client,
  );
  if (!n.email) return;
  const recipient = { user_id: n.userId ?? undefined, email: n.email };
  const event = await queryOne<{ id: string | null }>(
    `SELECT public.notify_event('TRAINING_NOTICE', 'TRAINING_NOTICE:' || $1::text, 'training.notifications', $1::uuid,
       jsonb_build_array(jsonb_strip_nulls($2::jsonb)), $3::jsonb) AS id`,
    [row!.id, JSON.stringify(recipient), JSON.stringify({ title: n.title, body: n.body, url: fullLink(n.link), type: n.type })],
    client,
  );
  if (!event?.id) return;
  await client.query("UPDATE notifications SET event_id = $2 WHERE id = $1", [row!.id, event.id]);
  if (n.emailSecret) await client.query("SELECT public.notification_attach_secret($1, $2)", [event.id, n.emailSecret]);
}

/** In-app notice to every admin about a new application. */
export async function notifyAdminsOfApplication(client: Queryable, body: string, applicationId: string) {
  const admins = await query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active", [], client);
  for (const a of admins) {
    await notify(
      { userId: a.id, type: "application_submitted", title: "New application", body, link: `/admin/applications/${applicationId}` },
      client,
    );
  }
}

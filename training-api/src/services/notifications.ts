import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { pool, query, type Queryable } from "../db.js";

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
};

/**
 * Stores a notification (shown in the user's portal when userId is set) and
 * queues an email when an address is given. Runs inside the caller's
 * transaction, so a rolled-back action never sends anything.
 */
export async function notify(n: Notice, client: Queryable = pool) {
  await client.query(
    `INSERT INTO notifications (user_id, email, type, title, body, link, email_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [n.userId ?? null, n.email ?? null, n.type, n.title, n.body, n.link ?? null, n.email ? "pending" : "none"],
  );
}

let transporter: Transporter | null = null;
function mailer() {
  if (!config.smtp) return null;
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

/** Sends queued emails. Without SMTP settings they're marked not_configured (still visible in-app). */
export async function dispatchEmails(limit = 20) {
  const rows = await query<{ id: string; email: string; title: string; body: string; link: string | null }>(
    `UPDATE notifications SET email_attempts = email_attempts + 1
     WHERE id IN (SELECT id FROM notifications WHERE email_status = 'pending' AND email_attempts < 5
                  ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, email, title, body, link`,
    [limit],
  );
  const transport = mailer();
  for (const r of rows) {
    if (!transport) {
      await query("UPDATE notifications SET email_status = 'not_configured' WHERE id = $1", [r.id]);
      continue;
    }
    try {
      const link = r.link ? `\n\n${r.link.startsWith("http") ? r.link : config.publicUrl + config.basePath + r.link}` : "";
      await transport.sendMail({ from: config.smtp!.from, to: r.email, subject: r.title, text: `${r.body}${link}` });
      await query("UPDATE notifications SET email_status = 'sent', email_error = NULL WHERE id = $1", [r.id]);
    } catch (err) {
      await query(
        `UPDATE notifications SET email_error = $2,
           email_status = CASE WHEN email_attempts >= 5 THEN 'failed' ELSE 'pending' END
         WHERE id = $1`,
        [r.id, (err as Error).message.slice(0, 500)],
      );
    }
  }
  return rows.length;
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

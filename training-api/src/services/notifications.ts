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
  /** Added to the email only (e.g. a temporary password): never shown in-app, wiped once the email is sent or given up on. */
  emailSecret?: string | null;
};

/**
 * Stores a notification (shown in the user's portal when userId is set) and
 * queues an email when an address is given. Runs inside the caller's
 * transaction, so a rolled-back action never sends anything.
 */
export async function notify(n: Notice, client: Queryable = pool) {
  await client.query(
    `INSERT INTO notifications (user_id, email, type, title, body, link, email_status, email_secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [n.userId ?? null, n.email ?? null, n.type, n.title, n.body, n.link ?? null, n.email ? "pending" : "none",
      n.email ? n.emailSecret ?? null : null],
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

/**
 * Sends queued emails. Each one is first claimed as 'sending' for two minutes,
 * so two runs (or a slow send overlapping the next run) never send it twice; a
 * send that died is picked up again after the lock. Without SMTP settings emails
 * are marked not_configured (still visible in-app). Secrets are wiped once an
 * email is sent or given up on.
 */
export async function dispatchEmails(limit = 20) {
  const rows = await query<{ id: string; email: string; title: string; body: string; link: string | null; email_secret: string | null }>(
    `UPDATE notifications SET email_attempts = email_attempts + 1, email_status = 'sending',
       email_locked_until = now() + interval '2 minutes'
     WHERE id IN (SELECT id FROM notifications
                  WHERE (email_status = 'pending' OR (email_status = 'sending' AND email_locked_until < now()))
                    AND email_attempts < 5
                  ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, email, title, body, link, email_secret`,
    [limit],
  );
  const transport = mailer();
  for (const r of rows) {
    if (!transport) {
      await query("UPDATE notifications SET email_status = 'not_configured', email_secret = NULL, email_locked_until = NULL WHERE id = $1", [r.id]);
      continue;
    }
    try {
      const link = r.link ? `\n\n${r.link.startsWith("http") ? r.link : config.publicUrl + config.basePath + r.link}` : "";
      const secret = r.email_secret ? `\n\n${r.email_secret}` : "";
      await transport.sendMail({ from: config.smtp!.from, to: r.email, subject: r.title, text: `${r.body}${secret}${link}` });
      await query("UPDATE notifications SET email_status = 'sent', email_error = NULL, email_secret = NULL, email_locked_until = NULL WHERE id = $1", [r.id]);
    } catch (err) {
      await query(
        `UPDATE notifications SET email_error = $2, email_locked_until = NULL,
           email_status = CASE WHEN email_attempts >= 5 THEN 'failed' ELSE 'pending' END,
           email_secret = CASE WHEN email_attempts >= 5 THEN NULL ELSE email_secret END
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

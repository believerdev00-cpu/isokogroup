import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { temporaryPassword } from "../src/services/auth.js";
import { dispatchEmails } from "../src/services/notifications.js";
import { applicant, apply, makeAdmin, openOffering, query, queryOne, uid } from "./helpers.js";

async function authAccount(email: string, confirmed: boolean) {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Someone-elses-42", email_confirm: confirmed }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function approve(admin: Awaited<ReturnType<typeof makeAdmin>>, offeringId: string, fields = applicant()) {
  const ref = (await apply(offeringId, fields)).res.body.data.reference;
  const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
  return admin.post(`/api/admin/applications/${app.id}/approve`);
}

describe("accounts and credentials", () => {
  it("temporary passwords are long and random", () => {
    const seen = new Set(Array.from({ length: 200 }, () => temporaryPassword()));
    expect(seen.size).toBe(200);
    for (const p of seen) expect(p).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
  });

  it("an unconfirmed Isoko account with the same email is never linked (someone else may have created it)", async () => {
    const admin = await makeAdmin();
    const email = `squatter-${uid()}@test.local`;
    await authAccount(email, false);
    const trainer = await admin.post("/api/admin/trainers").send({ full_name: "Real Trainer", email, specialization: "Web" });
    expect(trainer.status).toBe(409);
    expect(trainer.body.error.message).toMatch(/never confirmed/);

    const { offeringId } = await openOffering(admin);
    const approval = await approve(admin, offeringId, applicant({ email }));
    expect(approval.status).toBe(409);
    expect(await queryOne("SELECT 1 FROM students WHERE lower(email) = $1 AND user_id IS NOT NULL", [email])).toBeNull();
  });

  it("a new student's password is only in the email, never in the app, and is wiped once the email is handled", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const fields = applicant();
    const approval = (await approve(admin, offeringId, fields)).body.data;
    const password = approval.login.temporary_password as string;
    expect(password).toEqual(expect.any(String));

    const notices = await query("SELECT body, email_secret, email_status FROM notifications WHERE type = 'application_approved' AND lower(email) = $1", [fields.email]);
    expect(notices).toHaveLength(1);
    expect(notices[0].body).not.toContain(password);
    expect(notices[0].email_secret).toContain(password);

    await dispatchEmails(200);
    const after = await queryOne("SELECT email_secret, email_status FROM notifications WHERE type = 'application_approved' AND lower(email) = $1", [fields.email]);
    expect(after.email_secret).toBeNull();
    expect(after.email_status).toBe(config.smtp ? "sent" : "not_configured");
  });

  it("new trainers' passwords are likewise kept out of the app", async () => {
    const admin = await makeAdmin();
    const email = `trainer-${uid()}@test.local`;
    const res = await admin.post("/api/admin/trainers").send({ full_name: "New Trainer", email, specialization: "Design" });
    const password = res.body.data.login.temporary_password as string;
    const notice = await queryOne("SELECT body, email_secret FROM notifications WHERE type = 'account_created' AND lower(email) = $1", [email]);
    expect(notice.body).not.toContain(password);
    expect(notice.email_secret).toContain(password);
  });

  it("an application can't overwrite an existing student's contact details", async () => {
    const admin = await makeAdmin();
    const first = await openOffering(admin);
    const second = await openOffering(admin);
    const person = applicant();
    await approve(admin, first.offeringId, person);
    const impostor = { ...person, phone: "+250700000999", emergency_contact_phone: "+250700000998", address: "Somewhere else" };
    const second_approval = await approve(admin, second.offeringId, impostor);
    expect(second_approval.status).toBe(200);
    const student = await queryOne("SELECT phone, address, emergency_contact_phone FROM students WHERE lower(email) = lower($1)", [person.email]);
    expect(student.phone).toBe(person.phone);
    expect(student.emergency_contact_phone).not.toBe("+250700000998");
  });
});

describe("emails", () => {
  it("an email being sent is not picked up again until its lock runs out", async () => {
    const email = `outbox-${uid()}@test.local`;
    const [row] = await query(
      `INSERT INTO notifications (email, type, title, body, email_status, email_attempts, email_locked_until)
       VALUES ($1, 'announcement', 'Hello', 'Body', 'sending', 1, now() + interval '2 minutes') RETURNING id`,
      [email],
    );
    await dispatchEmails(200);
    expect((await queryOne("SELECT email_status, email_attempts FROM notifications WHERE id = $1", [row.id]))).toEqual({
      email_status: "sending", email_attempts: 1,
    });
    // The sender died: once the lock expires the email is handled
    await query("UPDATE notifications SET email_locked_until = now() - interval '1 second' WHERE id = $1", [row.id]);
    await dispatchEmails(200);
    const after = await queryOne("SELECT email_status, email_attempts FROM notifications WHERE id = $1", [row.id]);
    expect(after.email_attempts).toBe(2);
    expect(after.email_status).toBe(config.smtp ? "sent" : "not_configured");
  });
});

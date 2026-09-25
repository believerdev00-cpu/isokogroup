import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { temporaryPassword } from "../src/services/auth.js";
import { applicant, apply, makeAdmin, openOffering, pool, query, queryOne, uid } from "./helpers.js";

async function authAccount(email: string, confirmed: boolean) {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Someone-elses-42", email_confirm: confirmed }),
  });
  if (!res.ok) throw new Error(await res.text());
}

/** The email delivery of a Training Center notice, and its secret (if any). */
async function emailOf(type: string, email: string) {
  return queryOne(
    `SELECT n.body AS notice, d.id AS delivery_id, d.status, d.subject, d.body, s.secret
     FROM notifications n JOIN public.notification_deliveries d ON d.event_id = n.event_id AND d.channel = 'email'
     LEFT JOIN public.notification_secrets s ON s.delivery_id = d.id
     WHERE n.type = $1 AND lower(n.email) = $2`,
    [type, email],
  );
}

/**
 * What notifications-dispatch does, as the service role, inside a transaction
 * that is rolled back: claim the due emails (this one included), and report
 * this one sent. Returns what the sender was given and what is left afterwards.
 */
async function sendOnce(deliveryId: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    // only this one is due (other test runs leave emails waiting; all rolled back below)
    await c.query("UPDATE public.notification_deliveries SET next_attempt_at = now() + interval '1 day' WHERE id <> $1 AND status = 'pending'", [deliveryId]);
    const claimed = (await c.query("SELECT id, body FROM public.notification_claim(100)")).rows.find((r) => r.id === deliveryId);
    await c.query("SELECT public.notification_result($1, true, 'mock', 'm-1', NULL)", [deliveryId]);
    const after = (await c.query(
      `SELECT d.status, d.body, (SELECT count(*)::int FROM public.notification_secrets WHERE delivery_id = d.id) AS secrets
       FROM public.notification_deliveries d WHERE d.id = $1`, [deliveryId])).rows[0];
    return { claimed, after };
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
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

  it("a new student's password is only in the email, never stored with a message, and deleted once the email is sent", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const fields = applicant();
    const approval = (await approve(admin, offeringId, fields)).body.data;
    const password = approval.login.temporary_password as string;
    expect(password).toEqual(expect.any(String));

    const mail = await emailOf("application_approved", fields.email);
    expect(mail.status).toBe("pending");
    expect(mail.subject).toMatch(/Application approved/);
    expect(mail.notice).not.toContain(password);
    expect(mail.body).not.toContain(password);
    expect(mail.secret).toContain(password);
    expect(await query("SELECT 1 FROM training.notifications WHERE email_secret IS NOT NULL")).toHaveLength(0);

    const { claimed, after } = await sendOnce(mail.delivery_id);
    expect(claimed.body).toContain(password); // handed to the sender...
    expect(after).toEqual({ status: "sent", body: mail.body, secrets: 0 }); // ...and gone once sent
  });

  it("new trainers' passwords are likewise kept out of the app", async () => {
    const admin = await makeAdmin();
    const email = `trainer-${uid()}@test.local`;
    const res = await admin.post("/api/admin/trainers").send({ full_name: "New Trainer", email, specialization: "Design" });
    const password = res.body.data.login.temporary_password as string;
    const mail = await emailOf("account_created", email);
    expect(mail.notice).not.toContain(password);
    expect(mail.body).not.toContain(password);
    expect(mail.secret).toContain(password);
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
  it("Training Center emails go through the platform's notification engine, once per notice", async () => {
    const { offeringId } = await openOffering(await makeAdmin());
    const fields = applicant();
    await apply(offeringId, fields);
    const mail = await emailOf("application_submitted", fields.email);
    expect(mail).toMatchObject({ status: "pending", secret: null });
    expect(mail.subject).toMatch(/ISOKO-APP-/);
    expect(mail.body).toContain(config.publicUrl + config.basePath);
    const notice = await queryOne("SELECT id, event_id FROM notifications WHERE type = 'application_submitted' AND lower(email) = $1", [fields.email]);
    // the same notice raised again is not sent again
    const again = await queryOne("SELECT public.notify_event('TRAINING_NOTICE', 'TRAINING_NOTICE:' || $1::text, 'training.notifications', $1::uuid, '[{\"email\":\"x@test.local\"}]') AS id", [notice.id]);
    expect(again.id).toBeNull();
  });

  it("someone who turned email off in Isoko doesn't get Training Center emails", async () => {
    const admin = await makeAdmin();
    const trainerEmail = `quiet-${uid()}@test.local`;
    await authAccount(trainerEmail, true);
    const user = await queryOne("SELECT id FROM auth.users WHERE email = $1", [trainerEmail]);
    await query("INSERT INTO public.notification_preferences (user_id, channel, enabled) VALUES ($1, 'email', false)", [user.id]);
    const res = await admin.post("/api/admin/trainers").send({ full_name: "Quiet Trainer", email: trainerEmail, specialization: "Web" });
    expect(res.status).toBe(201);
    const mail = await emailOf("account_created", trainerEmail);
    expect(mail).toMatchObject({ status: "skipped", secret: null });
  });
});

import { describe, expect, it } from "vitest";
import { applicant, apply, login, makeAdmin, openOffering, PASSWORD, pool, query, queryOne, uid, type Agent } from "./helpers.js";

// Training Center money runs on the platform's payment engine
// (supabase/migrations/20260925160000_training_on_engines.sql).

/** An approved student owing registration + tuition, with a signed-in portal agent. */
async function student(admin: Agent, fees: { tuition?: number; registration?: number } = { tuition: 500, registration: 50 }) {
  const { offeringId } = await openOffering(admin, fees);
  const fields = applicant();
  const ref = (await apply(offeringId, fields)).res.body.data.reference;
  const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
  const r = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
  const agent = await login(r.login.email, r.login.temporary_password);
  await agent.post("/api/auth/change-password").send({ current_password: r.login.temporary_password, new_password: PASSWORD });
  return { ...r, agent, email: fields.email as string };
}

const finance = async (admin: Agent, enrollmentId: string) => (await admin.get(`/api/admin/enrollments/${enrollmentId}/finance`)).body.data;

/** Runs SQL statements as a given Isoko user (as the website's API would), rolled back afterwards; returns the last one's first row. */
async function asUser<T>(userId: string, sql: string | string[], params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    let row: unknown;
    for (const statement of [sql].flat()) row = (await c.query(statement, params)).rows[0];
    return row as T;
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}

describe("training fees in the platform ledger", () => {
  it("fees are ledger charges on the enrollment's account, and can't be edited or deleted", async () => {
    const admin = await makeAdmin();
    const s = await student(admin);
    const account = await queryOne(
      "SELECT id, module, currency, customer_user_id FROM public.finance_accounts WHERE entity_table = 'training.enrollments' AND entity_id = $1",
      [s.enrollment_id],
    );
    expect(account).toMatchObject({ module: "training", currency: "RWF" });
    expect(account.customer_user_id).toEqual(expect.any(String)); // the student's account, set once it exists
    const charges = await query("SELECT kind, amount::float AS amount FROM public.finance_ledger WHERE account_id = $1 ORDER BY id", [account.id]);
    expect(charges).toEqual([{ kind: "charge", amount: 50 }, { kind: "charge", amount: 500 }]);
    expect(await finance(admin, s.enrollment_id)).toMatchObject({ total_fees: 550, total_paid: 0, balance: 550 });

    await expect(query("UPDATE fee_charges SET amount = 1 WHERE enrollment_id = $1", [s.enrollment_id])).rejects.toThrow(/can't be changed/);
    await expect(query("DELETE FROM fee_charges WHERE enrollment_id = $1", [s.enrollment_id])).rejects.toThrow(/can't be changed/);
    await expect(query("DELETE FROM public.finance_ledger WHERE account_id = $1", [account.id])).rejects.toThrow(/can't be changed/);

    const added = await admin.post(`/api/admin/enrollments/${s.enrollment_id}/charges`).send({ description: "Exam re-sit", amount: 25 });
    expect(added.status).toBe(201);
    expect((await finance(admin, s.enrollment_id)).balance).toBe(575);
  });

  it("a payment is checked by the engine, gets a receipt, and can't be recorded twice", async () => {
    const admin = await makeAdmin();
    const s = await student(admin);
    const reference = `MP${uid().toUpperCase()}`;

    const tooMuch = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 551, method: "cash" });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.message).toMatch(/more than the 550(\.00)? RWF balance/);
    expect((await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 50, method: "momo" })).status).toBe(400); // no reference

    const key = `retry-${uid()}`;
    const first = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 200, method: "momo", reference, idempotency_key: key });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ amount: 200, status: "successful", balance: 350 });
    expect(first.body.data.receipt_number).toMatch(/^ISK-RCPT-\d{4}-\d{5}$/);

    // the same request again (a double click, a retry): the same payment, nothing new
    const retry = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 200, method: "momo", reference, idempotency_key: key });
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    const { user_id } = await queryOne("SELECT user_id FROM students WHERE id = $1", [s.student_id]);
    expect(await query("SELECT 1 FROM notifications WHERE type = 'payment_received' AND user_id = $1", [user_id])).toHaveLength(1);

    // the same mobile-money reference is money received once, whoever records it
    const again = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 100, method: "momo", reference: reference.toLowerCase() });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already recorded/);

    const f = await finance(admin, s.enrollment_id);
    expect(f).toMatchObject({ total_paid: 200, balance: 350, payment_status: "partially_paid" });
    expect(f.payments).toHaveLength(1);
    // ... and it counts wherever money is shown
    expect((await admin.get("/api/admin/payments").query({ q: reference })).body.data.total).toBe(200);
  });

  it("the student hears about the payment through the notification engine", async () => {
    const admin = await makeAdmin();
    const s = await student(admin);
    const p = (await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 100, method: "cash" })).body.data;
    const email = await queryOne(
      `SELECT d.recipient_address, d.body FROM public.notification_events e
       JOIN public.notification_deliveries d ON d.event_id = e.id AND d.channel = 'email'
       WHERE e.event_key = 'PAYMENT_SUCCESSFUL:' || $1`,
      [p.id],
    );
    expect(email.recipient_address).toBe(s.email.toLowerCase());
    expect(email.body).toMatch(/100 RWF/);
  });

  it("refunds, voids, discounts and waivers go through the engine with a reason", async () => {
    const admin = await makeAdmin();
    const s = await student(admin, { tuition: 1000, registration: 0 });
    const p = (await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollment_id, amount: 600, method: "bank", reference: `BK${uid()}` })).body.data;

    expect((await admin.post(`/api/admin/payments/${p.id}/refund`).send({ amount: 100, reason: "x" })).status).toBe(400);
    expect((await admin.post(`/api/admin/payments/${p.id}/refund`).send({ amount: 601, reason: "Overcharged" })).status).toBe(400);
    const refund = await admin.post(`/api/admin/payments/${p.id}/refund`).send({ amount: 100, reason: "Left the program early" });
    expect(refund.status).toBe(200);
    expect(refund.body.data).toMatchObject({ status: "partially_refunded", refunded_amount: 100 });
    expect(await finance(admin, s.enrollment_id)).toMatchObject({ total_paid: 500, balance: 500 });
    // a refunded payment can't be voided: the money did arrive
    expect((await admin.post(`/api/admin/payments/${p.id}/void`).send({ reason: "Entered by mistake" })).status).toBe(400);

    expect((await admin.post(`/api/admin/enrollments/${s.enrollment_id}/adjustments`).send({ kind: "waiver", amount: 501, reason: "Scholarship" })).status).toBe(400);
    const waiver = await admin.post(`/api/admin/enrollments/${s.enrollment_id}/adjustments`).send({ kind: "waiver", amount: 200, reason: "Scholarship" });
    expect(waiver.status).toBe(201);
    const f = await finance(admin, s.enrollment_id);
    expect(f).toMatchObject({ total_fees: 800, total_paid: 500, balance: 300 });
    expect(f.adjustments).toEqual([expect.objectContaining({ kind: "waiver", amount: -200, reason: "Scholarship" })]);

    const ledger = await query(
      `SELECT l.kind, l.reason, l.created_by FROM public.finance_ledger l JOIN public.finance_accounts a ON a.id = l.account_id
       WHERE a.entity_id = $1 AND l.kind IN ('refund', 'waiver') ORDER BY l.id`,
      [s.enrollment_id],
    );
    const adminId = (await queryOne("SELECT recorded_by FROM payments WHERE id = $1", [p.id])).recorded_by;
    expect(ledger).toEqual([
      { kind: "refund", reason: "Left the program early", created_by: adminId },
      { kind: "waiver", reason: "Scholarship", created_by: adminId },
    ]);
  });

  it("only Training Center admins (and Isoko finance staff) can handle training money", async () => {
    const admin = await makeAdmin();
    const s = await student(admin);
    const studentUser = (await queryOne("SELECT user_id FROM students WHERE id = $1", [s.student_id])).user_id;
    const call = "SELECT public.finance_record_payment('training.enrollments', $1, 10, 'cash', '') AS id";
    await expect(asUser(studentUser, call, [s.enrollment_id])).rejects.toThrow(/can't record payments/);
    const waive = "SELECT public.finance_adjust('training.enrollments', $1, 'waiver', 550, 'Free for me')";
    await expect(asUser(studentUser, waive, [s.enrollment_id])).rejects.toThrow(/Only finance staff/);

    // A training admin can, through the platform's functions too; the database issues the receipt
    const adminId = (await queryOne("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at DESC LIMIT 1")).id;
    const viaRpc = await asUser<{ receipt: string }>(
      adminId,
      [
        "SELECT public.finance_record_payment('training.enrollments', $1, 10, 'cash', '') AS id",
        `SELECT r.receipt_number AS receipt FROM training.receipts r JOIN payments p ON p.id = r.payment_id
         WHERE p.enrollment_id = $1`,
      ],
      [s.enrollment_id],
    );
    expect(viaRpc.receipt).toMatch(/^ISK-RCPT-/);
    // ... but not once deactivated
    await query("UPDATE users SET is_active = false WHERE id = $1", [adminId]);
    await expect(asUser(adminId, call, [s.enrollment_id])).rejects.toThrow(/can't record payments/);
  });

  it("the history before the engine can't be written any more", async () => {
    await expect(query("INSERT INTO payments_legacy (enrollment_id, amount, method, paid_on) SELECT id, 1, 'cash', current_date FROM enrollments LIMIT 1"))
      .rejects.toThrow(/can't be changed/);
    await expect(query("INSERT INTO payments (enrollment_id, amount, method, paid_on) SELECT id, 1, 'cash', current_date FROM enrollments LIMIT 1"))
      .rejects.toThrow();
  });

  it("the currency can't change once fees are charged", async () => {
    const admin = await makeAdmin();
    await student(admin);
    const center = (await admin.get("/api/admin/settings")).body.data.center;
    const res = await admin.put("/api/admin/settings/center").send({ ...center, currency: center.currency === "USD" ? "EUR" : "USD" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/currency can't change/);
    expect((await admin.put("/api/admin/settings/center").send({ ...center, currency: "KES" })).status).toBe(400);
  });
});

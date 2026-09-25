import { Router } from "express";
import { z } from "zod";
import { actAs, query, queryOne, withTransaction, type Queryable } from "../../db.js";
import { badRequest, dbRules, notFound, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { financeFor } from "../../services/metrics.js";
import { notify } from "../../services/notifications.js";
import { receiptPdf } from "../../services/pdf.js";
import { getSetting, today } from "../../services/settings.js";

export const financeRouter = Router();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)");

financeRouter.get("/payments", async (req, res) => {
  const f = parse(
    z.object({ from: date.optional(), to: date.optional(), intake_id: uuid.optional(), program_id: uuid.optional(), q: z.string().trim().max(100).optional(), include_void: z.enum(["1"]).optional() }),
    req.query,
  );
  const rows = await query(
    `SELECT pay.id, pay.amount, pay.refunded_amount, pay.status, pay.method, pay.reference, pay.paid_on, pay.notes, pay.recorded_at, pay.voided_at, pay.void_reason,
            r.receipt_number, s.id AS student_id, s.student_number, s.full_name, e.id AS enrollment_id,
            p.name AS program_name, i.name AS intake_name, u.full_name AS recorded_by_name
     FROM payments pay JOIN receipts r ON r.payment_id = pay.id
     JOIN enrollments e ON e.id = pay.enrollment_id JOIN students s ON s.id = e.student_id
     JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs p ON p.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id LEFT JOIN users u ON u.id = pay.recorded_by
     WHERE ($1::date IS NULL OR pay.paid_on >= $1) AND ($2::date IS NULL OR pay.paid_on <= $2)
       AND ($3::uuid IS NULL OR i.id = $3) AND ($4::uuid IS NULL OR p.id = $4)
       AND ($5::text IS NULL OR s.full_name ILIKE '%' || $5 || '%' OR s.student_number ILIKE '%' || $5 || '%'
            OR r.receipt_number ILIKE '%' || $5 || '%' OR pay.reference ILIKE '%' || $5 || '%')
       AND ($6::boolean OR pay.voided_at IS NULL)
     ORDER BY pay.paid_on DESC, pay.recorded_at DESC LIMIT 1000`,
    [f.from ?? null, f.to ?? null, f.intake_id ?? null, f.program_id ?? null, f.q || null, f.include_void === "1"],
  );
  const total = rows.filter((r) => !r.voided_at).reduce((s, r) => s + r.amount - r.refunded_amount, 0);
  res.json({ data: { items: rows, total } });
});

// Everything about one enrollment's money: fees, reductions, payments, balance.
financeRouter.get("/enrollments/:id/finance", async (req, res) => {
  const id = param(req, "id");
  const e = await queryOne(
    `SELECT e.id, s.full_name, s.student_number, p.name AS program_name, i.name AS intake_name
     FROM enrollments e JOIN students s ON s.id = e.student_id JOIN intake_programs ip ON ip.id = e.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id WHERE e.id = $1`,
    [id],
  );
  if (!e) throw notFound("Enrollment not found");
  const [charges, adjustments, payments, fin] = await Promise.all([
    query("SELECT * FROM fee_charges WHERE enrollment_id = $1 ORDER BY created_at", [id]),
    // discounts and waivers (negative) and corrections either way
    query(
      `SELECT l.id, l.kind, l.amount, l.reason, l.created_at FROM public.finance_ledger l
       JOIN public.finance_accounts a ON a.id = l.account_id
       WHERE a.entity_table = 'training.enrollments' AND a.entity_id = $1
         AND (l.kind IN ('discount', 'waiver') OR (l.kind = 'adjustment' AND l.source <> 'price'))
       ORDER BY l.id`,
      [id],
    ),
    query(
      `SELECT p.*, r.receipt_number FROM payments p JOIN receipts r ON r.payment_id = p.id
       WHERE p.enrollment_id = $1 ORDER BY p.paid_on DESC, p.recorded_at DESC`,
      [id],
    ),
    financeFor([id]),
  ]);
  res.json({ data: { ...e, charges, adjustments, payments, ...fin.get(id)! } });
});

// Fees are posted to the enrollment's account in the platform ledger by the database.
financeRouter.post("/enrollments/:id/charges", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const b = parse(
    z.object({ type: z.enum(["registration", "tuition", "other"]).default("other"), description: z.string().trim().min(2).max(200), amount: z.coerce.number().positive().max(1_000_000_000) }),
    req.body,
  );
  const row = await withTransaction(async (c) => {
    const e = await queryOne("SELECT id FROM enrollments WHERE id = $1", [id], c);
    if (!e) throw notFound("Enrollment not found");
    await actAs(c, admin.id);
    const fee = await dbRules(
      queryOne(
        "INSERT INTO fee_charges (enrollment_id, type, description, amount, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [id, b.type, b.description, b.amount, admin.id],
        c,
      ),
    );
    await logActivity(admin.id, "fee.added", "enrollment", id, { amount: b.amount, description: b.description }, c);
    return fee;
  });
  res.status(201).json({ data: row });
});

// A discount or waiver lowers what the student owes; fees themselves never change.
financeRouter.post("/enrollments/:id/adjustments", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const b = parse(
    z.object({
      kind: z.enum(["discount", "waiver"]),
      amount: z.coerce.number().positive("Enter the amount").max(1_000_000_000),
      reason: z.string().trim().min(3, "Say why").max(500),
    }),
    req.body,
  );
  await withTransaction(async (c) => {
    const fin = (await financeFor([id], c)).get(id);
    if (!fin) throw notFound("Enrollment not found");
    if (b.amount > fin.balance + 0.001) throw badRequest("That's more than the student still owes");
    await actAs(c, admin.id);
    await dbRules(c.query("SELECT public.finance_adjust('training.enrollments', $1, $2, $3, $4)", [id, b.kind, b.amount, b.reason]));
    await logActivity(admin.id, `fee.${b.kind}`, "enrollment", id, { amount: b.amount, reason: b.reason }, c);
  });
  res.status(201).json({ data: (await financeFor([id])).get(id) });
});

// Records a payment through the platform's payment engine, which refuses more
// than the balance and a mobile-money/bank/card reference already recorded; the
// database issues the receipt. A retry with the same idempotency_key returns the
// first payment.
financeRouter.post("/payments", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(
    z.object({
      enrollment_id: uuid,
      amount: z.coerce.number().positive("Enter the amount received").max(1_000_000_000),
      method: z.enum(["cash", "momo", "bank", "card", "other"]),
      reference: z.string().trim().max(100).default(""),
      paid_on: date.optional(),
      notes: z.string().trim().max(500).default(""),
      idempotency_key: z.string().trim().min(8).max(100).optional(),
    }),
    req.body,
  );
  const paidOn = b.paid_on ?? (await today());
  if (paidOn > (await today())) throw badRequest("The payment date can't be in the future");
  const center = await getSetting("center");
  const payment = await withTransaction(async (c) => {
    const e = await queryOne(
      "SELECT e.id, s.full_name, s.user_id FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.id = $1",
      [b.enrollment_id],
      c,
    );
    if (!e) throw notFound("Enrollment not found");
    await actAs(c, admin.id);
    const key = b.idempotency_key ? `training:${b.idempotency_key}` : null;
    const earlier = key ? await queryOne("SELECT id FROM public.finance_payments WHERE idempotency_key = $1", [key], c) : null;
    const { id } = (await dbRules(
      queryOne<{ id: string }>(
        "SELECT public.finance_record_payment('training.enrollments', $1, $2, $3, $4, $5, $6, $7) AS id",
        [e.id, b.amount, b.method, b.reference, b.notes, key, paidOn],
        c,
      ),
    ))!;
    const p = await queryOne("SELECT p.*, r.receipt_number FROM payments p JOIN receipts r ON r.payment_id = p.id WHERE p.id = $1", [id], c);
    const balance = (await financeFor([e.id], c)).get(e.id)!.balance;
    if (!earlier) {
      await logActivity(admin.id, "payment.recorded", "payment", id, { amount: b.amount, receipt: p!.receipt_number }, c);
      // In the portal; the emailed receipt comes from the notification engine
      await notify(
        {
          userId: e.user_id,
          type: "payment_received",
          title: `Payment received — ${p!.receipt_number}`,
          body: `Dear ${e.full_name}, we received ${center.currency} ${Number(p!.amount).toLocaleString("en-US")} on ${p!.paid_on}. Remaining balance: ${center.currency} ${Math.max(balance, 0).toLocaleString("en-US")}.`,
          link: "/student/payments",
        },
        c,
      );
    }
    return { ...p, balance };
  });
  res.status(201).json({ data: payment });
});

/** A Training Center payment, as the API shows it. */
async function trainingPayment(c: Queryable, id: string) {
  const p = await queryOne("SELECT * FROM payments WHERE id = $1", [id], c);
  if (!p) throw notFound("Payment not found");
  return p;
}

// Payments are never deleted: a wrong entry is voided with a reason and stays on record.
financeRouter.post("/payments/:id/void", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Say why this payment is voided").max(300) }), req.body);
  const row = await withTransaction(async (c) => {
    await trainingPayment(c, id);
    await actAs(c, admin.id);
    await dbRules(c.query("SELECT public.finance_void_payment($1, $2)", [id, reason]));
    const p = await trainingPayment(c, id);
    await logActivity(admin.id, "payment.voided", "payment", id, { reason, amount: p.amount }, c);
    return p;
  });
  res.json({ data: row });
});

// Money given back to the student (all or part of a payment), with a reason.
financeRouter.post("/payments/:id/refund", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const b = parse(
    z.object({
      amount: z.coerce.number().positive("Enter the amount refunded").max(1_000_000_000),
      reason: z.string().trim().min(3, "Say why the money is refunded").max(500),
      idempotency_key: z.string().trim().min(8).max(100).optional(),
    }),
    req.body,
  );
  const row = await withTransaction(async (c) => {
    await trainingPayment(c, id);
    await actAs(c, admin.id);
    await dbRules(
      c.query("SELECT public.finance_refund_payment($1, $2, $3, $4)", [
        id, b.amount, b.reason, b.idempotency_key ? `training-refund:${b.idempotency_key}` : null,
      ]),
    );
    const p = await trainingPayment(c, id);
    await logActivity(admin.id, "payment.refunded", "payment", id, { amount: b.amount, reason: b.reason }, c);
    return p;
  });
  res.json({ data: row });
});

financeRouter.get("/payments/:id/receipt", async (req, res) => {
  const { pdf, filename } = await receiptPdf(param(req, "id"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(pdf);
});

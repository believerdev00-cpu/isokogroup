import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db.js";
import { badRequest, notFound, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { financeFor } from "../../services/metrics.js";
import { notify } from "../../services/notifications.js";
import { nextNumber } from "../../services/numbers.js";
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
    `SELECT pay.id, pay.amount, pay.method, pay.reference, pay.paid_on, pay.notes, pay.recorded_at, pay.voided_at, pay.void_reason,
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
  const total = rows.filter((r) => !r.voided_at).reduce((s, r) => s + r.amount, 0);
  res.json({ data: { items: rows, total } });
});

// Everything about one enrollment's money: fees, payments, balance.
financeRouter.get("/enrollments/:id/finance", async (req, res) => {
  const id = param(req, "id");
  const e = await queryOne(
    `SELECT e.id, s.full_name, s.student_number, p.name AS program_name, i.name AS intake_name
     FROM enrollments e JOIN students s ON s.id = e.student_id JOIN intake_programs ip ON ip.id = e.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id WHERE e.id = $1`,
    [id],
  );
  if (!e) throw notFound("Enrollment not found");
  const [charges, payments, fin] = await Promise.all([
    query("SELECT * FROM fee_charges WHERE enrollment_id = $1 ORDER BY created_at", [id]),
    query("SELECT p.*, r.receipt_number FROM payments p JOIN receipts r ON r.payment_id = p.id WHERE p.enrollment_id = $1 ORDER BY p.paid_on DESC", [id]),
    financeFor([id]),
  ]);
  res.json({ data: { ...e, charges, payments, ...fin.get(id)! } });
});

financeRouter.post("/enrollments/:id/charges", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const b = parse(
    z.object({ type: z.enum(["registration", "tuition", "other"]).default("other"), description: z.string().trim().min(2).max(200), amount: z.coerce.number().positive().max(1_000_000_000) }),
    req.body,
  );
  const e = await queryOne("SELECT id FROM enrollments WHERE id = $1", [id]);
  if (!e) throw notFound("Enrollment not found");
  const row = await queryOne(
    "INSERT INTO fee_charges (enrollment_id, type, description, amount, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [id, b.type, b.description, b.amount, admin.id],
  );
  await logActivity(admin.id, "fee.added", "enrollment", id, { amount: b.amount, description: b.description });
  res.status(201).json({ data: row });
});

// Records a payment and issues its receipt. Paying more than the balance is refused,
// which catches typing mistakes.
financeRouter.post("/payments", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(
    z.object({
      enrollment_id: uuid,
      amount: z.coerce.number().positive("Enter the amount received").max(1_000_000_000),
      method: z.enum(["cash", "momo", "bank", "card", "other"]),
      reference: z.string().trim().max(120).default(""),
      paid_on: date.optional(),
      notes: z.string().trim().max(1000).default(""),
    }),
    req.body,
  );
  const paidOn = b.paid_on ?? (await today());
  if (paidOn > (await today())) throw badRequest("The payment date can't be in the future");
  const center = await getSetting("center");
  const payment = await withTransaction(async (c) => {
    const e = await queryOne(
      `SELECT e.id, s.full_name, s.email, s.user_id, i.training_starts_on FROM enrollments e
       JOIN students s ON s.id = e.student_id JOIN intake_programs ip ON ip.id = e.intake_program_id
       JOIN intakes i ON i.id = ip.intake_id WHERE e.id = $1 FOR UPDATE OF e`,
      [b.enrollment_id],
      c,
    );
    if (!e) throw notFound("Enrollment not found");
    const fin = (await financeFor([e.id], c)).get(e.id)!;
    if (b.amount > fin.balance + 0.001) {
      throw badRequest(`That's more than the balance (${center.currency} ${fin.balance.toLocaleString("en-US")}). Add the fee first if something else is being paid.`);
    }
    const p = await queryOne(
      `INSERT INTO payments (enrollment_id, amount, method, reference, paid_on, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [e.id, b.amount, b.method, b.reference, paidOn, b.notes, admin.id],
      c,
    );
    const receiptNumber = await nextNumber("receipt", Number(paidOn.slice(0, 4)), c);
    await c.query("INSERT INTO receipts (payment_id, receipt_number) VALUES ($1, $2)", [p!.id, receiptNumber]);
    await logActivity(admin.id, "payment.recorded", "payment", p!.id, { amount: b.amount, receipt: receiptNumber }, c);
    const balance = fin.balance - b.amount;
    await notify(
      {
        userId: e.user_id,
        email: e.email,
        type: "payment_received",
        title: `Payment received — ${receiptNumber}`,
        body: `Dear ${e.full_name}, we received ${center.currency} ${b.amount.toLocaleString("en-US")} on ${paidOn}. Remaining balance: ${center.currency} ${Math.max(balance, 0).toLocaleString("en-US")}.`,
        link: "/student/payments",
      },
      c,
    );
    return { ...p, receipt_number: receiptNumber, balance };
  });
  res.status(201).json({ data: payment });
});

// Payments are never deleted: a wrong entry is voided with a reason and stays on record.
financeRouter.post("/payments/:id/void", async (req, res) => {
  const admin = currentUser(req);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Say why this payment is voided").max(300) }), req.body);
  const row = await queryOne(
    "UPDATE payments SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1 AND voided_at IS NULL RETURNING *",
    [param(req, "id"), admin.id, reason],
  );
  if (!row) throw badRequest("Payment not found or already voided");
  await logActivity(admin.id, "payment.voided", "payment", row.id, { reason, amount: row.amount });
  res.json({ data: row });
});

financeRouter.get("/payments/:id/receipt", async (req, res) => {
  const { pdf, filename } = await receiptPdf(param(req, "id"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(pdf);
});

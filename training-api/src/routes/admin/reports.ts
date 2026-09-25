import { Router } from "express";
import { z } from "zod";
import { query } from "../../db.js";
import { parse, uuid } from "../../lib/http.js";
import { summariesFor } from "../../services/metrics.js";

export const reportsRouter = Router();

const filters = z.object({
  intake_id: uuid.optional(),
  program_id: uuid.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().trim().max(30).optional(),
  q: z.string().trim().max(100).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
type Filters = z.infer<typeof filters>;
type Column = { key: string; label: string };
type Report = { title: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };

// Enrollment rows with the usual filters; most reports start from these.
async function enrollmentRows(f: Filters) {
  return query(
    `SELECT e.id AS enrollment_id, s.student_number, s.full_name, s.phone, s.email, p.name AS program, i.name AS intake,
            cl.code AS class, e.status, to_char(e.enrolled_on, 'YYYY-MM-DD') AS enrolled_on,
            to_char(e.completed_on, 'YYYY-MM-DD') AS completed_on
     FROM enrollments e JOIN students s ON s.id = e.student_id
     JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs p ON p.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id
     LEFT JOIN class_students cs ON cs.enrollment_id = e.id LEFT JOIN classes cl ON cl.id = cs.class_id
     WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::uuid IS NULL OR p.id = $2)
       AND ($3::date IS NULL OR e.enrolled_on >= $3) AND ($4::date IS NULL OR e.enrolled_on <= $4)
       AND ($5::text IS NULL OR e.status = $5)
       AND ($6::text IS NULL OR s.full_name ILIKE '%' || $6 || '%' OR s.student_number ILIKE '%' || $6 || '%')
     ORDER BY i.training_starts_on DESC, p.name, s.full_name`,
    [f.intake_id ?? null, f.program_id ?? null, f.from ?? null, f.to ?? null, f.status || null, f.q || null],
  );
}

const STUDENT_COLS: Column[] = [
  { key: "student_number", label: "Student no." },
  { key: "full_name", label: "Name" },
  { key: "program", label: "Program" },
  { key: "intake", label: "Intake" },
];

const REPORTS: Record<string, (f: Filters) => Promise<Report>> = {
  async enrollment(f) {
    return {
      title: "Student enrollment",
      columns: [...STUDENT_COLS, { key: "class", label: "Class" }, { key: "phone", label: "Phone" }, { key: "status", label: "Status" }, { key: "enrolled_on", label: "Enrolled" }],
      rows: await enrollmentRows(f),
    };
  },

  async intake(f) {
    const rows = await query(
      `SELECT i.name AS intake, i.status, to_char(i.application_closes_on, 'YYYY-MM-DD') AS deadline,
              to_char(i.training_starts_on, 'YYYY-MM-DD') AS training_starts, count(DISTINCT ip.id)::int AS programs,
              (SELECT coalesce(sum(capacity), 0) FROM intake_program_stats x WHERE x.intake_id = i.id)::int AS capacity,
              (SELECT coalesce(sum(enrolled), 0) FROM intake_program_stats x WHERE x.intake_id = i.id)::int AS enrolled,
              (SELECT count(*) FROM applications a JOIN intake_programs x ON x.id = a.intake_program_id WHERE x.intake_id = i.id)::int AS applications,
              (SELECT count(*) FROM applications a JOIN intake_programs x ON x.id = a.intake_program_id WHERE x.intake_id = i.id AND a.status IN ('pending', 'under_review'))::int AS pending
       FROM intakes i LEFT JOIN intake_programs ip ON ip.intake_id = i.id
       WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::text IS NULL OR i.status = $2)
       GROUP BY i.id ORDER BY i.training_starts_on DESC`,
      [f.intake_id ?? null, f.status || null],
    );
    return {
      title: "Intakes",
      columns: [
        { key: "intake", label: "Intake" }, { key: "status", label: "Status" }, { key: "deadline", label: "Deadline" },
        { key: "training_starts", label: "Training starts" }, { key: "programs", label: "Programs" }, { key: "capacity", label: "Seats" },
        { key: "enrolled", label: "Enrolled" }, { key: "applications", label: "Applications" }, { key: "pending", label: "Pending" },
      ],
      rows,
    };
  },

  async program(f) {
    const rows = await query(
      `SELECT p.name AS program, p.category, i.name AS intake, s.capacity, s.enrolled, s.available_seats,
              (SELECT count(*) FROM applications a WHERE a.intake_program_id = ip.id)::int AS applications,
              (SELECT count(*) FROM enrollments e WHERE e.intake_program_id = ip.id AND e.status = 'completed')::int AS completed
       FROM intake_programs ip JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
       JOIN intake_program_stats s ON s.intake_program_id = ip.id
       WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::uuid IS NULL OR p.id = $2)
       ORDER BY p.name, i.training_starts_on DESC`,
      [f.intake_id ?? null, f.program_id ?? null],
    );
    return {
      title: "Programs by intake",
      columns: [
        { key: "program", label: "Program" }, { key: "category", label: "Category" }, { key: "intake", label: "Intake" },
        { key: "capacity", label: "Seats" }, { key: "enrolled", label: "Enrolled" }, { key: "available_seats", label: "Available" },
        { key: "applications", label: "Applications" }, { key: "completed", label: "Completed" },
      ],
      rows,
    };
  },

  async attendance(f) {
    const rows = await enrollmentRows(f);
    const s = await summariesFor(rows.map((r) => r.enrollment_id));
    return {
      title: "Attendance",
      columns: [...STUDENT_COLS, { key: "class", label: "Class" }, { key: "sessions", label: "Sessions" }, { key: "present", label: "Present" },
        { key: "late", label: "Late" }, { key: "absent", label: "Absent" }, { key: "excused", label: "Excused" }, { key: "rate", label: "Attendance %" }],
      rows: rows.map((r) => ({ ...r, ...s.get(r.enrollment_id)!.attendance })),
    };
  },

  async payments(f) {
    const rows = await query(
      `SELECT r.receipt_number, to_char(pay.paid_on, 'YYYY-MM-DD') AS paid_on, s.student_number, s.full_name, p.name AS program,
              i.name AS intake, pay.method, pay.reference, pay.amount, pay.refunded_amount, u.full_name AS recorded_by
       FROM payments pay JOIN receipts r ON r.payment_id = pay.id JOIN enrollments e ON e.id = pay.enrollment_id
       JOIN students s ON s.id = e.student_id JOIN intake_programs ip ON ip.id = e.intake_program_id
       JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id LEFT JOIN users u ON u.id = pay.recorded_by
       WHERE pay.voided_at IS NULL AND ($1::uuid IS NULL OR i.id = $1) AND ($2::uuid IS NULL OR p.id = $2)
         AND ($3::date IS NULL OR pay.paid_on >= $3) AND ($4::date IS NULL OR pay.paid_on <= $4)
         AND ($5::text IS NULL OR s.full_name ILIKE '%' || $5 || '%' OR s.student_number ILIKE '%' || $5 || '%')
       ORDER BY pay.paid_on DESC`,
      [f.intake_id ?? null, f.program_id ?? null, f.from ?? null, f.to ?? null, f.q || null],
    );
    return {
      title: "Payments",
      columns: [{ key: "receipt_number", label: "Receipt" }, { key: "paid_on", label: "Date" }, ...STUDENT_COLS,
        { key: "method", label: "Method" }, { key: "reference", label: "Reference" }, { key: "amount", label: "Amount" }, { key: "refunded_amount", label: "Refunded" }, { key: "recorded_by", label: "Recorded by" }],
      rows,
      totals: { amount: rows.reduce((s, r) => s + r.amount, 0), refunded_amount: rows.reduce((s, r) => s + r.refunded_amount, 0) },
    };
  },

  async outstanding(f) {
    const rows = (await enrollmentRows({ ...f, status: f.status || undefined })).filter((r) => r.status !== "withdrawn");
    const s = await summariesFor(rows.map((r) => r.enrollment_id));
    const withBalance = rows
      .map((r) => ({ ...r, ...s.get(r.enrollment_id)!.finance }))
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    return {
      title: "Outstanding fees",
      columns: [...STUDENT_COLS, { key: "phone", label: "Phone" }, { key: "total_fees", label: "Fees" }, { key: "total_paid", label: "Paid" },
        { key: "balance", label: "Balance" }, { key: "payment_status", label: "Status" }],
      rows: withBalance,
      totals: { balance: withBalance.reduce((t, r) => t + r.balance, 0) },
    };
  },

  async results(f) {
    const rows = await enrollmentRows(f);
    const s = await summariesFor(rows.map((r) => r.enrollment_id));
    return {
      title: "Assessment results",
      columns: [...STUDENT_COLS, { key: "class", label: "Class" }, { key: "marked", label: "Marked" }, { key: "percentage", label: "Average %" },
        { key: "final_percentage", label: "Final %" }, { key: "grade", label: "Grade" }, { key: "result", label: "Result" }],
      rows: rows.map((r) => {
        const x = s.get(r.enrollment_id)!.results;
        return { ...r, marked: `${x.assessments_completed}/${x.assessments_total}`, percentage: x.percentage, final_percentage: x.final_percentage,
          grade: x.grade, result: x.passed === null ? "In progress" : x.passed ? "Pass" : "Fail" };
      }),
    };
  },

  async completion(f) {
    const rows = await query(
      `SELECT i.name AS intake, p.name AS program, count(e.id)::int AS enrolled,
              count(e.id) FILTER (WHERE e.status = 'active')::int AS active,
              count(e.id) FILTER (WHERE e.status = 'completed')::int AS completed,
              count(e.id) FILTER (WHERE e.status = 'withdrawn')::int AS withdrawn,
              count(c.id) FILTER (WHERE c.revoked_at IS NULL)::int AS certificates
       FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id JOIN programs p ON p.id = ip.program_id
       LEFT JOIN enrollments e ON e.intake_program_id = ip.id LEFT JOIN certificates c ON c.enrollment_id = e.id
       WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::uuid IS NULL OR p.id = $2)
       GROUP BY i.id, p.id ORDER BY i.training_starts_on DESC, p.name`,
      [f.intake_id ?? null, f.program_id ?? null],
    );
    return {
      title: "Completion",
      columns: [{ key: "intake", label: "Intake" }, { key: "program", label: "Program" }, { key: "enrolled", label: "Enrolled" },
        { key: "active", label: "Active" }, { key: "completed", label: "Completed" }, { key: "withdrawn", label: "Withdrawn" }, { key: "certificates", label: "Certificates" },
        { key: "completion_rate", label: "Completion %" }],
      rows: rows.map((r) => ({ ...r, completion_rate: r.enrolled ? Math.round((r.completed / r.enrolled) * 100) : 0 })),
    };
  },

  async certificates(f) {
    const rows = await query(
      `SELECT c.certificate_number, c.verification_code, c.student_name AS full_name, s.student_number, c.program_name AS program,
              c.intake_name AS intake, c.final_grade, to_char(c.issued_on, 'YYYY-MM-DD') AS issued_on,
              CASE WHEN c.revoked_at IS NULL THEN 'Valid' ELSE 'Revoked' END AS status
       FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN students s ON s.id = e.student_id
       JOIN intake_programs ip ON ip.id = e.intake_program_id
       WHERE ($1::uuid IS NULL OR ip.intake_id = $1) AND ($2::uuid IS NULL OR ip.program_id = $2)
         AND ($3::date IS NULL OR c.issued_on >= $3) AND ($4::date IS NULL OR c.issued_on <= $4)
       ORDER BY c.issued_on DESC`,
      [f.intake_id ?? null, f.program_id ?? null, f.from ?? null, f.to ?? null],
    );
    return {
      title: "Certificates",
      columns: [{ key: "certificate_number", label: "Certificate" }, ...STUDENT_COLS, { key: "final_grade", label: "Grade" },
        { key: "issued_on", label: "Issued" }, { key: "status", label: "Status" }],
      rows,
    };
  },
};

export const REPORT_TYPES = Object.keys(REPORTS);

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas and quote anything with separators
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

reportsRouter.get("/reports/:type", async (req, res) => {
  const type = parse(z.enum(REPORT_TYPES as [string, ...string[]]), req.params.type);
  const f = parse(filters, req.query);
  const report = await REPORTS[type](f);
  if (f.format === "csv") {
    const lines = [report.columns.map((c) => csvCell(c.label)).join(","), ...report.rows.map((r) => report.columns.map((c) => csvCell(r[c.key])).join(","))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="isoko-${type}-report.csv"`);
    res.send("﻿" + lines.join("\r\n"));
    return;
  }
  res.json({ data: report });
});

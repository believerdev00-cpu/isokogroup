import { Router, type Request } from "express";
import { query, queryOne } from "../db.js";
import { notFound, param } from "../lib/http.js";
import { currentStudentId, requireRole } from "../middleware/auth.js";
import { summariesFor } from "../services/metrics.js";
import { certificatePdf, receiptPdf } from "../services/pdf.js";
import { getSetting } from "../services/settings.js";

// A student's own records only: every query is scoped to the signed-in student.
export const studentRouter = Router();
studentRouter.use(requireRole("student"));

const ENROLLMENTS = `
  SELECT e.id, e.status, e.enrolled_on, e.completed_on,
         p.id AS program_id, p.name AS program_name, p.code AS program_code, p.duration_value, p.duration_unit,
         p.description AS program_description, p.course_content,
         i.id AS intake_id, i.name AS intake_name, i.training_starts_on, i.training_ends_on, i.location,
         cl.id AS class_id, cl.code AS class_code, cl.room, cl.meeting_days,
         to_char(cl.start_time, 'HH24:MI') AS start_time, to_char(cl.end_time, 'HH24:MI') AS end_time,
         tu.full_name AS trainer_name, tu.email AS trainer_email
  FROM enrollments e
  JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs p ON p.id = ip.program_id
  JOIN intakes i ON i.id = ip.intake_id
  LEFT JOIN class_students cs ON cs.enrollment_id = e.id LEFT JOIN classes cl ON cl.id = cs.class_id
  LEFT JOIN trainers t ON t.id = cl.trainer_id LEFT JOIN users tu ON tu.id = t.user_id
  WHERE e.student_id = $1`;

async function myEnrollments(studentId: string) {
  const rows = await query(`${ENROLLMENTS} ORDER BY i.training_starts_on DESC`, [studentId]);
  const summaries = await summariesFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...summaries.get(r.id)! }));
}

async function ownEnrollment(req: Request, enrollmentId: string) {
  const studentId = await currentStudentId(req);
  const e = await queryOne("SELECT id FROM enrollments WHERE id = $1 AND student_id = $2", [enrollmentId, studentId]);
  if (!e) throw notFound("Enrollment not found");
  return e.id as string;
}

studentRouter.get("/dashboard", async (req, res) => {
  const studentId = await currentStudentId(req);
  const student = await queryOne(
    `SELECT id, student_number, full_name, email, phone, address, date_of_birth, gender,
            emergency_contact_name, emergency_contact_phone, created_at, (photo_path IS NOT NULL) AS has_photo
     FROM students WHERE id = $1`,
    [studentId],
  );
  const [center, requirements, grading] = await Promise.all([
    getSetting("center"),
    getSetting("certificate_requirements"),
    getSetting("grading"),
  ]);
  res.json({
    data: {
      student,
      currency: center.currency,
      // What the certificate needs, so the portal can show the student where they stand
      certificate_requirements: { ...requirements, pass_mark: grading.pass_mark },
      enrollments: await myEnrollments(studentId),
    },
  });
});

studentRouter.get("/enrollments", async (req, res) => {
  res.json({ data: await myEnrollments(await currentStudentId(req)) });
});

studentRouter.get("/enrollments/:id/attendance", async (req, res) => {
  const id = await ownEnrollment(req, param(req, "id"));
  res.json({
    data: await query(
      `SELECT cs.session_date, cs.topic, a.status, a.note FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id WHERE a.enrollment_id = $1 ORDER BY cs.session_date DESC`,
      [id],
    ),
  });
});

// Assignments and other assessments of the student's class, with their own marks.
studentRouter.get("/enrollments/:id/assessments", async (req, res) => {
  const id = await ownEnrollment(req, param(req, "id"));
  res.json({
    data: await query(
      `SELECT a.id, a.type, a.title, a.description, a.due_date, a.max_marks, a.weight, r.marks, r.feedback, r.recorded_at
       FROM class_students cs JOIN assessments a ON a.class_id = cs.class_id
       LEFT JOIN assessment_results r ON r.assessment_id = a.id AND r.enrollment_id = cs.enrollment_id
       WHERE cs.enrollment_id = $1
       ORDER BY coalesce(a.due_date, a.created_at::date)`,
      [id],
    ),
  });
});

studentRouter.get("/enrollments/:id/payments", async (req, res) => {
  const id = await ownEnrollment(req, param(req, "id"));
  const [charges, adjustments, payments] = await Promise.all([
    query("SELECT id, type, description, amount, created_at FROM fee_charges WHERE enrollment_id = $1 ORDER BY created_at", [id]),
    query(
      `SELECT l.id, l.kind, l.amount, l.created_at FROM public.finance_ledger l
       JOIN public.finance_accounts a ON a.id = l.account_id
       WHERE a.entity_table = 'training.enrollments' AND a.entity_id = $1
         AND (l.kind IN ('discount', 'waiver') OR (l.kind = 'adjustment' AND l.source <> 'price'))
       ORDER BY l.id`,
      [id],
    ),
    query(
      `SELECT p.id, p.amount, p.refunded_amount, p.status, p.method, p.reference, p.paid_on, p.voided_at, r.receipt_number
       FROM payments p JOIN receipts r ON r.payment_id = p.id WHERE p.enrollment_id = $1 ORDER BY p.paid_on DESC`,
      [id],
    ),
  ]);
  res.json({ data: { charges, adjustments, payments } });
});

studentRouter.get("/payments/:id/receipt", async (req, res) => {
  const studentId = await currentStudentId(req);
  const p = await queryOne(
    "SELECT p.id FROM payments p JOIN enrollments e ON e.id = p.enrollment_id WHERE p.id = $1 AND e.student_id = $2",
    [param(req, "id"), studentId],
  );
  if (!p) throw notFound("Receipt not found");
  const { pdf, filename } = await receiptPdf(p.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(pdf);
});

studentRouter.get("/certificates", async (req, res) => {
  const studentId = await currentStudentId(req);
  res.json({
    data: await query(
      `SELECT c.id, c.enrollment_id, c.certificate_number, c.verification_code, c.program_name, c.intake_name, c.final_grade, c.issued_on,
              c.revoked_at IS NOT NULL AS revoked
       FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id WHERE e.student_id = $1 ORDER BY c.issued_on DESC`,
      [studentId],
    ),
  });
});

studentRouter.get("/certificates/:id/pdf", async (req, res) => {
  const studentId = await currentStudentId(req);
  const c = await queryOne(
    `SELECT c.id FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id
     WHERE c.id = $1 AND e.student_id = $2 AND c.revoked_at IS NULL`,
    [param(req, "id"), studentId],
  );
  if (!c) throw notFound("Certificate not found");
  const { pdf, filename } = await certificatePdf(c.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(pdf);
});

studentRouter.get("/announcements", async (req, res) => {
  const studentId = await currentStudentId(req);
  res.json({
    data: await query(
      `SELECT a.id, a.title, a.body, a.audience, a.created_at, cl.code AS class_code, i.name AS intake_name, u.full_name AS author
       FROM announcements a LEFT JOIN classes cl ON cl.id = a.class_id LEFT JOIN intakes i ON i.id = a.intake_id
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.audience IN ('all', 'students')
          OR (a.audience = 'intake' AND a.intake_id IN (
                SELECT ip.intake_id FROM enrollments e JOIN intake_programs ip ON ip.id = e.intake_program_id WHERE e.student_id = $1))
          OR (a.audience = 'class' AND a.class_id IN (
                SELECT cs.class_id FROM class_students cs JOIN enrollments e ON e.id = cs.enrollment_id WHERE e.student_id = $1))
       ORDER BY a.created_at DESC LIMIT 50`,
      [studentId],
    ),
  });
});

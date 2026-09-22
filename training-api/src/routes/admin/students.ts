import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db.js";
import { badRequest, notFound, optionalDate, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { deleteSessionsFor, setPassword, temporaryPassword } from "../../services/auth.js";
import { certificateEligibility } from "../../services/certificates.js";
import { refreshIntakeStatuses } from "../../services/intakes.js";
import { summariesFor } from "../../services/metrics.js";
import { today } from "../../services/settings.js";
import { discardUpload, storage, upload } from "../../services/storage.js";

export const studentsRouter = Router();

// One row per enrollment, so a student in two programs shows twice with context.
studentsRouter.get("/students", async (req, res) => {
  const f = parse(
    z.object({
      q: z.string().trim().max(100).optional(),
      intake_id: uuid.optional(),
      program_id: uuid.optional(),
      class_id: uuid.optional(),
      status: z.enum(["active", "completed", "withdrawn"]).optional(),
      payment_status: z.enum(["paid", "partially_paid", "outstanding"]).optional(),
      unassigned: z.enum(["1"]).optional(),
    }),
    req.query,
  );
  const rows = await query(
    `SELECT s.id AS student_id, s.student_number, s.full_name, s.phone, s.email, e.id AS enrollment_id, e.status,
            e.enrolled_on, p.name AS program_name, i.name AS intake_name, i.id AS intake_id, cl.code AS class_code
     FROM students s JOIN enrollments e ON e.student_id = s.id
     JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs p ON p.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id
     LEFT JOIN class_students cs ON cs.enrollment_id = e.id LEFT JOIN classes cl ON cl.id = cs.class_id
     WHERE ($1::text IS NULL OR s.full_name ILIKE '%' || $1 || '%' OR s.student_number ILIKE '%' || $1 || '%'
            OR s.phone ILIKE '%' || $1 || '%' OR s.email ILIKE '%' || $1 || '%')
       AND ($2::uuid IS NULL OR i.id = $2) AND ($3::uuid IS NULL OR p.id = $3) AND ($4::uuid IS NULL OR cl.id = $4)
       AND ($5::text IS NULL OR e.status = $5) AND ($6::boolean IS NOT TRUE OR cs.id IS NULL)
     ORDER BY i.training_starts_on DESC, s.full_name
     LIMIT 1000`,
    [f.q || null, f.intake_id ?? null, f.program_id ?? null, f.class_id ?? null, f.status ?? null, f.unassigned === "1"],
  );
  const summaries = await summariesFor(rows.map((r) => r.enrollment_id));
  let items = rows.map((r) => {
    const s = summaries.get(r.enrollment_id)!;
    return { ...r, attendance_rate: s.attendance.rate, payment_status: s.finance.payment_status, balance: s.finance.balance, grade: s.results.grade };
  });
  if (f.payment_status) items = items.filter((i) => i.payment_status === f.payment_status);
  res.json({ data: items });
});

studentsRouter.get("/students/:id", async (req, res) => {
  const student = await queryOne(
    `SELECT s.*, (s.photo_path IS NOT NULL) AS has_photo, u.last_login_at, u.must_change_password
     FROM students s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [param(req, "id")],
  );
  if (!student) throw notFound("Student not found");
  const enrollments = await query(
    `SELECT e.*, p.name AS program_name, i.name AS intake_name, i.id AS intake_id, i.training_starts_on, i.training_ends_on,
            ip.id AS intake_program_id, cl.id AS class_id, cl.code AS class_code, cl.room,
            tu.full_name AS trainer_name, a.reference AS application_reference,
            c.id AS certificate_id, c.certificate_number, c.revoked_at AS certificate_revoked_at
     FROM enrollments e JOIN intake_programs ip ON ip.id = e.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
     LEFT JOIN class_students cs ON cs.enrollment_id = e.id LEFT JOIN classes cl ON cl.id = cs.class_id
     LEFT JOIN trainers t ON t.id = cl.trainer_id LEFT JOIN users tu ON tu.id = t.user_id
     LEFT JOIN applications a ON a.id = e.application_id
     LEFT JOIN certificates c ON c.enrollment_id = e.id
     WHERE e.student_id = $1 ORDER BY i.training_starts_on DESC`,
    [student.id],
  );
  const summaries = await summariesFor(enrollments.map((e) => e.id));
  const { photo_path: _p, ...rest } = student;
  res.json({ data: { ...rest, enrollments: enrollments.map((e) => ({ ...e, ...summaries.get(e.id)! })) } });
});

studentsRouter.patch("/students/:id", async (req, res) => {
  const b = parse(
    z
      .object({
        full_name: z.string().trim().min(3).max(120),
        date_of_birth: optionalDate,
        gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable(),
        phone: z.string().trim().min(7).max(20),
        address: z.string().trim().max(300),
        emergency_contact_name: z.string().trim().max(120),
        emergency_contact_phone: z.string().trim().max(20),
        previous_education: z.string().trim().max(500),
      })
      .partial(),
    req.body,
  );
  const fields = Object.keys(b) as (keyof typeof b)[];
  if (fields.length === 0) throw badRequest("Nothing to update");
  const row = await queryOne(
    `UPDATE students SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING id`,
    [param(req, "id"), ...fields.map((f) => b[f])],
  );
  if (!row) throw notFound("Student not found");
  if (b.full_name) await query("UPDATE users SET full_name = $2 WHERE id = (SELECT user_id FROM students WHERE id = $1)", [row.id, b.full_name]);
  res.json({ data: row });
});

studentsRouter.post("/students/:id/photo", upload.single("photo"), async (req, res) => {
  try {
    const student = await queryOne("SELECT id, photo_path FROM students WHERE id = $1", [param(req, "id")]);
    if (!student) throw notFound("Student not found");
    if (!req.file) throw badRequest("Choose a photo");
    const key = await storage.save("student-photos", student.id, req.file);
    await query("UPDATE students SET photo_path = $2 WHERE id = $1", [student.id, key]);
    if (student.photo_path) await storage.remove(student.photo_path);
    res.json({ data: { ok: true } });
  } catch (err) {
    discardUpload(req.file);
    throw err;
  }
});

studentsRouter.get("/students/:id/photo", async (req, res) => {
  const s = await queryOne("SELECT photo_path FROM students WHERE id = $1", [param(req, "id")]);
  if (!s?.photo_path) throw notFound("No photo");
  await storage.send(res, s.photo_path);
});

// Gives the student a new temporary password (shown once) and signs them out everywhere.
studentsRouter.post("/students/:id/reset-password", async (req, res) => {
  const admin = currentUser(req);
  const s = await queryOne("SELECT s.user_id, u.email FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = $1", [param(req, "id")]);
  if (!s) throw notFound("This student has no portal account yet");
  const password = temporaryPassword();
  await setPassword(s.user_id, password);
  await query("UPDATE users SET must_change_password = true, is_active = true WHERE id = $1", [s.user_id]);
  await deleteSessionsFor(s.user_id);
  await logActivity(admin.id, "user.password_reset", "user", s.user_id);
  res.json({ data: { email: s.email, temporary_password: password } });
});

// ============== ENROLLMENTS ==============
studentsRouter.patch("/enrollments/:id", async (req, res) => {
  const admin = currentUser(req);
  const { status } = parse(z.object({ status: z.enum(["active", "completed", "withdrawn"]) }), req.body);
  const id = param(req, "id");
  const row = await withTransaction(async (c) => {
    const e = await queryOne(
      "SELECT e.*, ip.intake_id FROM enrollments e JOIN intake_programs ip ON ip.id = e.intake_program_id WHERE e.id = $1 FOR UPDATE OF e",
      [id],
      c,
    );
    if (!e) throw notFound("Enrollment not found");
    if (e.status === status) return e;
    if (e.status === "withdrawn" && status !== "withdrawn") {
      // Coming back takes a seat again
      const seats = await queryOne("SELECT available_seats FROM intake_program_stats WHERE intake_program_id = $1", [e.intake_program_id], c);
      if (seats!.available_seats <= 0) throw badRequest("The program is full; increase its capacity first");
    }
    const updated = await queryOne(
      `UPDATE enrollments SET status = $2, completed_on = CASE WHEN $2 = 'completed' THEN $3::date ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [id, status, await today(c)],
      c,
    );
    await refreshIntakeStatuses(c, e.intake_id);
    await logActivity(admin.id, `enrollment.${status}`, "enrollment", id, { from: e.status }, c);
    return updated;
  });
  res.json({ data: row });
});

// Put an enrollment in a class of the same intake program (or take it out).
studentsRouter.put("/enrollments/:id/class", async (req, res) => {
  const { class_id } = parse(z.object({ class_id: uuid.nullable() }), req.body);
  const e = await queryOne("SELECT id, intake_program_id FROM enrollments WHERE id = $1", [param(req, "id")]);
  if (!e) throw notFound("Enrollment not found");
  if (class_id === null) {
    await query("DELETE FROM class_students WHERE enrollment_id = $1", [e.id]);
  } else {
    const cl = await queryOne("SELECT intake_program_id FROM classes WHERE id = $1", [class_id]);
    if (!cl) throw notFound("Class not found");
    if (cl.intake_program_id !== e.intake_program_id) throw badRequest("That class is for a different program or intake");
    await query(
      `INSERT INTO class_students (class_id, enrollment_id) VALUES ($1, $2)
       ON CONFLICT (enrollment_id) DO UPDATE SET class_id = EXCLUDED.class_id, added_at = now()`,
      [class_id, e.id],
    );
  }
  res.json({ data: { ok: true } });
});

studentsRouter.get("/enrollments/:id/eligibility", async (req, res) => {
  res.json({ data: await certificateEligibility(param(req, "id")) });
});

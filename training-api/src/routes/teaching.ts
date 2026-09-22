import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../db.js";
import { assessmentForTeaching, classForTeaching } from "../lib/access.js";
import { badRequest, conflict, optionalDate, param, parse, uuid } from "../lib/http.js";
import { currentUser, requireRole } from "../middleware/auth.js";
import { summariesFor } from "../services/metrics.js";
import { notify } from "../services/notifications.js";
import { getSetting, gradeFor, today } from "../services/settings.js";

// Class work shared by trainers (their own classes only) and admins (any class).
export const teachingRouter = Router();
teachingRouter.use(requireRole("admin", "trainer"));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)");

/** Students in a class. Trainers see what they need to teach: name, number, contact phone. */
async function roster(classId: string) {
  return query(
    `SELECT e.id AS enrollment_id, e.status AS enrollment_status, s.id AS student_id, s.student_number,
            s.full_name, s.phone, s.email
     FROM class_students cs JOIN enrollments e ON e.id = cs.enrollment_id JOIN students s ON s.id = e.student_id
     WHERE cs.class_id = $1 AND e.status <> 'withdrawn'
     ORDER BY s.full_name`,
    [classId],
  );
}

teachingRouter.get("/:id", async (req, res) => {
  const klass = await classForTeaching(req, param(req, "id"));
  const students = await roster(klass.id);
  const summaries = await summariesFor(students.map((s) => s.enrollment_id));
  const [sessions, assessments] = await Promise.all([
    query("SELECT * FROM class_sessions WHERE class_id = $1 ORDER BY session_date DESC LIMIT 60", [klass.id]),
    query(
      `SELECT a.*, (SELECT count(*) FROM assessment_results r WHERE r.assessment_id = a.id)::int AS marked_count
       FROM assessments a WHERE a.class_id = $1 ORDER BY coalesce(a.due_date, a.created_at::date), a.created_at`,
      [klass.id],
    ),
  ]);
  const { trainer_user_id: _t, ...cls } = klass;
  res.json({
    data: {
      ...cls,
      students: students.map((s) => {
        const sm = summaries.get(s.enrollment_id)!;
        return { ...s, attendance: sm.attendance, results: sm.results, progress: sm.progress };
      }),
      sessions,
      assessments,
    },
  });
});

// ============== LESSONS & ATTENDANCE ==============
teachingRouter.get("/:id/attendance", async (req, res) => {
  const klass = await classForTeaching(req, param(req, "id"));
  const day = parse(date.optional(), req.query.date) ?? (await today());
  const session = await queryOne("SELECT * FROM class_sessions WHERE class_id = $1 AND session_date = $2", [klass.id, day]);
  const students = await roster(klass.id);
  const marks = session
    ? await query("SELECT enrollment_id, status, note FROM attendance WHERE session_id = $1", [session.id])
    : [];
  const byEnrollment = new Map(marks.map((m) => [m.enrollment_id, m]));
  const summaries = await summariesFor(students.map((s) => s.enrollment_id));
  res.json({
    data: {
      date: day,
      session,
      students: students.map((s) => ({
        ...s,
        status: byEnrollment.get(s.enrollment_id)?.status ?? null,
        note: byEnrollment.get(s.enrollment_id)?.note ?? null,
        attendance_rate: summaries.get(s.enrollment_id)!.attendance.rate,
      })),
    },
  });
});

// Saves the day's lesson and every student's mark in one go (re-saving updates it).
teachingRouter.put("/:id/attendance", async (req, res) => {
  const me = currentUser(req);
  const klass = await classForTeaching(req, param(req, "id"));
  const body = parse(
    z.object({
      date,
      topic: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(4000).optional(),
      records: z
        .array(z.object({ enrollment_id: uuid, status: z.enum(["present", "absent", "late", "excused"]), note: z.string().trim().max(300).nullish() }))
        .max(500),
    }),
    req.body,
  );
  if (body.date > (await today())) throw badRequest("Attendance can't be taken for a future date");
  const students = await roster(klass.id);
  const allowed = new Set(students.map((s) => s.enrollment_id));
  const stranger = body.records.find((r) => !allowed.has(r.enrollment_id));
  if (stranger) throw badRequest("One of the students is not in this class");

  await withTransaction(async (c) => {
    const session = await queryOne(
      `INSERT INTO class_sessions (class_id, session_date, topic, notes, created_by) VALUES ($1, $2, coalesce($3, ''), coalesce($4, ''), $5)
       ON CONFLICT (class_id, session_date) DO UPDATE SET topic = coalesce($3, class_sessions.topic), notes = coalesce($4, class_sessions.notes)
       RETURNING id`,
      [klass.id, body.date, body.topic ?? null, body.notes ?? null, me.id],
      c,
    );
    for (const r of body.records) {
      await c.query(
        `INSERT INTO attendance (session_id, enrollment_id, status, note, recorded_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, enrollment_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
           recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
        [session!.id, r.enrollment_id, r.status, r.note ?? null, me.id],
      );
    }
  });
  res.json({ data: { ok: true, saved: body.records.length } });
});

// Plan or note a lesson without taking attendance (e.g. tomorrow's topic).
teachingRouter.put("/:id/lessons/:date", async (req, res) => {
  const me = currentUser(req);
  const klass = await classForTeaching(req, param(req, "id"));
  const day = parse(date, req.params.date);
  const body = parse(z.object({ topic: z.string().trim().max(200), notes: z.string().trim().max(4000).default("") }), req.body);
  const session = await queryOne(
    `INSERT INTO class_sessions (class_id, session_date, topic, notes, created_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (class_id, session_date) DO UPDATE SET topic = EXCLUDED.topic, notes = EXCLUDED.notes RETURNING *`,
    [klass.id, day, body.topic, body.notes, me.id],
  );
  res.json({ data: session });
});

// ============== ASSESSMENTS ==============
const assessmentFields = z.object({
  type: z.enum(["assignment", "test", "exam", "project"]),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).default(""),
  due_date: optionalDate,
  max_marks: z.coerce.number().positive().max(10_000),
  weight: z.coerce.number().positive().max(100),
});

teachingRouter.post("/:id/assessments", async (req, res) => {
  const me = currentUser(req);
  const klass = await classForTeaching(req, param(req, "id"));
  const b = parse(assessmentFields, req.body);
  const row = await queryOne(
    `INSERT INTO assessments (class_id, type, title, description, due_date, max_marks, weight, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [klass.id, b.type, b.title, b.description, b.due_date, b.max_marks, b.weight, me.id],
  );
  res.status(201).json({ data: row });
});

teachingRouter.patch("/assessments/:assessmentId", async (req, res) => {
  const { assessment } = await assessmentForTeaching(req, param(req, "assessmentId"));
  const b = parse(assessmentFields.partial(), req.body);
  if (b.max_marks !== undefined) {
    const over = await queryOne("SELECT 1 FROM assessment_results WHERE assessment_id = $1 AND marks > $2 LIMIT 1", [assessment.id, b.max_marks]);
    if (over) throw badRequest("Some recorded marks are higher than the new maximum");
  }
  const fields = Object.keys(b) as (keyof typeof b)[];
  if (fields.length === 0) {
    res.json({ data: assessment });
    return;
  }
  const row = await queryOne(
    `UPDATE assessments SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
    [assessment.id, ...fields.map((f) => b[f])],
  );
  res.json({ data: row });
});

teachingRouter.delete("/assessments/:assessmentId", async (req, res) => {
  const { assessment } = await assessmentForTeaching(req, param(req, "assessmentId"));
  const marked = await queryOne("SELECT 1 FROM assessment_results WHERE assessment_id = $1 LIMIT 1", [assessment.id]);
  if (marked) throw conflict("Marks have been recorded for this assessment; it can't be deleted");
  await query("DELETE FROM assessments WHERE id = $1", [assessment.id]);
  res.json({ data: { ok: true } });
});

teachingRouter.get("/assessments/:assessmentId/results", async (req, res) => {
  const { assessment, klass } = await assessmentForTeaching(req, param(req, "assessmentId"));
  const grading = await getSetting("grading");
  const students = await roster(klass.id);
  const results = await query("SELECT enrollment_id, marks, feedback FROM assessment_results WHERE assessment_id = $1", [assessment.id]);
  const byEnrollment = new Map(results.map((r) => [r.enrollment_id, r]));
  res.json({
    data: {
      assessment,
      grading,
      students: students.map((s) => {
        const r = byEnrollment.get(s.enrollment_id);
        const pct = r ? Math.round((r.marks / assessment.max_marks) * 1000) / 10 : null;
        return { ...s, marks: r?.marks ?? null, feedback: r?.feedback ?? "", percentage: pct, grade: pct === null ? null : gradeFor(pct, grading) };
      }),
    },
  });
});

// Records marks for any number of students; blank entries are left unchanged.
teachingRouter.put("/assessments/:assessmentId/results", async (req, res) => {
  const me = currentUser(req);
  const { assessment, klass } = await assessmentForTeaching(req, param(req, "assessmentId"));
  const body = parse(
    z.object({
      records: z
        .array(z.object({ enrollment_id: uuid, marks: z.coerce.number().min(0), feedback: z.string().trim().max(1000).default("") }))
        .max(500),
    }),
    req.body,
  );
  const tooHigh = body.records.find((r) => r.marks > assessment.max_marks);
  if (tooHigh) throw badRequest(`Marks can't be more than ${assessment.max_marks}`);
  const students = await roster(klass.id);
  const byEnrollment = new Map(students.map((s) => [s.enrollment_id, s]));
  if (body.records.some((r) => !byEnrollment.has(r.enrollment_id))) throw badRequest("One of the students is not in this class");

  await withTransaction(async (c) => {
    for (const r of body.records) {
      const prev = await queryOne("SELECT marks FROM assessment_results WHERE assessment_id = $1 AND enrollment_id = $2", [assessment.id, r.enrollment_id], c);
      await c.query(
        `INSERT INTO assessment_results (assessment_id, enrollment_id, marks, feedback, recorded_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (assessment_id, enrollment_id) DO UPDATE SET marks = EXCLUDED.marks, feedback = EXCLUDED.feedback,
           recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
        [assessment.id, r.enrollment_id, r.marks, r.feedback, me.id],
      );
      if (!prev || Number(prev.marks) !== r.marks) {
        const student = await queryOne(
          "SELECT s.user_id FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.id = $1",
          [r.enrollment_id],
          c,
        );
        if (student?.user_id) {
          await notify(
            {
              userId: student.user_id,
              type: "assessment_result",
              title: `Result: ${assessment.title}`,
              body: `You scored ${r.marks} / ${assessment.max_marks} in ${assessment.title} (${klass.program_name}).`,
              link: "/student/results",
            },
            c,
          );
        }
      }
    }
  });
  res.json({ data: { ok: true, saved: body.records.length } });
});

// Marks matrix and final results for the class.
teachingRouter.get("/:id/results", async (req, res) => {
  const klass = await classForTeaching(req, param(req, "id"));
  const students = await roster(klass.id);
  const assessments = await query("SELECT id, type, title, max_marks, weight, due_date FROM assessments WHERE class_id = $1 ORDER BY coalesce(due_date, created_at::date), created_at", [klass.id]);
  const marks = await query(
    `SELECT r.assessment_id, r.enrollment_id, r.marks FROM assessment_results r
     JOIN assessments a ON a.id = r.assessment_id WHERE a.class_id = $1`,
    [klass.id],
  );
  const summaries = await summariesFor(students.map((s) => s.enrollment_id));
  res.json({
    data: {
      assessments,
      students: students.map((s) => ({
        ...s,
        marks: Object.fromEntries(marks.filter((m) => m.enrollment_id === s.enrollment_id).map((m) => [m.assessment_id, m.marks])),
        results: summaries.get(s.enrollment_id)!.results,
      })),
    },
  });
});

// Trainers can post announcements to their own class.
teachingRouter.post("/:id/announcements", async (req, res) => {
  const me = currentUser(req);
  const klass = await classForTeaching(req, param(req, "id"));
  const b = parse(z.object({ title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(4000) }), req.body);
  const row = await withTransaction(async (c) => {
    const a = await queryOne(
      "INSERT INTO announcements (title, body, audience, class_id, created_by) VALUES ($1, $2, 'class', $3, $4) RETURNING *",
      [b.title, b.body, klass.id, me.id],
      c,
    );
    const recipients = await query(
      `SELECT s.user_id FROM class_students cs JOIN enrollments e ON e.id = cs.enrollment_id JOIN students s ON s.id = e.student_id
       WHERE cs.class_id = $1 AND e.status = 'active' AND s.user_id IS NOT NULL`,
      [klass.id],
      c,
    );
    for (const r of recipients) {
      await notify({ userId: r.user_id, type: "announcement", title: b.title, body: b.body, link: "/student/announcements" }, c);
    }
    return a;
  });
  res.status(201).json({ data: row });
});

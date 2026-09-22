import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db.js";
import { badRequest, conflict, notFound, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { createUserAccount, deleteSessionsFor, setPassword, temporaryPassword } from "../../services/auth.js";
import { notify } from "../../services/notifications.js";

// Classes and trainers.
export const classesRouter = Router();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const classFields = z.object({
  trainer_id: uuid.nullable().optional(),
  room: z.string().trim().max(80).default(""),
  meeting_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one day").max(7),
  start_time: time,
  end_time: time,
});

const CLASS_LIST = `
  SELECT cl.id, cl.code, cl.room, cl.meeting_days, to_char(cl.start_time, 'HH24:MI') AS start_time,
         to_char(cl.end_time, 'HH24:MI') AS end_time, cl.status, cl.trainer_id, cl.intake_program_id,
         tu.full_name AS trainer_name, p.name AS program_name, i.name AS intake_name, i.id AS intake_id,
         (SELECT count(*) FROM class_students cs JOIN enrollments e ON e.id = cs.enrollment_id
          WHERE cs.class_id = cl.id AND e.status <> 'withdrawn')::int AS student_count
  FROM classes cl JOIN intake_programs ip ON ip.id = cl.intake_program_id
  JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
  LEFT JOIN trainers t ON t.id = cl.trainer_id LEFT JOIN users tu ON tu.id = t.user_id`;

classesRouter.get("/classes", async (req, res) => {
  const f = parse(z.object({ intake_id: uuid.optional(), intake_program_id: uuid.optional(), trainer_id: uuid.optional(), status: z.string().max(20).optional() }), req.query);
  res.json({
    data: await query(
      `${CLASS_LIST} WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::uuid IS NULL OR ip.id = $2)
         AND ($3::uuid IS NULL OR cl.trainer_id = $3) AND ($4::text IS NULL OR cl.status = $4)
       ORDER BY cl.status, i.training_starts_on DESC, cl.code`,
      [f.intake_id ?? null, f.intake_program_id ?? null, f.trainer_id ?? null, f.status ?? null],
    ),
  });
});

async function assertTrainer(trainerId: string | null | undefined) {
  if (!trainerId) return;
  const t = await queryOne("SELECT is_active FROM trainers WHERE id = $1", [trainerId]);
  if (!t) throw notFound("Trainer not found");
  if (!t.is_active) throw badRequest("This trainer is inactive");
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Class codes look like WD-JAN-2027-A: program code, intake month and year, section letter.
classesRouter.post("/classes", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(classFields.extend({ intake_program_id: uuid, assign_unplaced: z.boolean().default(true) }), req.body);
  if (b.end_time <= b.start_time) throw badRequest("The class must end after it starts");
  await assertTrainer(b.trainer_id);
  const ip = await queryOne(
    `SELECT ip.id, p.code, i.training_starts_on FROM intake_programs ip JOIN programs p ON p.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id WHERE ip.id = $1`,
    [b.intake_program_id],
  );
  if (!ip) throw notFound("Program offering not found");
  const start = new Date(ip.training_starts_on);
  const prefix = `${ip.code}-${MONTHS[start.getUTCMonth()]}-${start.getUTCFullYear()}-`;
  const klass = await withTransaction(async (c) => {
    await c.query("SELECT id FROM intake_programs WHERE id = $1 FOR UPDATE", [ip.id]);
    const used = new Set((await query<{ code: string }>("SELECT code FROM classes WHERE code LIKE $1 || '%'", [prefix], c)).map((r) => r.code));
    const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !used.has(prefix + l));
    if (!letter) throw conflict("Too many classes for this program");
    const row = await queryOne(
      `INSERT INTO classes (code, intake_program_id, trainer_id, room, meeting_days, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [prefix + letter, ip.id, b.trainer_id ?? null, b.room, [...new Set(b.meeting_days)].sort(), b.start_time, b.end_time],
      c,
    );
    // Students already approved but not in a class join this one
    if (b.assign_unplaced) {
      await c.query(
        `INSERT INTO class_students (class_id, enrollment_id)
         SELECT $1, e.id FROM enrollments e
         WHERE e.intake_program_id = $2 AND e.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM class_students cs WHERE cs.enrollment_id = e.id)`,
        [row!.id, ip.id],
      );
    }
    await logActivity(admin.id, "class.created", "class", row!.id, { code: row!.code }, c);
    return row;
  });
  res.status(201).json({ data: await queryOne(`${CLASS_LIST} WHERE cl.id = $1`, [klass!.id]) });
});

classesRouter.patch("/classes/:id", async (req, res) => {
  const id = param(req, "id");
  const b = parse(classFields.extend({ status: z.enum(["active", "completed", "cancelled"]) }).partial(), req.body);
  await assertTrainer(b.trainer_id);
  const current = await queryOne("SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, trainer_id FROM classes WHERE id = $1", [id]);
  if (!current) throw notFound("Class not found");
  if ((b.end_time ?? current.end_time) <= (b.start_time ?? current.start_time)) throw badRequest("The class must end after it starts");
  if (b.meeting_days) b.meeting_days = [...new Set(b.meeting_days)].sort();
  const fields = Object.keys(b) as (keyof typeof b)[];
  if (fields.length === 0) throw badRequest("Nothing to update");
  await query(`UPDATE classes SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...fields.map((f) => b[f] ?? null)]);
  if (b.trainer_id && b.trainer_id !== current.trainer_id) {
    const t = await queryOne("SELECT t.user_id, cl.code FROM trainers t, classes cl WHERE t.id = $1 AND cl.id = $2", [b.trainer_id, id]);
    await notify({ userId: t.user_id, type: "announcement", title: `You're assigned to ${t.code}`, body: "A class has been assigned to you. Open My Classes to see the students.", link: `/trainer/classes/${id}` });
  }
  res.json({ data: await queryOne(`${CLASS_LIST} WHERE cl.id = $1`, [id]) });
});

// One program offering with its intake, e.g. to preselect it in the class form.
classesRouter.get("/intake-programs/:id", async (req, res) => {
  const row = await queryOne(
    `SELECT ip.id, ip.intake_id, ip.program_id, ip.schedule, p.name AS program_name, i.name AS intake_name
     FROM intake_programs ip JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id WHERE ip.id = $1`,
    [param(req, "id")],
  );
  if (!row) throw notFound("Program offering not found");
  res.json({ data: row });
});

// Active enrollments of the class's program that aren't in any class yet.
classesRouter.get("/classes/:id/candidates", async (req, res) => {
  const cl = await queryOne("SELECT intake_program_id FROM classes WHERE id = $1", [param(req, "id")]);
  if (!cl) throw notFound("Class not found");
  res.json({
    data: await query(
      `SELECT e.id AS enrollment_id, s.student_number, s.full_name FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.intake_program_id = $1 AND e.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM class_students cs WHERE cs.enrollment_id = e.id)
       ORDER BY s.full_name`,
      [cl.intake_program_id],
    ),
  });
});

classesRouter.post("/classes/:id/students", async (req, res) => {
  const id = param(req, "id");
  const { enrollment_ids } = parse(z.object({ enrollment_ids: z.array(uuid).min(1).max(500) }), req.body);
  const cl = await queryOne("SELECT intake_program_id FROM classes WHERE id = $1", [id]);
  if (!cl) throw notFound("Class not found");
  const ok = await query("SELECT id FROM enrollments WHERE id = ANY($1::uuid[]) AND intake_program_id = $2", [enrollment_ids, cl.intake_program_id]);
  if (ok.length !== enrollment_ids.length) throw badRequest("Some students are not enrolled in this class's program and intake");
  await query(
    `INSERT INTO class_students (class_id, enrollment_id) SELECT $1, unnest($2::uuid[])
     ON CONFLICT (enrollment_id) DO UPDATE SET class_id = EXCLUDED.class_id, added_at = now()`,
    [id, enrollment_ids],
  );
  res.json({ data: { ok: true, added: enrollment_ids.length } });
});

classesRouter.delete("/classes/:id/students/:enrollmentId", async (req, res) => {
  await query("DELETE FROM class_students WHERE class_id = $1 AND enrollment_id = $2", [param(req, "id"), param(req, "enrollmentId")]);
  res.json({ data: { ok: true } });
});

// ============== TRAINERS ==============
classesRouter.get("/trainers", async (_req, res) => {
  res.json({
    data: await query(
      `SELECT t.id, t.specialization, t.bio, t.is_active, u.id AS user_id, u.full_name, u.email, u.phone, u.last_login_at,
              (SELECT count(*) FROM classes cl WHERE cl.trainer_id = t.id AND cl.status = 'active')::int AS active_classes
       FROM trainers t JOIN users u ON u.id = t.user_id ORDER BY t.is_active DESC, u.full_name`,
    ),
  });
});

const trainerFields = z.object({
  full_name: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).nullish(),
  specialization: z.string().trim().max(120).nullish(),
  bio: z.string().trim().max(2000).nullish(),
});

// Creates the trainer's login with a temporary password, shown once to the admin.
// Someone who already has an Isoko account keeps signing in with it.
classesRouter.post("/trainers", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(trainerFields, req.body);
  const exists = await queryOne("SELECT 1 FROM users WHERE lower(email) = $1", [b.email]);
  if (exists) throw conflict("An account with this email already exists");
  const password = temporaryPassword();
  const trainer = await withTransaction(async (c) => {
    const user = await createUserAccount({ email: b.email, password, role: "trainer", full_name: b.full_name, phone: b.phone, must_change_password: true }, c);
    const t = await queryOne("INSERT INTO trainers (user_id, specialization, bio) VALUES ($1, $2, $3) RETURNING id", [user.id, b.specialization ?? null, b.bio ?? null], c);
    await notify(
      {
        userId: user.id,
        email: b.email,
        type: "account_created",
        title: "Your Isoko Training Center trainer account",
        body: user.password
          ? `Hello ${b.full_name}, a trainer account has been created for you.\nEmail: ${b.email}\nTemporary password: ${user.password}\nYou'll choose a new password when you first sign in.`
          : `Hello ${b.full_name}, you are now a trainer at the Isoko Training Center. Sign in with your existing Isoko account (${b.email}).`,
        link: "/login",
      },
      c,
    );
    await logActivity(admin.id, "trainer.created", "trainer", t!.id, {}, c);
    return { id: t!.id as string, password: user.password };
  });
  res.status(201).json({ data: { id: trainer.id, login: { email: b.email, temporary_password: trainer.password } } });
});

classesRouter.patch("/trainers/:id", async (req, res) => {
  const id = param(req, "id");
  const b = parse(trainerFields.omit({ email: true }).extend({ is_active: z.boolean() }).partial(), req.body);
  const t = await queryOne("SELECT user_id FROM trainers WHERE id = $1", [id]);
  if (!t) throw notFound("Trainer not found");
  await withTransaction(async (c) => {
    if (b.full_name !== undefined || b.phone !== undefined || b.is_active !== undefined) {
      await c.query(
        `UPDATE users SET full_name = coalesce($2, full_name), phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
           is_active = coalesce($5, is_active) WHERE id = $1`,
        [t.user_id, b.full_name ?? null, b.phone !== undefined, b.phone ?? null, b.is_active ?? null],
      );
    }
    await c.query(
      `UPDATE trainers SET specialization = CASE WHEN $2::boolean THEN $3 ELSE specialization END,
         bio = CASE WHEN $4::boolean THEN $5 ELSE bio END, is_active = coalesce($6, is_active) WHERE id = $1`,
      [id, b.specialization !== undefined, b.specialization ?? null, b.bio !== undefined, b.bio ?? null, b.is_active ?? null],
    );
  });
  if (b.is_active === false) await deleteSessionsFor(t.user_id);
  res.json({ data: { ok: true } });
});

classesRouter.post("/trainers/:id/reset-password", async (req, res) => {
  const admin = currentUser(req);
  const t = await queryOne("SELECT t.user_id, u.email FROM trainers t JOIN users u ON u.id = t.user_id WHERE t.id = $1", [param(req, "id")]);
  if (!t) throw notFound("Trainer not found");
  const password = temporaryPassword();
  await setPassword(t.user_id, password);
  await query("UPDATE users SET must_change_password = true WHERE id = $1", [t.user_id]);
  await deleteSessionsFor(t.user_id);
  await logActivity(admin.id, "user.password_reset", "user", t.user_id);
  res.json({ data: { email: t.email, temporary_password: password } });
});

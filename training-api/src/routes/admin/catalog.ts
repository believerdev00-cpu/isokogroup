import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db.js";
import { badRequest, conflict, notFound, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { refreshIntakeStatuses } from "../../services/intakes.js";

// Programs, intakes, and which programs each intake offers.
export const catalogRouter = Router();

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 80) || "item";

async function uniqueSlug(table: "programs" | "intakes", name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await queryOne(`SELECT 1 FROM ${table} WHERE slug = $1 AND id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')`, [slug, exceptId ?? null]);
    if (!taken) return slug;
  }
}

const money = z.coerce.number().min(0).max(1_000_000_000);

// ============== PROGRAMS ==============
const programFields = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, "Use 2–8 letters or digits, e.g. WD"),
  name: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(4000).default(""),
  duration_value: z.coerce.number().int().min(1).max(60),
  duration_unit: z.enum(["weeks", "months"]),
  tuition_fee: money.default(0),
  registration_fee: money.default(0),
  course_content: z.string().trim().max(8000).default(""),
  requirements: z.string().trim().max(4000).default(""),
  max_students: z.coerce.number().int().min(1).max(1000).default(30),
  is_active: z.boolean().default(true),
});

catalogRouter.get("/programs", async (_req, res) => {
  res.json({
    data: await query(
      `SELECT p.*,
              (SELECT count(*) FROM intake_programs ip WHERE ip.program_id = p.id)::int AS intake_count,
              (SELECT count(*) FROM enrollments e JOIN intake_programs ip ON ip.id = e.intake_program_id
               WHERE ip.program_id = p.id AND e.status = 'active')::int AS active_students
       FROM programs p ORDER BY p.is_active DESC, p.name`,
    ),
  });
});

catalogRouter.get("/programs/:id", async (req, res) => {
  const program = await queryOne("SELECT * FROM programs WHERE id = $1", [param(req, "id")]);
  if (!program) throw notFound("Program not found");
  const offerings = await query(
    `SELECT ip.id AS intake_program_id, i.id AS intake_id, i.name AS intake_name, i.status, i.training_starts_on,
            s.capacity, s.enrolled, s.available_seats
     FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE ip.program_id = $1 ORDER BY i.training_starts_on DESC`,
    [program.id],
  );
  res.json({ data: { ...program, offerings } });
});

catalogRouter.post("/programs", async (req, res) => {
  const b = parse(programFields, req.body);
  const row = await queryOne(
    `INSERT INTO programs (code, name, slug, category, description, duration_value, duration_unit, tuition_fee,
       registration_fee, course_content, requirements, max_students, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [b.code, b.name, await uniqueSlug("programs", b.name), b.category, b.description, b.duration_value, b.duration_unit,
      b.tuition_fee, b.registration_fee, b.course_content, b.requirements, b.max_students, b.is_active],
  ).catch((err) => {
    if (err.code === "23505") throw conflict(`A program with code ${b.code} already exists`);
    throw err;
  });
  res.status(201).json({ data: row });
});

catalogRouter.patch("/programs/:id", async (req, res) => {
  const id = param(req, "id");
  const b = parse(programFields.partial(), req.body);
  const fields = Object.keys(b) as (keyof typeof b)[];
  const values: unknown[] = fields.map((f) => b[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`);
  if (b.name) {
    sets.push(`slug = $${values.length + 2}`);
    values.push(await uniqueSlug("programs", b.name, id));
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  const row = await queryOne(`UPDATE programs SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, [id, ...values]);
  if (!row) throw notFound("Program not found");
  res.json({ data: row });
});

// ============== INTAKES ==============
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)");
const intakeFields = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).default(""),
  application_opens_on: date,
  application_closes_on: date,
  training_starts_on: date,
  training_ends_on: date,
  location: z.string().trim().max(200).default(""),
});

function checkDates(d: { application_opens_on: string; application_closes_on: string; training_starts_on: string; training_ends_on: string }) {
  if (d.application_closes_on < d.application_opens_on) throw badRequest("The application deadline must be after the opening date");
  if (d.training_ends_on < d.training_starts_on) throw badRequest("Training must end after it starts");
  if (d.training_starts_on < d.application_opens_on) throw badRequest("Training can't start before applications open");
}

const INTAKE_LIST = `
  SELECT i.*,
         (SELECT count(*) FROM intake_programs ip WHERE ip.intake_id = i.id)::int AS program_count,
         coalesce((SELECT sum(capacity) FROM intake_program_stats s WHERE s.intake_id = i.id), 0)::int AS capacity,
         coalesce((SELECT sum(enrolled) FROM intake_program_stats s WHERE s.intake_id = i.id), 0)::int AS enrolled,
         (SELECT count(*) FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
          WHERE ip.intake_id = i.id AND a.status IN ('pending', 'under_review'))::int AS pending_applications,
         -- Where today (in the center's time zone) falls relative to the application period
         CASE WHEN center_today.d < i.application_opens_on THEN 'upcoming'
              WHEN center_today.d > i.application_closes_on THEN 'closed' ELSE 'open' END AS application_window
  FROM intakes i
  CROSS JOIN (SELECT (now() AT TIME ZONE (SELECT value->>'timezone' FROM settings WHERE key = 'center'))::date AS d) center_today`;

catalogRouter.get("/intakes", async (req, res) => {
  const status = parse(z.string().max(20).optional(), req.query.status);
  res.json({
    data: await query(
      `${INTAKE_LIST} WHERE ($1::text IS NULL OR i.status = $1)
       ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'full' THEN 1 WHEN 'upcoming' THEN 2 WHEN 'draft' THEN 3
                               WHEN 'closed' THEN 4 WHEN 'completed' THEN 5 ELSE 6 END, i.training_starts_on DESC`,
      [status ?? null],
    ),
  });
});

catalogRouter.get("/intakes/:id", async (req, res) => {
  const intake = await queryOne(`${INTAKE_LIST} WHERE i.id = $1`, [param(req, "id")]);
  if (!intake) throw notFound("Intake not found");
  const programs = await query(
    `SELECT ip.*, p.name AS program_name, p.code AS program_code, p.tuition_fee AS program_tuition_fee,
            p.registration_fee AS program_registration_fee, s.enrolled, s.available_seats,
            (SELECT count(*) FROM applications a WHERE a.intake_program_id = ip.id AND a.status IN ('pending', 'under_review'))::int AS pending_applications,
            (SELECT count(*) FROM applications a WHERE a.intake_program_id = ip.id AND a.status = 'waitlisted')::int AS waitlisted,
            (SELECT count(*) FROM classes cl WHERE cl.intake_program_id = ip.id)::int AS class_count
     FROM intake_programs ip JOIN programs p ON p.id = ip.program_id JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE ip.intake_id = $1 ORDER BY p.name`,
    [intake.id],
  );
  res.json({ data: { ...intake, programs } });
});

catalogRouter.post("/intakes", async (req, res) => {
  const b = parse(intakeFields, req.body);
  checkDates(b);
  const row = await queryOne(
    `INSERT INTO intakes (name, slug, description, application_opens_on, application_closes_on, training_starts_on,
                          training_ends_on, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [b.name, await uniqueSlug("intakes", b.name), b.description, b.application_opens_on, b.application_closes_on,
      b.training_starts_on, b.training_ends_on, b.location],
  );
  res.status(201).json({ data: row });
});

catalogRouter.patch("/intakes/:id", async (req, res) => {
  const id = param(req, "id");
  const current = await queryOne("SELECT * FROM intakes WHERE id = $1", [id]);
  if (!current) throw notFound("Intake not found");
  const b = parse(intakeFields.partial(), req.body);
  checkDates({ ...current, ...b });
  const fields = Object.keys(b) as (keyof typeof b)[];
  const values: unknown[] = fields.map((f) => b[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`);
  if (b.name) {
    sets.push(`slug = $${values.length + 2}`);
    values.push(await uniqueSlug("intakes", b.name, id));
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  await query(`UPDATE intakes SET ${sets.join(", ")} WHERE id = $1`, [id, ...values]);
  await refreshIntakeStatuses(undefined, id);
  res.json({ data: await queryOne("SELECT * FROM intakes WHERE id = $1", [id]) });
});

// ============== PROGRAMS IN AN INTAKE ==============
const offeringFields = z.object({
  capacity: z.coerce.number().int().min(1).max(1000),
  tuition_fee: money.nullable().optional(),
  registration_fee: money.nullable().optional(),
  schedule: z.string().trim().max(300).default(""),
  accepting_applications: z.boolean().default(true),
});

catalogRouter.post("/intakes/:id/programs", async (req, res) => {
  const intakeId = param(req, "id");
  const b = parse(offeringFields.extend({ program_id: uuid }), req.body);
  const intake = await queryOne("SELECT status FROM intakes WHERE id = $1", [intakeId]);
  if (!intake) throw notFound("Intake not found");
  if (["completed", "archived"].includes(intake.status)) throw badRequest("This intake has ended");
  const program = await queryOne("SELECT id, is_active FROM programs WHERE id = $1", [b.program_id]);
  if (!program) throw notFound("Program not found");
  if (!program.is_active) throw badRequest("This program is inactive");
  const row = await queryOne(
    `INSERT INTO intake_programs (intake_id, program_id, capacity, tuition_fee, registration_fee, schedule, accepting_applications)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [intakeId, b.program_id, b.capacity, b.tuition_fee ?? null, b.registration_fee ?? null, b.schedule, b.accepting_applications],
  ).catch((err) => {
    if (err.code === "23505") throw conflict("This program is already in the intake");
    throw err;
  });
  await refreshIntakeStatuses(undefined, intakeId);
  res.status(201).json({ data: row });
});

catalogRouter.patch("/intake-programs/:id", async (req, res) => {
  const id = param(req, "id");
  const b = parse(offeringFields.partial(), req.body);
  if (b.capacity !== undefined) {
    const stats = await queryOne("SELECT enrolled FROM intake_program_stats WHERE intake_program_id = $1", [id]);
    if (!stats) throw notFound("Program offering not found");
    if (b.capacity < stats.enrolled) throw badRequest(`${stats.enrolled} students are already enrolled; capacity can't be lower`);
  }
  const fields = Object.keys(b) as (keyof typeof b)[];
  if (fields.length === 0) throw badRequest("Nothing to update");
  const row = await queryOne(
    `UPDATE intake_programs SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...fields.map((f) => b[f] ?? null)],
  );
  if (!row) throw notFound("Program offering not found");
  await refreshIntakeStatuses(undefined, row.intake_id);
  res.json({ data: row });
});

catalogRouter.delete("/intake-programs/:id", async (req, res) => {
  const id = param(req, "id");
  const used = await queryOne("SELECT 1 FROM applications WHERE intake_program_id = $1 UNION ALL SELECT 1 FROM classes WHERE intake_program_id = $1 LIMIT 1", [id]);
  if (used) throw conflict("This program already has applications or classes; stop accepting applications instead");
  const row = await queryOne("DELETE FROM intake_programs WHERE id = $1 RETURNING intake_id", [id]);
  if (row) await refreshIntakeStatuses(undefined, row.intake_id);
  res.json({ data: { ok: true } });
});

// Registered last so the specific /intakes/:id/programs route above takes precedence.
/**
 * Status actions. "publish" and "automatic" hand the intake to the date/seat rules;
 * "open", "close" and "reopen" pin a status manually (e.g. extend or cut short the
 * application period); "complete" and "archive" end its life. Every change is logged.
 */
const ACTIONS: Record<string, { from: string[]; status?: string; mode: "auto" | "manual" }> = {
  publish: { from: ["draft"], mode: "auto" },
  automatic: { from: ["upcoming", "open", "full", "closed"], mode: "auto" },
  open: { from: ["draft", "upcoming", "full", "closed"], status: "open", mode: "manual" },
  reopen: { from: ["closed", "full", "completed"], status: "open", mode: "manual" },
  close: { from: ["upcoming", "open", "full"], status: "closed", mode: "manual" },
  complete: { from: ["open", "full", "closed", "upcoming"], status: "completed", mode: "manual" },
  archive: { from: ["draft", "closed", "completed"], status: "archived", mode: "manual" },
};

catalogRouter.post("/intakes/:id/:action", async (req, res) => {
  const admin = currentUser(req);
  const id = param(req, "id");
  const actionName = parse(z.enum(Object.keys(ACTIONS) as [string, ...string[]]), req.params.action);
  const action = ACTIONS[actionName];
  const intake = await withTransaction(async (c) => {
    const row = await queryOne("SELECT * FROM intakes WHERE id = $1 FOR UPDATE", [id], c);
    if (!row) throw notFound("Intake not found");
    if (!action.from.includes(row.status)) {
      throw badRequest(`Can't ${actionName} an intake that is ${row.status}`);
    }
    if (["publish", "open", "reopen"].includes(actionName)) {
      const hasPrograms = await queryOne("SELECT 1 FROM intake_programs WHERE intake_id = $1", [id], c);
      if (!hasPrograms) throw badRequest("Add at least one program to this intake first");
    }
    // Automatic mode starts from a neutral status; the refresh below sets the real one
    const status = action.status ?? "upcoming";
    await c.query(
      `UPDATE intakes SET status = $2, status_mode = $3, published_at = coalesce(published_at, CASE WHEN $2 <> 'draft' THEN now() END)
       WHERE id = $1`,
      [id, status, action.mode],
    );
    if (action.mode === "auto") await refreshIntakeStatuses(c, id);
    await logActivity(admin.id, `intake.${actionName}`, "intake", id, { from: row.status }, c);
    return queryOne("SELECT * FROM intakes WHERE id = $1", [id], c);
  });
  res.json({ data: intake });
});

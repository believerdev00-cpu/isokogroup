import { Router } from "express";
import { z } from "zod";
import { actAs, query, queryOne, withTransaction } from "../../db.js";
import { badRequest, conflict, notFound, optionalDate, param, parse, uuid } from "../../lib/http.js";
import { logActivity } from "../../services/activity.js";
import { currentUser } from "../../middleware/auth.js";
import { approveApplication, decideApplication } from "../../services/enrollment.js";
import { nextNumber, yearOf } from "../../services/numbers.js";
import { storage } from "../../services/storage.js";

export const applicationsRouter = Router();

const APP_LIST = `
  SELECT a.id, a.reference, a.full_name, a.phone, a.email, a.status, a.submitted_at, a.reviewed_at, a.decision_note,
         (a.document_path IS NOT NULL) AS has_document,
         ip.id AS intake_program_id, p.id AS program_id, p.name AS program_name, i.id AS intake_id, i.name AS intake_name,
         s.available_seats, st.student_number
  FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
  JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
  JOIN intake_program_stats s ON s.intake_program_id = ip.id
  LEFT JOIN students st ON st.id = a.student_id`;

applicationsRouter.get("/applications", async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(["pending", "under_review", "approved", "rejected", "waitlisted", "withdrawn", "open"]).optional(),
      intake_id: uuid.optional(),
      program_id: uuid.optional(),
      intake_program_id: uuid.optional(),
      q: z.string().trim().max(100).optional(),
    }),
    req.query,
  );
  const rows = await query(
    `${APP_LIST}
     WHERE ($1::text IS NULL OR ($1 = 'open' AND a.status IN ('pending', 'under_review')) OR a.status = $1)
       AND ($2::uuid IS NULL OR i.id = $2) AND ($3::uuid IS NULL OR p.id = $3) AND ($4::uuid IS NULL OR ip.id = $4)
       AND ($5::text IS NULL OR a.full_name ILIKE '%' || $5 || '%' OR a.reference ILIKE '%' || $5 || '%'
            OR a.email ILIKE '%' || $5 || '%' OR a.phone ILIKE '%' || $5 || '%')
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'waitlisted' THEN 2 ELSE 3 END, a.submitted_at
     LIMIT 500`,
    [f.status ?? null, f.intake_id ?? null, f.program_id ?? null, f.intake_program_id ?? null, f.q || null],
  );
  const counts = await query(
    `SELECT a.status, count(*)::int AS count FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
     WHERE ($1::uuid IS NULL OR ip.intake_id = $1) AND ($2::uuid IS NULL OR ip.id = $2) GROUP BY a.status`,
    [f.intake_id ?? null, f.intake_program_id ?? null],
  );
  res.json({ data: { items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) } });
});

applicationsRouter.get("/applications/:id", async (req, res) => {
  const app = await queryOne(
    `SELECT a.*, (a.document_path IS NOT NULL) AS has_document, p.name AS program_name, i.name AS intake_name,
            i.id AS intake_id, s.available_seats, s.capacity, st.student_number, u.full_name AS reviewed_by_name,
            public.finance_totals_for('training.applications', a.id) AS fee,
            (SELECT json_agg(json_build_object('reference', o.reference, 'program', op.name, 'intake', oi.name, 'status', o.status))
             FROM applications o JOIN intake_programs oip ON oip.id = o.intake_program_id JOIN programs op ON op.id = oip.program_id
             JOIN intakes oi ON oi.id = oip.intake_id WHERE lower(o.email) = lower(a.email) AND o.id <> a.id) AS other_applications
     FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
     JOIN intake_program_stats s ON s.intake_program_id = ip.id
     LEFT JOIN students st ON st.id = a.student_id LEFT JOIN users u ON u.id = a.reviewed_by
     WHERE a.id = $1`,
    [param(req, "id")],
  );
  if (!app) throw notFound("Application not found");
  const { document_path: _d, pay_token: _t, ...rest } = app;
  res.json({ data: rest });
});

applicationsRouter.get("/applications/:id/document", async (req, res) => {
  const app = await queryOne("SELECT document_path FROM applications WHERE id = $1", [param(req, "id")]);
  if (!app?.document_path) throw notFound("No document attached");
  await storage.send(res, app.document_path);
});

const note = z.object({ note: z.string().trim().max(1000).nullish() });

// An admin corrects an application still being considered: the applicant's
// details, or the program it is for (another offering, in any intake still
// running). Moving it re-prices the registration fee in the ledger (database
// trigger application_fee_moved). Once approved, the student's profile is the
// record to edit instead.
const applicationEdit = z.object({
  intake_program_id: uuid,
  full_name: z.string().trim().min(3).max(120),
  date_of_birth: optionalDate,
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable(),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  address: z.string().trim().max(300),
  emergency_contact_name: z.string().trim().max(120),
  emergency_contact_phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid emergency contact phone")]),
  previous_education: z.string().trim().max(500),
  additional_info: z.string().trim().max(2000),
}).partial();

applicationsRouter.patch("/applications/:id", async (req, res) => {
  const id = param(req, "id");
  const admin = currentUser(req);
  const b = parse(applicationEdit, req.body ?? {});
  const fields = Object.keys(b) as (keyof typeof b)[];
  if (fields.length === 0) throw badRequest("Nothing to update");
  const row = await withTransaction(async (c) => {
    // the ledger (a fee re-priced by a move) records who did it
    await actAs(c, admin.id);
    const current = await queryOne("SELECT * FROM applications WHERE id = $1 FOR UPDATE", [id], c);
    if (!current) throw notFound("Application not found");
    if (!["pending", "under_review", "waitlisted"].includes(current.status)) {
      throw badRequest(current.status === "approved"
        ? "This application was approved: edit the student's profile instead"
        : `This application was ${current.status}; reset it to pending first to change it`);
    }
    const target = b.intake_program_id ?? current.intake_program_id;
    if (b.intake_program_id && b.intake_program_id !== current.intake_program_id) {
      const ip = await queryOne(
        `SELECT ip.id FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id
         WHERE ip.id = $1 AND i.status NOT IN ('completed', 'archived')`, [b.intake_program_id], c);
      if (!ip) throw badRequest("Choose a program in an intake that is still running");
    }
    const email = b.email ?? current.email;
    const duplicate = await queryOne(
      `SELECT reference FROM applications WHERE intake_program_id = $1 AND lower(email) = lower($2)
       AND id <> $3 AND status NOT IN ('rejected', 'withdrawn')`, [target, email, id], c);
    if (duplicate) throw conflict(`This person already has an application for that program (${duplicate.reference})`);
    const updated = await queryOne(
      `UPDATE applications SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
      [id, ...fields.map((f) => b[f] ?? null)], c);
    const changed = fields.filter((f) => String(current[f] ?? "") !== String(updated![f] ?? ""));
    if (changed.length) {
      await logActivity(admin.id, b.intake_program_id && b.intake_program_id !== current.intake_program_id
        ? "application.moved" : "application.edited", "application", id,
        { reference: current.reference, fields: changed, from_intake_program: current.intake_program_id, to_intake_program: target }, c);
    }
    return updated!;
  });
  const { document_path: _d, pay_token: _t, ...rest } = row;
  res.json({ data: rest });
});

applicationsRouter.post("/applications/:id/approve", async (req, res) => {
  const { note: n } = parse(note, req.body ?? {});
  res.json({ data: await approveApplication(param(req, "id"), currentUser(req).id, n) });
});

for (const [action, status] of [
  ["reject", "rejected"],
  ["waitlist", "waitlisted"],
  ["review", "under_review"],
  ["reset", "pending"],
] as const) {
  applicationsRouter.post(`/applications/:id/${action}`, async (req, res) => {
    const { note: n } = parse(note, req.body ?? {});
    res.json({ data: await decideApplication(param(req, "id"), currentUser(req).id, status, n) });
  });
}

// "Add Student": staff enter a walk-in applicant; this creates the application
// record (so every student has a reference) and approves it in the same step.
applicationsRouter.post("/students", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(
    z.object({
      intake_program_id: uuid,
      full_name: z.string().trim().min(3).max(120),
      date_of_birth: optionalDate,
      gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullish(),
      phone: z.string().trim().min(7).max(20),
      email: z.string().trim().toLowerCase().email(),
      address: z.string().trim().max(300).default(""),
      emergency_contact_name: z.string().trim().max(120).default(""),
      emergency_contact_phone: z.string().trim().max(20).default(""),
      previous_education: z.string().trim().max(500).default(""),
    }),
    req.body,
  );
  const ip = await queryOne(
    "SELECT ip.id, i.training_starts_on FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id WHERE ip.id = $1",
    [b.intake_program_id],
  );
  if (!ip) throw notFound("Program offering not found");
  const app = await withTransaction(async (c) =>
    queryOne(
      `INSERT INTO applications (reference, intake_program_id, full_name, date_of_birth, gender, phone, email, address,
         emergency_contact_name, emergency_contact_phone, previous_education, additional_info, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Added by staff', 'under_review') RETURNING id`,
      [await nextNumber("application", yearOf(ip.training_starts_on), c), ip.id, b.full_name, b.date_of_birth,
        b.gender ?? null, b.phone, b.email, b.address, b.emergency_contact_name, b.emergency_contact_phone,
        b.previous_education],
      c,
    ),
  );
  try {
    res.status(201).json({ data: await approveApplication(app!.id, admin.id, "Added by staff") });
  } catch (err) {
    // Leave no half-made application behind if enrollment wasn't possible
    await query("DELETE FROM applications WHERE id = $1 AND status <> 'approved'", [app!.id]);
    throw err;
  }
});

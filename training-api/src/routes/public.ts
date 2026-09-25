import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { DatabaseStore } from "../lib/rateLimitStore.js";
import { query, queryOne, withTransaction } from "../db.js";
import { badRequest, conflict, notFound, optionalDate, parse, uuid } from "../lib/http.js";
import { acceptingSql } from "../services/intakes.js";
import { notify, notifyAdminsOfApplication } from "../services/notifications.js";
import { nextNumber, yearOf } from "../services/numbers.js";
import { getSetting, today } from "../services/settings.js";
import { discardUpload, storage, upload } from "../services/storage.js";

// Everything a visitor can see or do without an account.
export const publicRouter = Router();

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isProduction ? 30 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new DatabaseStore("public-forms"),
  message: { error: { message: "Too many requests from your connection. Please try again later.", code: "rate_limited" } },
});

publicRouter.get("/center", async (_req, res) => {
  const [center, applications] = await Promise.all([getSetting("center"), getSetting("applications")]);
  const { timezone: _tz, ...publicCenter } = center;
  res.json({ data: { ...publicCenter, require_document: applications.require_document } });
});

const PROGRAM_PUBLIC = `p.id, p.code, p.name, p.slug, p.category, p.description, p.duration_value, p.duration_unit,
  p.tuition_fee, p.registration_fee, p.course_content, p.requirements`;

publicRouter.get("/programs", async (_req, res) => {
  res.json({ data: await query(`SELECT ${PROGRAM_PUBLIC} FROM programs p WHERE p.is_active ORDER BY p.category, p.name`) });
});

publicRouter.get("/programs/:slug", async (req, res) => {
  const slug = parse(z.string().max(120), req.params.slug);
  const program = await queryOne(`SELECT ${PROGRAM_PUBLIC} FROM programs p WHERE p.slug = $1 AND p.is_active`, [slug]);
  if (!program) throw notFound("Program not found");
  const d = await today();
  const offerings = await query(
    `SELECT i.name AS intake_name, i.slug AS intake_slug, i.training_starts_on, i.application_closes_on,
            ip.id AS intake_program_id, s.available_seats
     FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id
     JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE ip.program_id = $1 AND ${acceptingSql("$2")}
     ORDER BY i.training_starts_on`,
    [program.id, d],
  );
  res.json({ data: { ...program, open_intakes: offerings } });
});

/**
 * Available intakes: open, within the application window (unless an admin opened it
 * manually), with at least one program that still has seats. Full programs are
 * still listed, marked full, so applicants understand why they can't pick them.
 */
async function availableIntakes(slug?: string) {
  const d = await today();
  return query(
    `SELECT i.id, i.name, i.slug, i.description, i.location, i.application_opens_on, i.application_closes_on,
            i.training_starts_on, i.training_ends_on, i.status,
            json_agg(json_build_object(
              'intake_program_id', ip.id, 'program_id', p.id, 'name', p.name, 'slug', p.slug, 'code', p.code,
              'category', p.category, 'description', p.description, 'duration_value', p.duration_value,
              'duration_unit', p.duration_unit, 'requirements', p.requirements, 'schedule', ip.schedule,
              'tuition_fee', coalesce(ip.tuition_fee, p.tuition_fee),
              'registration_fee', coalesce(ip.registration_fee, p.registration_fee),
              'capacity', s.capacity, 'enrolled', s.enrolled, 'available_seats', s.available_seats,
              'is_full', (s.available_seats = 0 OR NOT s.accepting_applications)
            ) ORDER BY p.name) AS programs
     FROM intakes i
     JOIN intake_programs ip ON ip.intake_id = i.id
     JOIN programs p ON p.id = ip.program_id AND p.is_active
     JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE i.status = 'open'
       AND (i.status_mode = 'manual' OR $1::date BETWEEN i.application_opens_on AND i.application_closes_on)
       AND ($2::text IS NULL OR i.slug = $2)
       AND EXISTS (SELECT 1 FROM intake_program_stats s2 WHERE s2.intake_id = i.id
                   AND s2.accepting_applications AND s2.available_seats > 0)
     GROUP BY i.id
     ORDER BY i.training_starts_on`,
    [d, slug ?? null],
  );
}

publicRouter.get("/intakes", async (_req, res) => {
  res.json({ data: await availableIntakes() });
});

publicRouter.get("/intakes/:slug", async (req, res) => {
  const [intake] = await availableIntakes(parse(z.string().max(120), req.params.slug));
  if (!intake) throw notFound("This intake is not accepting applications");
  res.json({ data: intake });
});

const applicationFields = z.object({
  intake_program_id: uuid,
  full_name: z.string().trim().min(3, "Enter your full name").max(120),
  date_of_birth: optionalDate,
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullish(),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  address: z.string().trim().min(2, "Enter your address").max(300),
  emergency_contact_name: z.string().trim().min(2, "Enter an emergency contact").max(120),
  emergency_contact_phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid emergency contact phone"),
  previous_education: z.string().trim().min(2, "Tell us your highest education").max(500),
  additional_info: z.string().trim().max(2000).default(""),
});

// No account needed. Returns the application reference.
publicRouter.post("/applications", formLimiter, upload.single("document"), async (req, res) => {
  let key: string | null = null;
  try {
    const body = parse(applicationFields, req.body);
    const { require_document } = await getSetting("applications");
    if (require_document && !req.file) throw badRequest("Please attach your identification document");
    const d = await today();
    const ip = await queryOne(
      `SELECT ip.id, i.training_starts_on, i.name AS intake_name, p.name AS program_name
       FROM intake_programs ip JOIN intakes i ON i.id = ip.intake_id JOIN programs p ON p.id = ip.program_id AND p.is_active
       JOIN intake_program_stats s ON s.intake_program_id = ip.id
       WHERE ip.id = $1 AND ${acceptingSql("$2")}`,
      [body.intake_program_id, d],
    );
    if (!ip) throw badRequest("This program is not accepting applications (it may be full or the deadline has passed)");
    const duplicate = await queryOne(
      `SELECT reference FROM applications WHERE intake_program_id = $1 AND lower(email) = $2
       AND status NOT IN ('rejected', 'withdrawn')`,
      [ip.id, body.email],
    );
    if (duplicate) throw conflict(`You have already applied for this program (reference ${duplicate.reference})`);

    const application = await withTransaction(async (c) => {
      const reference = await nextNumber("application", yearOf(ip.training_starts_on), c);
      const row = await queryOne(
        `INSERT INTO applications (reference, intake_program_id, full_name, date_of_birth, gender, phone, email, address,
           emergency_contact_name, emergency_contact_phone, previous_education, additional_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, reference, submitted_at`,
        [reference, ip.id, body.full_name, body.date_of_birth, body.gender ?? null, body.phone, body.email, body.address,
          body.emergency_contact_name, body.emergency_contact_phone, body.previous_education, body.additional_info],
        c,
      );
      if (req.file) {
        key = await storage.save("application-documents", row!.id, req.file);
        await c.query("UPDATE applications SET document_path = $2 WHERE id = $1", [row!.id, key]);
      }
      await notify(
        {
          email: body.email,
          type: "application_submitted",
          title: `Application received — ${reference}`,
          body: `Dear ${body.full_name}, we have received your application for ${ip.program_name} (${ip.intake_name}). Your application number is ${reference}. Keep it to check your status online with your email address.`,
          link: "/application-status",
        },
        c,
      );
      await notifyAdminsOfApplication(c, `${body.full_name} applied for ${ip.program_name} (${ip.intake_name})`, row!.id);
      return row!;
    });
    res.status(201).json({
      data: { reference: application.reference, submitted_at: application.submitted_at, program: ip.program_name, intake: ip.intake_name },
    });
  } catch (err) {
    discardUpload(req.file);
    if (key) await storage.remove(key);
    throw err;
  }
});

const lookup = z.object({
  reference: z.string().trim().toUpperCase().max(40),
  email: z.string().trim().toLowerCase().email(),
});

// Applicants check their own application with the reference AND the email used,
// so a reference alone reveals nothing.
async function findOwnApplication(body: unknown) {
  const { reference, email } = parse(lookup, body);
  const app = await queryOne(
    `SELECT a.id, a.reference, a.full_name, a.status, a.submitted_at, a.reviewed_at,
            CASE WHEN a.status IN ('rejected', 'waitlisted') THEN a.decision_note END AS decision_note,
            p.name AS program_name, i.name AS intake_name, i.training_starts_on, st.student_number
     FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
     LEFT JOIN students st ON st.id = a.student_id
     WHERE a.reference = $1 AND lower(a.email) = $2`,
    [reference, email],
  );
  if (!app) throw notFound("No application matches this number and email");
  return app;
}

publicRouter.post("/applications/status", formLimiter, async (req, res) => {
  const { id: _id, ...app } = await findOwnApplication(req.body);
  res.json({ data: app });
});

publicRouter.post("/applications/withdraw", formLimiter, async (req, res) => {
  const app = await findOwnApplication(req.body);
  if (!["pending", "under_review", "waitlisted"].includes(app.status)) {
    throw badRequest(`An application that is ${app.status.replace("_", " ")} can't be withdrawn online`);
  }
  await query("UPDATE applications SET status = 'withdrawn' WHERE id = $1", [app.id]);
  res.json({ data: { reference: app.reference, status: "withdrawn" } });
});

// Anyone can check a certificate. The verification code (random, printed on the
// certificate) shows whose it is; certificate numbers run in sequence, so a
// number alone only confirms that it exists and is valid (otherwise walking
// the numbers would list every graduate's name and grade).
publicRouter.get("/certificates/verify/:code", formLimiter, async (req, res) => {
  const code = parse(z.string().trim().toUpperCase().min(5).max(40), req.params.code);
  const cert = await queryOne(
    `SELECT certificate_number, student_name, program_name, intake_name, final_grade, issued_on,
            revoked_at IS NOT NULL AS revoked
     FROM certificates WHERE verification_code = $1`,
    [code],
  );
  if (cert) {
    res.json({ data: { valid: !cert.revoked, ...cert } });
    return;
  }
  const byNumber = await queryOne(
    "SELECT certificate_number, program_name, issued_on, revoked_at IS NOT NULL AS revoked FROM certificates WHERE certificate_number = $1",
    [code],
  );
  res.json({ data: byNumber ? { valid: !byNumber.revoked, needs_code: true, ...byNumber } : { valid: false, not_found: true } });
});


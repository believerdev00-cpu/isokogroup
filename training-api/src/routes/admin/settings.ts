import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../../db.js";
import { badRequest, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { notify } from "../../services/notifications.js";
import { allSettings, getSetting } from "../../services/settings.js";

export const settingsRouter = Router();

const SCHEMAS = {
  center: z.object({
    name: z.string().trim().min(2).max(120),
    tagline: z.string().trim().max(160),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40),
    address: z.string().trim().max(300),
    // the currencies the platform ledger keeps accounts in
    currency: z.string().trim().toUpperCase().pipe(z.enum(["RWF", "USD", "EUR"], { errorMap: () => ({ message: "use RWF, USD or EUR" }) })),
    timezone: z.string().trim().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "unknown time zone"),
  }),
  grading: z.object({
    pass_mark: z.coerce.number().min(0).max(100),
    scale: z
      .array(z.object({ grade: z.string().trim().min(1).max(3), min: z.coerce.number().min(0).max(100) }))
      .min(2)
      .max(12)
      .refine((s) => s.some((g) => g.min === 0), "the lowest grade must start at 0"),
  }),
  certificate_requirements: z.object({
    require_completed: z.boolean(),
    min_attendance: z.coerce.number().min(0).max(100),
    require_all_assessments: z.boolean(),
    require_pass: z.boolean(),
    require_fees_cleared: z.boolean(),
  }),
  applications: z.object({ require_document: z.boolean() }),
} as const;

settingsRouter.get("/settings", async (_req, res) => {
  res.json({ data: await allSettings() });
});

settingsRouter.put("/settings/:key", async (req, res) => {
  const admin = currentUser(req);
  const key = parse(z.enum(Object.keys(SCHEMAS) as [keyof typeof SCHEMAS]), req.params.key);
  const value = parse(SCHEMAS[key], req.body);
  if (key === "center") {
    // Fees already owed are kept in the currency they were charged in
    const current = await getSetting("center");
    const charged = await queryOne("SELECT 1 FROM public.finance_accounts WHERE module = 'training' LIMIT 1");
    if (charged && (value as { currency: string }).currency !== current.currency) {
      throw badRequest("The currency can't change once fees have been charged");
    }
  }
  await query("UPDATE settings SET value = $2, updated_at = now() WHERE key = $1", [key, JSON.stringify(value)]);
  await logActivity(admin.id, "settings.updated", "settings", null, { key });
  res.json({ data: value });
});

// ============== ANNOUNCEMENTS ==============
settingsRouter.get("/announcements", async (_req, res) => {
  res.json({
    data: await query(
      `SELECT a.*, u.full_name AS author, cl.code AS class_code, i.name AS intake_name
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN classes cl ON cl.id = a.class_id LEFT JOIN intakes i ON i.id = a.intake_id
       ORDER BY a.created_at DESC LIMIT 200`,
    ),
  });
});

settingsRouter.post("/announcements", async (req, res) => {
  const admin = currentUser(req);
  const b = parse(
    z.object({
      title: z.string().trim().min(2).max(160),
      body: z.string().trim().min(2).max(4000),
      audience: z.enum(["all", "students", "trainers", "intake", "class"]),
      intake_id: uuid.nullish(),
      class_id: uuid.nullish(),
    }),
    req.body,
  );
  if (b.audience === "intake" && !b.intake_id) throw badRequest("Choose the intake");
  if (b.audience === "class" && !b.class_id) throw badRequest("Choose the class");
  const row = await withTransaction(async (c) => {
    const a = await queryOne(
      "INSERT INTO announcements (title, body, audience, intake_id, class_id, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [b.title, b.body, b.audience, b.audience === "intake" ? b.intake_id : null, b.audience === "class" ? b.class_id : null, admin.id],
      c,
    );
    const recipients = await query<{ id: string; role: string }>(
      `SELECT DISTINCT u.id, u.role FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN intake_programs ip ON ip.id = e.intake_program_id
       LEFT JOIN class_students cs ON cs.enrollment_id = e.id
       WHERE u.is_active AND u.role <> 'admin' AND (
         $1 = 'all' OR ($1 = 'students' AND u.role = 'student') OR ($1 = 'trainers' AND u.role = 'trainer')
         OR ($1 = 'intake' AND ip.intake_id = $2) OR ($1 = 'class' AND cs.class_id = $3))`,
      [b.audience, b.intake_id ?? null, b.class_id ?? null],
      c,
    );
    for (const r of recipients) {
      await notify({ userId: r.id, type: "announcement", title: b.title, body: b.body, link: `/${r.role}/announcements` }, c);
    }
    await logActivity(admin.id, "announcement.created", "announcement", a!.id, { audience: b.audience, recipients: recipients.length }, c);
    return a;
  });
  res.status(201).json({ data: row });
});

settingsRouter.delete("/announcements/:id", async (req, res) => {
  await query("DELETE FROM announcements WHERE id = $1", [param(req, "id")]);
  res.json({ data: { ok: true } });
});

settingsRouter.get("/activity", async (_req, res) => {
  res.json({
    data: await query(
      `SELECT l.*, u.full_name AS actor_name FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.created_at DESC LIMIT 100`,
    ),
  });
});

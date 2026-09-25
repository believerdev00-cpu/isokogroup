import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db.js";
import { parse } from "../../lib/http.js";
import { getSetting, today } from "../../services/settings.js";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", async (_req, res) => {
  const d = await today();
  const center = await getSetting("center");
  const stats = await queryOne(
    `SELECT
       (SELECT count(*) FROM intakes WHERE status = 'open')::int AS open_intakes,
       (SELECT count(DISTINCT student_id) FROM enrollments WHERE status = 'active')::int AS active_students,
       (SELECT count(*) FROM applications WHERE status IN ('pending', 'under_review'))::int AS pending_applications,
       (SELECT count(*) FROM programs WHERE is_active)::int AS active_programs,
       (SELECT count(*) FROM trainers t JOIN users u ON u.id = t.user_id WHERE t.is_active AND u.is_active)::int AS active_trainers,
       (SELECT count(*) FROM classes cl JOIN intake_programs ip ON ip.id = cl.intake_program_id JOIN intakes i ON i.id = ip.intake_id
        WHERE cl.status = 'active' AND extract(isodow FROM $1::date)::smallint = ANY(cl.meeting_days)
          AND $1::date BETWEEN i.training_starts_on AND i.training_ends_on)::int AS classes_today,
       (SELECT coalesce(sum(amount - refunded_amount), 0) FROM payments WHERE voided_at IS NULL)::numeric AS fees_collected,
       (SELECT coalesce(sum(amount - refunded_amount), 0) FROM payments WHERE voided_at IS NULL
        AND date_trunc('month', paid_on) = date_trunc('month', $1::date))::numeric AS fees_this_month,
       (SELECT coalesce(sum(greatest(b.total_fees - b.total_paid, 0)), 0) FROM enrollment_balances b
        JOIN enrollments e ON e.id = b.enrollment_id WHERE e.status <> 'withdrawn')::numeric AS outstanding_fees`,
    [d],
  );

  // The intake people are applying to now, else the one in training, else the latest
  const current = await queryOne(
    `SELECT id, name, status, application_closes_on, training_starts_on, training_ends_on FROM intakes
     WHERE status NOT IN ('draft', 'archived')
     ORDER BY CASE WHEN status IN ('open', 'full') THEN 0
                   WHEN $1::date BETWEEN training_starts_on AND training_ends_on THEN 1 ELSE 2 END,
              abs($1::date - training_starts_on)
     LIMIT 1`,
    [d],
  );
  const overview = await query(
    `SELECT i.id AS intake_id, i.name AS intake_name, i.status AS intake_status, ip.id AS intake_program_id,
            p.name AS program_name, s.capacity, s.enrolled, s.available_seats,
            (SELECT count(*) FROM applications a WHERE a.intake_program_id = ip.id AND a.status IN ('pending', 'under_review'))::int AS pending
     FROM intakes i JOIN intake_programs ip ON ip.intake_id = i.id JOIN programs p ON p.id = ip.program_id
     JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE i.id = $1 OR i.status IN ('open', 'full')
     ORDER BY i.id = $1 DESC, i.training_starts_on, p.name`,
    [current?.id ?? null],
  );
  const attention = await queryOne(
    `SELECT
       (SELECT count(*) FROM enrollments e WHERE e.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM class_students cs WHERE cs.enrollment_id = e.id))::int AS students_without_class,
       (SELECT count(*) FROM classes WHERE status = 'active' AND trainer_id IS NULL)::int AS classes_without_trainer,
       (SELECT count(*) FROM applications WHERE status = 'waitlisted')::int AS waitlisted`,
  );
  const todays = await query(
    `SELECT cl.id, cl.code, cl.room, to_char(cl.start_time, 'HH24:MI') AS start_time, to_char(cl.end_time, 'HH24:MI') AS end_time,
            p.name AS program_name, tu.full_name AS trainer_name,
            EXISTS (SELECT 1 FROM class_sessions cs JOIN attendance a ON a.session_id = cs.id
                    WHERE cs.class_id = cl.id AND cs.session_date = $1::date) AS attendance_taken
     FROM classes cl JOIN intake_programs ip ON ip.id = cl.intake_program_id JOIN programs p ON p.id = ip.program_id
     JOIN intakes i ON i.id = ip.intake_id LEFT JOIN trainers t ON t.id = cl.trainer_id LEFT JOIN users tu ON tu.id = t.user_id
     WHERE cl.status = 'active' AND extract(isodow FROM $1::date)::smallint = ANY(cl.meeting_days)
       AND $1::date BETWEEN i.training_starts_on AND i.training_ends_on
     ORDER BY cl.start_time`,
    [d],
  );
  res.json({ data: { today: d, currency: center.currency, stats, current_intake: current, overview, attention, todays_classes: todays } });
});

// One search box for staff: students, applications, programs and intakes.
dashboardRouter.get("/search", async (req, res) => {
  const q = parse(z.string().trim().min(2, "Type at least 2 characters").max(100), req.query.q);
  const like = `%${q}%`;
  const [students, applications, programs, intakes] = await Promise.all([
    query(
      `SELECT id, student_number, full_name, phone, email FROM students
       WHERE full_name ILIKE $1 OR student_number ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
       ORDER BY full_name LIMIT 8`,
      [like],
    ),
    query(
      `SELECT a.id, a.reference, a.full_name, a.status, p.name AS program_name, i.name AS intake_name
       FROM applications a JOIN intake_programs ip ON ip.id = a.intake_program_id
       JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
       WHERE a.reference ILIKE $1 OR a.full_name ILIKE $1 OR a.phone ILIKE $1 OR a.email ILIKE $1
       ORDER BY a.submitted_at DESC LIMIT 8`,
      [like],
    ),
    query("SELECT id, code, name FROM programs WHERE name ILIKE $1 OR code ILIKE $1 ORDER BY name LIMIT 5", [like]),
    query("SELECT id, name, status FROM intakes WHERE name ILIKE $1 ORDER BY training_starts_on DESC LIMIT 5", [like]),
  ]);
  res.json({ data: { students, applications, programs, intakes } });
});

import { Router } from "express";
import { query } from "../db.js";
import { currentTrainerId, requireRole } from "../middleware/auth.js";
import { today } from "../services/settings.js";

// A trainer's own classes, timetable and announcements. Class work itself lives in
// the teaching routes, which re-check that the class is theirs.
export const trainerRouter = Router();
trainerRouter.use(requireRole("trainer"));

const MY_CLASSES = `
  SELECT cl.id, cl.code, cl.room, cl.meeting_days, to_char(cl.start_time, 'HH24:MI') AS start_time,
         to_char(cl.end_time, 'HH24:MI') AS end_time, cl.status,
         p.name AS program_name, i.name AS intake_name, i.training_starts_on, i.training_ends_on,
         (SELECT count(*) FROM class_students cs JOIN enrollments e ON e.id = cs.enrollment_id
          WHERE cs.class_id = cl.id AND e.status <> 'withdrawn')::int AS student_count
  FROM classes cl JOIN intake_programs ip ON ip.id = cl.intake_program_id
  JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
  WHERE cl.trainer_id = $1`;

trainerRouter.get("/classes", async (req, res) => {
  const trainerId = await currentTrainerId(req);
  res.json({ data: await query(`${MY_CLASSES} ORDER BY cl.status, i.training_starts_on DESC, cl.start_time`, [trainerId]) });
});

// Today's classes: meeting today, within the training period, with today's lesson
// topic and whether attendance was taken.
trainerRouter.get("/dashboard", async (req, res) => {
  const trainerId = await currentTrainerId(req);
  const d = await today();
  const todays = await query(
    `SELECT c.*, cs.topic AS lesson_topic, cs.id AS session_id,
            (SELECT count(*) FROM attendance a WHERE a.session_id = cs.id)::int AS attendance_taken
     FROM (${MY_CLASSES}) c
     LEFT JOIN class_sessions cs ON cs.class_id = c.id AND cs.session_date = $2::date
     WHERE c.status = 'active' AND extract(isodow FROM $2::date)::smallint = ANY(c.meeting_days)
       AND $2::date BETWEEN c.training_starts_on AND c.training_ends_on
     ORDER BY c.start_time`,
    [trainerId, d],
  );
  const active = await query(`${MY_CLASSES} AND cl.status = 'active' ORDER BY cl.start_time`, [trainerId]);
  res.json({ data: { today: d, todays_classes: todays, active_classes: active } });
});

trainerRouter.get("/schedule", async (req, res) => {
  const trainerId = await currentTrainerId(req);
  res.json({ data: await query(`${MY_CLASSES} AND cl.status = 'active' ORDER BY cl.start_time`, [trainerId]) });
});

trainerRouter.get("/announcements", async (req, res) => {
  const trainerId = await currentTrainerId(req);
  res.json({
    data: await query(
      `SELECT a.id, a.title, a.body, a.audience, a.created_at, cl.code AS class_code, u.full_name AS author
       FROM announcements a LEFT JOIN classes cl ON cl.id = a.class_id LEFT JOIN users u ON u.id = a.created_by
       WHERE a.audience IN ('all', 'trainers') OR (a.audience = 'class' AND cl.trainer_id = $1)
       ORDER BY a.created_at DESC LIMIT 50`,
      [trainerId],
    ),
  });
});

import type { Request } from "express";
import { queryOne } from "../db.js";
import { notFound } from "./http.js";
import { currentUser } from "../middleware/auth.js";

/**
 * Loads a class the signed-in user may teach: admins may open any class, trainers
 * only classes assigned to them. Anything else looks like "not found", so class
 * IDs of other trainers don't leak.
 */
export async function classForTeaching(req: Request, classId: string) {
  const me = currentUser(req);
  const klass = await queryOne(
    `SELECT cl.*, p.name AS program_name, p.code AS program_code, i.name AS intake_name, i.id AS intake_id,
            i.training_starts_on, i.training_ends_on, tu.full_name AS trainer_name, t.user_id AS trainer_user_id
     FROM classes cl JOIN intake_programs ip ON ip.id = cl.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
     LEFT JOIN trainers t ON t.id = cl.trainer_id LEFT JOIN users tu ON tu.id = t.user_id
     WHERE cl.id = $1`,
    [classId],
  );
  if (!klass) throw notFound("Class not found");
  if (me.role === "admin") return klass;
  if (me.role === "trainer" && klass.trainer_user_id === me.id) return klass;
  throw notFound("Class not found");
}

/** An assessment together with its class, for someone allowed to teach that class. */
export async function assessmentForTeaching(req: Request, assessmentId: string) {
  const a = await queryOne("SELECT * FROM assessments WHERE id = $1", [assessmentId]);
  if (!a) throw notFound("Assessment not found");
  const klass = await classForTeaching(req, a.class_id);
  return { assessment: a, klass };
}

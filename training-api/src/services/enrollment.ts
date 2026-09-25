import type { PoolClient } from "pg";
import { actAs, query, queryOne, withTransaction } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { logActivity } from "./activity.js";
import { createUserAccount, temporaryPassword } from "./auth.js";
import { refreshIntakeStatuses } from "./intakes.js";
import { notify } from "./notifications.js";
import { nextNumber, yearOf } from "./numbers.js";

type ApprovalResult = {
  application_id: string;
  student_id: string;
  student_number: string;
  enrollment_id: string;
  class_code: string | null;
  /** Only when a portal account was just created: share these once with the student. */
  login: { email: string; temporary_password: string | null } | null;
};

/**
 * Approving an application does everything in one transaction:
 * finds or creates the student (one record per person, matched by email), enrolls
 * them in the intake program if a seat is free, copies in the fees, places them in
 * the least-full class, opens a portal account, marks the application approved,
 * refreshes the intake's status and notifies the applicant.
 */
export async function approveApplication(applicationId: string, adminId: string, note?: string | null): Promise<ApprovalResult> {
  return withTransaction(async (c) => {
    const app = await queryOne("SELECT * FROM applications WHERE id = $1 FOR UPDATE", [applicationId], c);
    if (!app) throw notFound("Application not found");
    if (app.status === "approved") throw conflict("This application is already approved");
    if (app.status === "withdrawn") throw badRequest("This application was withdrawn");

    // Lock the intake program so two approvals can't take the last seat
    const ip = await queryOne(
      `SELECT ip.*, p.name AS program_name, p.code AS program_code, p.tuition_fee AS program_tuition,
              p.registration_fee AS program_registration, i.name AS intake_name, i.training_starts_on, i.status AS intake_status
       FROM intake_programs ip JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
       WHERE ip.id = $1 FOR UPDATE OF ip`,
      [app.intake_program_id],
      c,
    );
    if (["completed", "archived"].includes(ip.intake_status)) throw badRequest("This intake is no longer running");
    const seats = await queryOne("SELECT available_seats FROM intake_program_stats WHERE intake_program_id = $1", [ip.id], c);
    if (seats!.available_seats <= 0) {
      throw conflict(`${ip.program_name} is full for ${ip.intake_name}. Waitlist the applicant or increase the capacity.`);
    }

    const year = yearOf(ip.training_starts_on);
    let student = await queryOne("SELECT * FROM students WHERE lower(email) = lower($1) FOR UPDATE", [app.email], c);
    if (student) {
      const already = await queryOne(
        "SELECT 1 FROM enrollments WHERE student_id = $1 AND intake_program_id = $2",
        [student.id, ip.id],
        c,
      );
      if (already) throw conflict(`${student.full_name} is already enrolled in this program for this intake`);
      // The application's email isn't verified, so it only fills in details the
      // student record doesn't have yet; it never overwrites them
      student = await queryOne(
        `UPDATE students SET phone = coalesce(nullif(phone, ''), $2), address = coalesce(nullif(address, ''), $3),
           emergency_contact_name = coalesce(nullif(emergency_contact_name, ''), $4),
           emergency_contact_phone = coalesce(nullif(emergency_contact_phone, ''), $5)
         WHERE id = $1 RETURNING *`,
        [student.id, app.phone, app.address, app.emergency_contact_name, app.emergency_contact_phone],
        c,
      );
    } else {
      student = await queryOne(
        `INSERT INTO students (student_number, full_name, date_of_birth, gender, phone, email, address,
                               emergency_contact_name, emergency_contact_phone, previous_education)
         VALUES ($1, $2, $3, $4, $5, lower($6), $7, $8, $9, $10) RETURNING *`,
        [await nextNumber("student", year, c), app.full_name, app.date_of_birth, app.gender, app.phone, app.email,
          app.address, app.emergency_contact_name, app.emergency_contact_phone, app.previous_education],
        c,
      );
    }

    const enrollment = await queryOne(
      "INSERT INTO enrollments (student_id, intake_program_id, application_id) VALUES ($1, $2, $3) RETURNING *",
      [student.id, ip.id, app.id],
      c,
    );
    // Fees become charges in the platform ledger (a database trigger), recorded as this admin
    await actAs(c, adminId);
    const registration = Number(ip.registration_fee ?? ip.program_registration);
    const tuition = Number(ip.tuition_fee ?? ip.program_tuition);
    if (registration > 0) {
      await c.query(
        "INSERT INTO fee_charges (enrollment_id, type, description, amount, created_by) VALUES ($1, 'registration', $2, $3, $4)",
        [enrollment.id, `Registration fee — ${ip.program_name}`, registration, adminId],
      );
    }
    if (tuition > 0) {
      await c.query(
        "INSERT INTO fee_charges (enrollment_id, type, description, amount, created_by) VALUES ($1, 'tuition', $2, $3, $4)",
        [enrollment.id, `Tuition — ${ip.program_name}, ${ip.intake_name}`, tuition, adminId],
      );
    }

    const klass = await placeInClass(c, enrollment.id, ip.id);
    const login = await ensureStudentAccount(c, student);

    await c.query(
      `UPDATE applications SET status = 'approved', student_id = $2, reviewed_by = $3, reviewed_at = now(),
         decision_note = coalesce($4, decision_note) WHERE id = $1`,
      [app.id, student.id, adminId, note ?? null],
    );
    await refreshIntakeStatuses(c, ip.intake_id);
    await logActivity(adminId, "application.approved", "application", app.id, { student_number: student.student_number }, c);

    // The password goes in the email only, never into the in-app notice
    const loginText = login?.temporary_password
      ? `\n\nYour student portal login is ${login.email}. Your temporary password is in the email we sent you; you'll choose a new one when you first sign in.`
      : "\n\nSign in to the student portal with your existing Isoko account.";
    await notify(
      {
        userId: student.user_id ?? login?.userId ?? null,
        email: app.email,
        type: "application_approved",
        title: `Application approved — ${ip.program_name}`,
        body: `Congratulations ${app.full_name}! Your application ${app.reference} for ${ip.program_name} (${ip.intake_name}) has been approved. Your student number is ${student.student_number}.${klass ? ` Your class is ${klass.code}.` : ""}${loginText}`,
        link: "/login",
        emailSecret: login?.temporary_password ? `Temporary password: ${login.temporary_password}` : null,
      },
      c,
    );

    return {
      application_id: app.id,
      student_id: student.id,
      student_number: student.student_number,
      enrollment_id: enrollment.id,
      class_code: klass?.code ?? null,
      login: login ? { email: login.email, temporary_password: login.temporary_password } : null,
    };
  });
}

/** Adds the enrollment to the active class with the fewest students, if the program has one. */
export async function placeInClass(c: PoolClient, enrollmentId: string, intakeProgramId: string) {
  const klass = await queryOne<{ id: string; code: string }>(
    `SELECT cl.id, cl.code FROM classes cl
     LEFT JOIN class_students cs ON cs.class_id = cl.id
     WHERE cl.intake_program_id = $1 AND cl.status = 'active'
     GROUP BY cl.id ORDER BY count(cs.id), cl.code LIMIT 1`,
    [intakeProgramId],
    c,
  );
  if (klass) {
    await c.query(
      "INSERT INTO class_students (class_id, enrollment_id) VALUES ($1, $2) ON CONFLICT (enrollment_id) DO NOTHING",
      [klass.id, enrollmentId],
    );
  }
  return klass;
}

async function ensureStudentAccount(c: PoolClient, student: { id: string; user_id: string | null; email: string; full_name: string; phone: string }) {
  if (student.user_id) return null;
  const existing = await queryOne<{ id: string; role: string }>("SELECT id, role FROM users WHERE lower(email) = lower($1)", [student.email], c);
  if (existing) {
    if (existing.role !== "student") {
      throw conflict(`${student.email} already belongs to a ${existing.role} account. Use a different email for the student.`);
    }
    await c.query("UPDATE students SET user_id = $2 WHERE id = $1", [student.id, existing.id]);
    student.user_id = existing.id;
    return null;
  }
  const password = temporaryPassword();
  const user = await createUserAccount(
    { email: student.email, password, role: "student", full_name: student.full_name, phone: student.phone, must_change_password: true },
    c,
  );
  await c.query("UPDATE students SET user_id = $2 WHERE id = $1", [student.id, user.id]);
  return { userId: user.id, email: user.email, temporary_password: user.password };
}

/** Moves an application to a non-approval status and tells the applicant. */
export async function decideApplication(
  applicationId: string,
  adminId: string,
  status: "under_review" | "rejected" | "waitlisted" | "pending",
  note?: string | null,
) {
  return withTransaction(async (c) => {
    const app = await queryOne(
      `SELECT a.*, p.name AS program_name, i.name AS intake_name FROM applications a
       JOIN intake_programs ip ON ip.id = a.intake_program_id JOIN programs p ON p.id = ip.program_id
       JOIN intakes i ON i.id = ip.intake_id WHERE a.id = $1 FOR UPDATE OF a`,
      [applicationId],
      c,
    );
    if (!app) throw notFound("Application not found");
    if (app.status === "approved") throw badRequest("Approved applications can't be changed here; withdraw the enrollment instead");
    if (app.status === "withdrawn") throw badRequest("This application was withdrawn");
    const updated = await queryOne(
      `UPDATE applications SET status = $2, decision_note = coalesce($3, decision_note), reviewed_by = $4, reviewed_at = now()
       WHERE id = $1 RETURNING *`,
      [app.id, status, note ?? null, adminId],
      c,
    );
    await logActivity(adminId, `application.${status}`, "application", app.id, { note }, c);
    if (status === "rejected" || status === "waitlisted") {
      await notify(
        {
          email: app.email,
          type: status === "rejected" ? "application_rejected" : "application_waitlisted",
          title: status === "rejected" ? `Application ${app.reference}: not successful` : `Application ${app.reference}: waitlisted`,
          body:
            status === "rejected"
              ? `Dear ${app.full_name}, thank you for applying to ${app.program_name} (${app.intake_name}). Unfortunately we can't offer you a place this time.${note ? ` Note: ${note}` : ""}`
              : `Dear ${app.full_name}, ${app.program_name} (${app.intake_name}) is currently full. You're on the waiting list and we'll contact you if a seat opens.`,
          link: "/application-status",
        },
        c,
      );
    }
    return updated;
  });
}

export async function enrollmentIdsForStudent(studentId: string) {
  return (await query<{ id: string }>("SELECT id FROM enrollments WHERE student_id = $1 ORDER BY enrolled_on DESC", [studentId])).map((r) => r.id);
}

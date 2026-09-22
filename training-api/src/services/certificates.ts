import crypto from "node:crypto";
import { queryOne, withTransaction } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { logActivity } from "./activity.js";
import { summaryFor } from "./metrics.js";
import { notify } from "./notifications.js";
import { nextNumber, yearOf } from "./numbers.js";
import { getSetting } from "./settings.js";

export type Eligibility = {
  eligible: boolean;
  checks: { key: string; label: string; required: boolean; met: boolean; detail: string }[];
};

/** Checks an enrollment against the certificate requirements set in Settings. */
export async function certificateEligibility(enrollmentId: string): Promise<Eligibility> {
  const e = await queryOne("SELECT status FROM enrollments WHERE id = $1", [enrollmentId]);
  if (!e) throw notFound("Enrollment not found");
  const req = await getSetting("certificate_requirements");
  const grading = await getSetting("grading");
  const s = await summaryFor(enrollmentId);
  const rate = s.attendance.rate;
  const r = s.results;
  const checks = [
    {
      key: "completed",
      label: "Program completed",
      required: req.require_completed,
      met: e.status === "completed",
      detail: e.status === "completed" ? "Marked completed" : `Enrollment is ${e.status}`,
    },
    {
      key: "attendance",
      label: `Attendance at least ${req.min_attendance}%`,
      required: req.min_attendance > 0,
      met: rate !== null && rate >= req.min_attendance,
      detail: rate === null ? "No attendance recorded" : `${rate}%`,
    },
    {
      key: "assessments",
      label: "All assessments marked",
      required: req.require_all_assessments,
      met: r.assessments_total > 0 && r.assessments_completed === r.assessments_total,
      detail: `${r.assessments_completed} of ${r.assessments_total} marked`,
    },
    {
      key: "pass",
      label: `Final mark at least ${grading.pass_mark}%`,
      required: req.require_pass,
      met: r.passed === true,
      detail: r.final_percentage === null ? "No results yet" : `${r.final_percentage}% (${r.grade})`,
    },
    {
      key: "fees",
      label: "Fees cleared",
      required: req.require_fees_cleared,
      met: s.finance.balance <= 0,
      detail: s.finance.balance <= 0 ? "Fully paid" : `Balance ${s.finance.balance}`,
    },
  ];
  return { eligible: checks.every((c) => !c.required || c.met), checks };
}

const verificationCode = () =>
  Array.from(crypto.randomBytes(10), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("").replace(/(.{5})(.{5})/, "$1-$2");

export async function issueCertificate(enrollmentId: string, adminId: string) {
  const eligibility = await certificateEligibility(enrollmentId);
  if (!eligibility.eligible) {
    const missing = eligibility.checks.filter((c) => c.required && !c.met).map((c) => c.label);
    throw badRequest(`Not eligible yet: ${missing.join(", ")}`);
  }
  const summary = await summaryFor(enrollmentId);
  return withTransaction(async (c) => {
    const e = await queryOne(
      `SELECT e.id, s.full_name, s.email, s.user_id, p.name AS program_name, i.name AS intake_name, i.training_starts_on
       FROM enrollments e JOIN students s ON s.id = e.student_id
       JOIN intake_programs ip ON ip.id = e.intake_program_id JOIN programs p ON p.id = ip.program_id
       JOIN intakes i ON i.id = ip.intake_id WHERE e.id = $1 FOR UPDATE OF e`,
      [enrollmentId],
      c,
    );
    const existing = await queryOne("SELECT certificate_number, revoked_at FROM certificates WHERE enrollment_id = $1", [enrollmentId], c);
    if (existing) throw conflict(`Certificate ${existing.certificate_number} was already issued for this enrollment`);
    const cert = await queryOne(
      `INSERT INTO certificates (enrollment_id, certificate_number, verification_code, student_name, program_name,
                                 intake_name, final_grade, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [e.id, await nextNumber("certificate", yearOf(e.training_starts_on), c), verificationCode(), e.full_name,
        e.program_name, e.intake_name, summary.results.grade, adminId],
      c,
    );
    await logActivity(adminId, "certificate.issued", "certificate", cert.id, { number: cert.certificate_number }, c);
    await notify(
      {
        userId: e.user_id,
        email: e.email,
        type: "certificate_issued",
        title: "Your certificate is ready",
        body: `Congratulations ${e.full_name}! Your certificate for ${e.program_name} (${e.intake_name}) has been issued: ${cert.certificate_number}. Download it from your student portal.`,
        link: "/student/certificate",
      },
      c,
    );
    return cert;
  });
}

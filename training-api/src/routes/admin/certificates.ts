import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db.js";
import { badRequest, param, parse, uuid } from "../../lib/http.js";
import { currentUser } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { certificateEligibility, issueCertificate } from "../../services/certificates.js";
import { certificatePdf } from "../../services/pdf.js";

export const certificatesRouter = Router();

certificatesRouter.get("/certificates", async (req, res) => {
  const f = parse(z.object({ intake_id: uuid.optional(), q: z.string().trim().max(100).optional() }), req.query);
  res.json({
    data: await query(
      `SELECT c.*, s.id AS student_id, s.student_number, u.full_name AS issued_by_name
       FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id JOIN students s ON s.id = e.student_id
       JOIN intake_programs ip ON ip.id = e.intake_program_id LEFT JOIN users u ON u.id = c.issued_by
       WHERE ($1::uuid IS NULL OR ip.intake_id = $1)
         AND ($2::text IS NULL OR c.student_name ILIKE '%' || $2 || '%' OR c.certificate_number ILIKE '%' || $2 || '%'
              OR s.student_number ILIKE '%' || $2 || '%')
       ORDER BY c.issued_on DESC, c.created_at DESC`,
      [f.intake_id ?? null, f.q || null],
    ),
  });
});

// Completed enrollments without a certificate, with what's still missing for each.
certificatesRouter.get("/certificates/candidates", async (req, res) => {
  const f = parse(z.object({ intake_id: uuid.optional() }), req.query);
  const rows = await query(
    `SELECT e.id AS enrollment_id, e.status, s.id AS student_id, s.student_number, s.full_name,
            p.name AS program_name, i.name AS intake_name
     FROM enrollments e JOIN students s ON s.id = e.student_id JOIN intake_programs ip ON ip.id = e.intake_program_id
     JOIN programs p ON p.id = ip.program_id JOIN intakes i ON i.id = ip.intake_id
     WHERE e.status IN ('completed', 'active') AND ($1::uuid IS NULL OR i.id = $1)
       AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.enrollment_id = e.id)
     ORDER BY e.status DESC, i.training_ends_on, s.full_name LIMIT 300`,
    [f.intake_id ?? null],
  );
  const withChecks = await Promise.all(rows.map(async (r) => ({ ...r, eligibility: await certificateEligibility(r.enrollment_id) })));
  res.json({ data: withChecks });
});

certificatesRouter.post("/enrollments/:id/certificate", async (req, res) => {
  res.status(201).json({ data: await issueCertificate(param(req, "id"), currentUser(req).id) });
});

certificatesRouter.post("/certificates/:id/revoke", async (req, res) => {
  const admin = currentUser(req);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }), req.body);
  const row = await queryOne(
    "UPDATE certificates SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING *",
    [param(req, "id"), reason],
  );
  if (!row) throw badRequest("Certificate not found or already revoked");
  await logActivity(admin.id, "certificate.revoked", "certificate", row.id, { reason });
  res.json({ data: row });
});

certificatesRouter.get("/certificates/:id/pdf", async (req, res) => {
  const { pdf, filename } = await certificatePdf(param(req, "id"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(pdf);
});

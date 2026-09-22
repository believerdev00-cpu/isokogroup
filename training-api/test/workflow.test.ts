import { afterAll, describe, expect, it } from "vitest";
import { applicant, dates, login, makeAdmin, makeTrainer, PASSWORD, pool, queryOne, visitor, type Agent } from "./helpers.js";

afterAll(() => pool.end());

// The whole life of a student, in order, through the real API and database:
// program → intake → open → public sees it → apply → approve → class → attendance
// → results → payment → completion → certificate → public verification.
describe("end-to-end training center workflow", () => {
  const s: Record<string, any> = {};
  let admin: Agent;

  it("admin creates a program", async () => {
    admin = await makeAdmin();
    const res = await admin.post("/api/admin/programs").send({
      code: "FSWD",
      name: "Full-Stack Web Development",
      category: "Technology",
      description: "Learn HTML, CSS, JavaScript, React, backend development, databases, APIs and deployment.",
      duration_value: 6,
      duration_unit: "months",
      tuition_fee: 400,
      registration_fee: 100,
      course_content: "HTML\nCSS\nJavaScript",
      max_students: 30,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("full-stack-web-development");
    s.program = res.body.data;
  });

  it("admin creates an intake as a draft, invisible to the public", async () => {
    const { add } = await dates();
    const res = await admin.post("/api/admin/intakes").send({
      name: "January 2027 Intake",
      application_opens_on: add(-3),
      application_closes_on: add(20),
      training_starts_on: add(-1),
      training_ends_on: add(120),
      location: "Computer Lab, Kigali",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe("draft");
    s.intake = res.body.data;
    const off = await admin.post(`/api/admin/intakes/${s.intake.id}/programs`).send({ program_id: s.program.id, capacity: 2, schedule: "Mon–Fri 8:00–10:00" });
    expect(off.status).toBe(201);
    s.offeringId = off.body.data.id;
    const pub = await visitor().get("/api/public/intakes");
    expect(pub.body.data.find((i: any) => i.id === s.intake.id)).toBeUndefined();
  });

  it("publishing opens it automatically because the application window has started", async () => {
    const res = await admin.post(`/api/admin/intakes/${s.intake.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "open", status_mode: "auto" });
  });

  it("the public sees the intake with seats", async () => {
    const res = await visitor().get("/api/public/intakes");
    const intake = res.body.data.find((i: any) => i.id === s.intake.id);
    expect(intake.name).toBe("January 2027 Intake");
    expect(intake.programs[0]).toMatchObject({ name: "Full-Stack Web Development", capacity: 2, enrolled: 0, available_seats: 2, is_full: false });
  });

  it("an applicant applies without an account and gets a reference number", async () => {
    s.applicant = applicant({ full_name: "John Doe", email: "john.doe@test.local" });
    const res = await visitor()
      .post("/api/public/applications")
      .field("intake_program_id", s.offeringId)
      .field("full_name", s.applicant.full_name)
      .field("date_of_birth", s.applicant.date_of_birth)
      .field("gender", "male")
      .field("phone", s.applicant.phone)
      .field("email", s.applicant.email)
      .field("address", s.applicant.address)
      .field("emergency_contact_name", s.applicant.emergency_contact_name)
      .field("emergency_contact_phone", s.applicant.emergency_contact_phone)
      .field("previous_education", s.applicant.previous_education)
      .attach("document", Buffer.from("%PDF-1.4 id"), { filename: "id.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^ISOKO-APP-\d{4}-\d{5}$/);
    s.reference = res.body.data.reference;
    const confirmation = await queryOne("SELECT email_status, title FROM notifications WHERE email = $1 AND type = 'application_submitted'", [s.applicant.email]);
    expect(confirmation.title).toContain(s.reference);
  });

  it("the applicant can check the status with reference + email only", async () => {
    const ok = await visitor().post("/api/public/applications/status").send({ reference: s.reference, email: s.applicant.email });
    expect(ok.body.data.status).toBe("pending");
    const wrong = await visitor().post("/api/public/applications/status").send({ reference: s.reference, email: "someone@else.local" });
    expect(wrong.status).toBe(404);
  });

  it("admin sees it in the pending list and approves it", async () => {
    const list = await admin.get(`/api/admin/applications?intake_program_id=${s.offeringId}&status=open`);
    const row = list.body.data.items.find((a: any) => a.reference === s.reference);
    expect(row).toMatchObject({ full_name: "John Doe", status: "pending", has_document: true });
    const doc = await admin.get(`/api/admin/applications/${row.id}/document`);
    expect(doc.status).toBe(200);

    const res = await admin.post(`/api/admin/applications/${row.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.student_number).toMatch(/^ISK-\d{4}-\d{5}$/);
    expect(res.body.data.login.email).toBe("john.doe@test.local");
    Object.assign(s, { applicationId: row.id, approval: res.body.data });
  });

  it("approval created the student, enrollment, fees and updated capacity", async () => {
    const student = await admin.get(`/api/admin/students/${s.approval.student_id}`);
    expect(student.body.data).toMatchObject({ full_name: "John Doe", student_number: s.approval.student_number });
    const e = student.body.data.enrollments[0];
    expect(e).toMatchObject({ intake_name: "January 2027 Intake", program_name: "Full-Stack Web Development", status: "active" });
    expect(e.finance).toMatchObject({ total_fees: 500, total_paid: 0, balance: 500, payment_status: "outstanding" });
    const pub = await visitor().get("/api/public/intakes");
    expect(pub.body.data.find((i: any) => i.id === s.intake.id).programs[0]).toMatchObject({ enrolled: 1, available_seats: 1 });
    const status = await visitor().post("/api/public/applications/status").send({ reference: s.reference, email: s.applicant.email });
    expect(status.body.data).toMatchObject({ status: "approved", student_number: s.approval.student_number });
  });

  it("admin creates a class meeting every day and assigns a trainer; the student joins it", async () => {
    const trainer = await makeTrainer(admin);
    s.trainer = trainer;
    const res = await admin.post("/api/admin/classes").send({
      intake_program_id: s.offeringId,
      trainer_id: trainer.id,
      room: "Computer Lab 1",
      meeting_days: [1, 2, 3, 4, 5, 6, 7],
      start_time: "08:00",
      end_time: "10:00",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^FSWD-[A-Z]{3}-\d{4}-A$/);
    expect(res.body.data.student_count).toBe(1); // approved students without a class are placed automatically
    s.classId = res.body.data.id;
  });

  it("the trainer sees today's class and takes attendance", async () => {
    const dash = await s.trainer.agent.get("/api/trainer/dashboard");
    expect(dash.body.data.todays_classes.map((c: any) => c.id)).toContain(s.classId);
    const sheet = await s.trainer.agent.get(`/api/classes/${s.classId}/attendance`);
    const john = sheet.body.data.students[0];
    expect(john.full_name).toBe("John Doe");
    s.enrollmentId = john.enrollment_id;
    const { today } = await dates();
    const save = await s.trainer.agent.put(`/api/classes/${s.classId}/attendance`).send({
      date: today,
      topic: "JavaScript Functions",
      records: [{ enrollment_id: s.enrollmentId, status: "present" }],
    });
    expect(save.status).toBe(200);
    const after = await s.trainer.agent.get(`/api/classes/${s.classId}/attendance`);
    expect(after.body.data.students[0]).toMatchObject({ status: "present", attendance_rate: 100 });
    expect(after.body.data.session.topic).toBe("JavaScript Functions");
  });

  it("the trainer creates assessments and records results; grade and pass are calculated", async () => {
    const a1 = await s.trainer.agent.post(`/api/classes/${s.classId}/assessments`).send({ type: "test", title: "JS test", max_marks: 50, weight: 40 });
    const a2 = await s.trainer.agent.post(`/api/classes/${s.classId}/assessments`).send({ type: "project", title: "Final project", max_marks: 100, weight: 60 });
    expect(a1.status).toBe(201);
    await s.trainer.agent.put(`/api/classes/assessments/${a1.body.data.id}/results`).send({ records: [{ enrollment_id: s.enrollmentId, marks: 40 }] });
    const r2 = await s.trainer.agent.put(`/api/classes/assessments/${a2.body.data.id}/results`).send({ records: [{ enrollment_id: s.enrollmentId, marks: 85, feedback: "Great work" }] });
    expect(r2.status).toBe(200);
    const results = await s.trainer.agent.get(`/api/classes/${s.classId}/results`);
    // 40/50*40 + 85/100*60 = 32 + 51 = 83%
    expect(results.body.data.students[0].results).toMatchObject({ assessments_total: 2, assessments_completed: 2, final_percentage: 83, grade: "A", passed: true });
  });

  it("admin records the payment; a receipt is issued and the balance is cleared", async () => {
    const tooMuch = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollmentId, amount: 9999, method: "momo" });
    expect(tooMuch.status).toBe(400);
    const p1 = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollmentId, amount: 300, method: "momo", reference: "MOMO-1" });
    expect(p1.status).toBe(201);
    expect(p1.body.data.receipt_number).toMatch(/^ISK-RCPT-\d{4}-\d{5}$/);
    const fin = await admin.get(`/api/admin/enrollments/${s.enrollmentId}/finance`);
    expect(fin.body.data).toMatchObject({ total_paid: 300, balance: 200, payment_status: "partially_paid" });
    const p2 = await admin.post("/api/admin/payments").send({ enrollment_id: s.enrollmentId, amount: 200, method: "cash" });
    expect(p2.body.data.balance).toBe(0);
    const receipt = await admin.get(`/api/admin/payments/${p2.body.data.id}/receipt`);
    expect(receipt.headers["content-type"]).toBe("application/pdf");
    expect(receipt.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("a certificate can't be issued before the program is completed", async () => {
    const elig = await admin.get(`/api/admin/enrollments/${s.enrollmentId}/eligibility`);
    expect(elig.body.data.eligible).toBe(false);
    expect(elig.body.data.checks.find((c: any) => c.key === "completed").met).toBe(false);
    expect((await admin.post(`/api/admin/enrollments/${s.enrollmentId}/certificate`)).status).toBe(400);
  });

  it("student completes the program and admin issues the certificate", async () => {
    const done = await admin.patch(`/api/admin/enrollments/${s.enrollmentId}`).send({ status: "completed" });
    expect(done.body.data.status).toBe("completed");
    const elig = await admin.get(`/api/admin/enrollments/${s.enrollmentId}/eligibility`);
    expect(elig.body.data.eligible).toBe(true);
    const cert = await admin.post(`/api/admin/enrollments/${s.enrollmentId}/certificate`);
    expect(cert.status).toBe(201);
    expect(cert.body.data).toMatchObject({ student_name: "John Doe", program_name: "Full-Stack Web Development", intake_name: "January 2027 Intake", final_grade: "A" });
    expect(cert.body.data.certificate_number).toMatch(/^ISK-CERT-\d{4}-\d{5}$/);
    s.cert = cert.body.data;
    expect((await admin.post(`/api/admin/enrollments/${s.enrollmentId}/certificate`)).status).toBe(409);
    const pdf = await admin.get(`/api/admin/certificates/${s.cert.id}/pdf`);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("anyone can verify the certificate by number or verification code", async () => {
    const byNumber = await visitor().get(`/api/public/certificates/verify/${s.cert.certificate_number}`);
    expect(byNumber.body.data).toMatchObject({ valid: true, student_name: "John Doe", program_name: "Full-Stack Web Development" });
    const byCode = await visitor().get(`/api/public/certificates/verify/${s.cert.verification_code.toLowerCase()}`);
    expect(byCode.body.data.valid).toBe(true);
    const fake = await visitor().get("/api/public/certificates/verify/ISK-CERT-2027-99999");
    expect(fake.body.data).toMatchObject({ valid: false, not_found: true });
  });

  it("the student signs in with the temporary password, must change it, and sees everything", async () => {
    const student = await login(s.approval.login.email, s.approval.login.temporary_password);
    const me = await student.get("/api/auth/me");
    expect(me.body.data).toMatchObject({ role: "student", must_change_password: true, student_number: s.approval.student_number });
    await student.post("/api/auth/change-password").send({ current_password: s.approval.login.temporary_password, new_password: PASSWORD });
    expect((await student.get("/api/auth/me")).body.data.must_change_password).toBe(false);

    const dash = await student.get("/api/student/dashboard");
    const e = dash.body.data.enrollments[0];
    expect(e).toMatchObject({ program_name: "Full-Stack Web Development", intake_name: "January 2027 Intake", status: "completed" });
    expect(e.class_code).toMatch(/^FSWD-/);
    expect(e.trainer_name).toBe("Test Trainer");
    expect(e.attendance.rate).toBe(100);
    expect(e.finance.payment_status).toBe("paid");
    const assignments = await student.get(`/api/student/enrollments/${e.id}/assessments`);
    expect(assignments.body.data.find((a: any) => a.title === "Final project")).toMatchObject({ marks: 85, feedback: "Great work" });
    const certs = await student.get("/api/student/certificates");
    expect(certs.body.data[0].certificate_number).toBe(s.cert.certificate_number);
    expect((await student.get(`/api/student/certificates/${s.cert.id}/pdf`)).status).toBe(200);
    const payments = await student.get(`/api/student/enrollments/${e.id}/payments`);
    expect(payments.body.data.payments).toHaveLength(2);
    const notices = await student.get("/api/notifications");
    expect(notices.body.data.items.map((n: any) => n.type)).toEqual(
      expect.arrayContaining(["application_approved", "assessment_result", "payment_received", "certificate_issued"]),
    );
  });

  it("revoking the certificate shows up on verification", async () => {
    await admin.post(`/api/admin/certificates/${s.cert.id}/revoke`).send({ reason: "Issued in error" });
    const res = await visitor().get(`/api/public/certificates/verify/${s.cert.certificate_number}`);
    expect(res.body.data).toMatchObject({ valid: false, revoked: true });
  });

  it("the history stays after the intake is completed and archived", async () => {
    expect((await admin.post(`/api/admin/intakes/${s.intake.id}/complete`)).status).toBe(200);
    expect((await admin.post(`/api/admin/intakes/${s.intake.id}/archive`)).status).toBe(200);
    const student = await admin.get(`/api/admin/students/${s.approval.student_id}`);
    expect(student.body.data.enrollments[0]).toMatchObject({ intake_name: "January 2027 Intake", status: "completed" });
    const report = await admin.get(`/api/admin/reports/completion?intake_id=${s.intake.id}`);
    expect(report.body.data.rows[0]).toMatchObject({ enrolled: 1, completed: 1 });
  });
});

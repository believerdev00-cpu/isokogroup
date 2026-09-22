import { afterAll, describe, expect, it } from "vitest";
import { apply, applicant, dates, login, makeAdmin, makeTrainer, openOffering, PASSWORD, pool, query, queryOne, visitor } from "./helpers.js";

afterAll(() => pool.end());

describe("automatic intake status", () => {
  it("follows the dates: upcoming before opening, open inside the window, closed after the deadline", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { intake, offeringId } = await openOffering(admin);
    expect(intake.status).toBe("open");

    // Move the window into the future → upcoming, hidden from the public
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_opens_on: add(5), application_closes_on: add(15), training_starts_on: add(20) });
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("upcoming");
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: any) => i.id === intake.id)).toBe(false);
    expect((await apply(offeringId)).res.status).toBe(400);

    // Deadline in the past → closed
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_opens_on: add(-20), application_closes_on: add(-1), training_starts_on: add(5) });
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("closed");
    expect((await apply(offeringId)).res.status).toBe(400);
  });

  it("an admin can override: reopen after the deadline, then hand back to automatic", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { intake, offeringId } = await openOffering(admin);
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_opens_on: add(-20), application_closes_on: add(-1), training_starts_on: add(5) });

    const reopened = await admin.post(`/api/admin/intakes/${intake.id}/reopen`);
    expect(reopened.body.data).toMatchObject({ status: "open", status_mode: "manual" });
    expect((await apply(offeringId)).res.status).toBe(201);

    const auto = await admin.post(`/api/admin/intakes/${intake.id}/automatic`);
    expect(auto.body.data).toMatchObject({ status: "closed", status_mode: "auto" });

    const logged = await queryOne("SELECT count(*)::int AS n FROM activity_log WHERE entity_id = $1 AND action LIKE 'intake.%'", [intake.id]);
    expect(logged.n).toBeGreaterThanOrEqual(3);
  });

  it("closing manually stops applications even inside the window", async () => {
    const admin = await makeAdmin();
    const { intake, offeringId } = await openOffering(admin);
    expect((await admin.post(`/api/admin/intakes/${intake.id}/close`)).body.data.status).toBe("closed");
    expect((await apply(offeringId)).res.status).toBe(400);
    expect((await admin.post(`/api/admin/intakes/${intake.id}/publish`)).status).toBe(400); // not a draft any more
  });

  it("an intake can't be published without programs", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const intake = await admin.post("/api/admin/intakes").send({
      name: "Empty intake", application_opens_on: add(-1), application_closes_on: add(10), training_starts_on: add(15), training_ends_on: add(50),
    });
    const res = await admin.post(`/api/admin/intakes/${intake.body.data.id}/publish`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/program/i);
  });

  it("rejects impossible dates", async () => {
    const admin = await makeAdmin();
    const res = await admin.post("/api/admin/intakes").send({
      name: "Bad dates", application_opens_on: "2027-01-10", application_closes_on: "2027-01-01", training_starts_on: "2027-02-01", training_ends_on: "2027-03-01",
    });
    expect(res.status).toBe(400);
  });
});

describe("capacity", () => {
  it("a program becomes FULL when approved students reach capacity; the intake too when nothing is left", async () => {
    const admin = await makeAdmin();
    const { intake, offeringId } = await openOffering(admin, { capacity: 1 });
    const a = await apply(offeringId);
    const b = await apply(offeringId);
    const appA = await queryOne("SELECT id FROM applications WHERE reference = $1", [a.res.body.data.reference]);
    const appB = await queryOne("SELECT id FROM applications WHERE reference = $1", [b.res.body.data.reference]);
    expect((await admin.post(`/api/admin/applications/${appA.id}/approve`)).status).toBe(200);

    const detail = (await admin.get(`/api/admin/intakes/${intake.id}`)).body.data;
    expect(detail.status).toBe("full");
    expect(detail.programs[0]).toMatchObject({ capacity: 1, enrolled: 1, available_seats: 0 });
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: any) => i.id === intake.id)).toBe(false);
    expect((await apply(offeringId)).res.status).toBe(400);

    // The second applicant can't be approved; waitlist instead
    const full = await admin.post(`/api/admin/applications/${appB.id}/approve`);
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/full/i);
    expect((await admin.post(`/api/admin/applications/${appB.id}/waitlist`)).body.data.status).toBe("waitlisted");

    // Raising capacity reopens it and the waitlisted applicant can be approved
    await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ capacity: 2 });
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("open");
    expect((await admin.post(`/api/admin/applications/${appB.id}/approve`)).status).toBe(200);
    // Capacity can't go below what's already enrolled
    expect((await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ capacity: 1 })).status).toBe(400);
  });

  it("two admins approving at the same time can't overfill the last seat", async () => {
    const admin = await makeAdmin();
    const admin2 = await makeAdmin();
    const { offeringId } = await openOffering(admin, { capacity: 1 });
    const refs = [(await apply(offeringId)).res.body.data.reference, (await apply(offeringId)).res.body.data.reference];
    const ids = await Promise.all(refs.map(async (r) => (await queryOne("SELECT id FROM applications WHERE reference = $1", [r])).id));
    const results = await Promise.all([admin.post(`/api/admin/applications/${ids[0]}/approve`), admin2.post(`/api/admin/applications/${ids[1]}/approve`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await queryOne("SELECT enrolled FROM intake_program_stats WHERE intake_program_id = $1", [offeringId])).enrolled).toBe(1);
  });

  it("withdrawing a student frees the seat", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin, { capacity: 1 });
    const ref = (await apply(offeringId)).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    const approval = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    await admin.patch(`/api/admin/enrollments/${approval.enrollment_id}`).send({ status: "withdrawn" });
    expect((await queryOne("SELECT available_seats FROM intake_program_stats WHERE intake_program_id = $1", [offeringId])).available_seats).toBe(1);
  });
});

describe("applications", () => {
  it("validates input and refuses duplicates for the same program", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    expect((await apply(offeringId, applicant({ email: "not-an-email" }))).res.status).toBe(400);
    expect((await apply(offeringId, applicant({ phone: "abc" }))).res.status).toBe(400);
    const fields = applicant();
    expect((await apply(offeringId, fields)).res.status).toBe(201);
    const dup = await apply(offeringId, { ...fields, email: fields.email.toUpperCase() });
    expect(dup.res.status).toBe(409);
    expect(dup.res.body.error.message).toMatch(/ISOKO-APP-/);
  });

  it("requires an ID document when the setting says so, and rejects unsafe file types", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    await admin.put("/api/admin/settings/applications").send({ require_document: true });
    try {
      expect((await apply(offeringId)).res.status).toBe(400);
      const exe = await visitor()
        .post("/api/public/applications")
        .field({ intake_program_id: offeringId, ...applicant() } as Record<string, string>)
        .attach("document", Buffer.from("MZ"), { filename: "id.exe", contentType: "application/octet-stream" });
      expect(exe.status).toBe(400);
    } finally {
      await admin.put("/api/admin/settings/applications").send({ require_document: false });
    }
  });

  it("a returning student keeps one record and number across intakes", async () => {
    const admin = await makeAdmin();
    const first = await openOffering(admin);
    const second = await openOffering(admin);
    const person = applicant();
    const approve = async (offeringId: string) => {
      const ref = (await apply(offeringId, person)).res.body.data.reference;
      const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
      return (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    };
    const a = await approve(first.offeringId);
    const b = await approve(second.offeringId);
    expect(b.student_id).toBe(a.student_id);
    expect(b.student_number).toBe(a.student_number);
    expect(a.login).not.toBeNull();
    expect(b.login).toBeNull(); // the account already exists
    expect((await admin.get(`/api/admin/students/${a.student_id}`)).body.data.enrollments).toHaveLength(2);
  });

  it("applicants can withdraw their own pending application only with the matching email", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const { res, fields } = await apply(offeringId);
    expect((await visitor().post("/api/public/applications/withdraw").send({ reference: res.body.data.reference, email: "x@y.local" })).status).toBe(404);
    const ok = await visitor().post("/api/public/applications/withdraw").send({ reference: res.body.data.reference, email: fields.email });
    expect(ok.body.data.status).toBe("withdrawn");
  });
});

describe("access control", () => {
  it("visitors can't reach any portal API", async () => {
    for (const path of ["/api/admin/dashboard", "/api/admin/students", "/api/trainer/dashboard", "/api/student/dashboard", "/api/notifications", "/api/classes/00000000-0000-0000-0000-000000000000"]) {
      expect((await visitor().get(path)).status, path).toBe(401);
    }
  });

  it("trainers only see their own classes and never admin functions", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const mine = await makeTrainer(admin);
    const other = await makeTrainer(admin);
    const klass = (await admin.post("/api/admin/classes").send({ intake_program_id: offeringId, trainer_id: mine.id, meeting_days: [1, 2, 3], start_time: "08:00", end_time: "10:00" })).body.data;

    expect((await mine.agent.get(`/api/classes/${klass.id}`)).status).toBe(200);
    expect((await other.agent.get(`/api/classes/${klass.id}`)).status).toBe(404);
    expect((await other.agent.put(`/api/classes/${klass.id}/attendance`).send({ date: (await dates()).today, records: [] })).status).toBe(404);
    expect((await other.agent.post(`/api/classes/${klass.id}/assessments`).send({ type: "test", title: "x", max_marks: 10, weight: 10 })).status).toBe(404);
    for (const path of ["/api/admin/dashboard", "/api/admin/payments", "/api/admin/settings", "/api/admin/students", "/api/admin/applications"]) {
      expect((await mine.agent.get(path)).status, path).toBe(403);
    }
    expect((await mine.agent.put("/api/admin/settings/center").send({})).status).toBe(403);
    expect((await mine.agent.get("/api/student/dashboard")).status).toBe(403);
  });

  it("attendance and marks can only be recorded for students in the class, within limits", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const other = await openOffering(admin);
    const trainer = await makeTrainer(admin);
    const klass = (await admin.post("/api/admin/classes").send({ intake_program_id: offeringId, trainer_id: trainer.id, meeting_days: [1], start_time: "08:00", end_time: "10:00" })).body.data;
    // A student from a different program
    const ref = (await apply(other.offeringId)).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    const outsider = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    const { today, add } = await dates();
    const bad = await trainer.agent.put(`/api/classes/${klass.id}/attendance`).send({ date: today, records: [{ enrollment_id: outsider.enrollment_id, status: "present" }] });
    expect(bad.status).toBe(400);
    expect((await trainer.agent.put(`/api/classes/${klass.id}/attendance`).send({ date: add(1), records: [] })).status).toBe(400); // future
    const a = (await trainer.agent.post(`/api/classes/${klass.id}/assessments`).send({ type: "test", title: "Quiz", max_marks: 10, weight: 20 })).body.data;
    expect((await trainer.agent.put(`/api/classes/assessments/${a.id}/results`).send({ records: [{ enrollment_id: outsider.enrollment_id, marks: 5 }] })).status).toBe(400);
    // A student can't be put in a class of another program
    expect((await admin.put(`/api/admin/enrollments/${outsider.enrollment_id}/class`).send({ class_id: klass.id })).status).toBe(400);
  });

  it("students only see their own records", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const approveNew = async () => {
      const ref = (await apply(offeringId)).res.body.data.reference;
      const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
      const r = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
      const agent = await login(r.login.email, r.login.temporary_password);
      await agent.post("/api/auth/change-password").send({ current_password: r.login.temporary_password, new_password: PASSWORD });
      return { ...r, agent };
    };
    const alice = await approveNew();
    const bob = await approveNew();
    const pay = (await admin.post("/api/admin/payments").send({ enrollment_id: bob.enrollment_id, amount: 50, method: "cash" })).body.data;

    expect((await alice.agent.get(`/api/student/enrollments/${bob.enrollment_id}/payments`)).status).toBe(404);
    expect((await alice.agent.get(`/api/student/enrollments/${bob.enrollment_id}/attendance`)).status).toBe(404);
    expect((await alice.agent.get(`/api/student/payments/${pay.id}/receipt`)).status).toBe(404);
    expect((await bob.agent.get(`/api/student/payments/${pay.id}/receipt`)).status).toBe(200);
    const dash = (await alice.agent.get("/api/student/dashboard")).body.data;
    expect(dash.enrollments.map((e: any) => e.id)).toEqual([alice.enrollment_id]);
    for (const path of ["/api/admin/students", "/api/trainer/classes", `/api/admin/applications/${alice.application_id}/document`]) {
      expect((await alice.agent.get(path)).status, path).toBe(403);
    }
  });

  it("temporary passwords must be changed before using the portal API", async () => {
    const admin = await makeAdmin();
    const res = await admin.post("/api/admin/trainers").send({ full_name: "New Trainer", email: `t-${Date.now()}@test.local` });
    const temp = res.body.data.login.temporary_password;
    const agent = await login(res.body.data.login.email, temp);
    expect((await agent.get("/api/auth/me")).body.data.must_change_password).toBe(true);
    const blocked = await agent.get("/api/trainer/classes");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/new password/i);
    const same = await agent.post("/api/auth/change-password").send({ current_password: temp, new_password: temp });
    expect(same.status).toBe(400);
    await agent.post("/api/auth/change-password").send({ current_password: temp, new_password: PASSWORD });
    expect((await agent.get("/api/trainer/classes")).status).toBe(200);
  });

  it("deactivating a trainer signs them out", async () => {
    const admin = await makeAdmin();
    const trainer = await makeTrainer(admin);
    expect((await trainer.agent.get("/api/trainer/classes")).status).toBe(200);
    await admin.patch(`/api/admin/trainers/${trainer.id}`).send({ is_active: false });
    expect((await trainer.agent.get("/api/trainer/classes")).status).toBe(401);
    // Their Isoko account still works elsewhere, but has no Training Center access
    const again = await login(trainer.email);
    expect((await again.get("/api/auth/me")).body.data).toBeNull();
    expect((await again.get("/api/trainer/classes")).status).toBe(401);
  });
});

describe("money", () => {
  it("voided payments stay on record but stop counting", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin, { tuition: 500, registration: 0 });
    const ref = (await apply(offeringId)).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    const r = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    const p = (await admin.post("/api/admin/payments").send({ enrollment_id: r.enrollment_id, amount: 500, method: "bank" })).body.data;
    expect(p.balance).toBe(0);
    expect((await admin.post(`/api/admin/payments/${p.id}/void`).send({ reason: "x" })).status).toBe(400); // reason too short
    await admin.post(`/api/admin/payments/${p.id}/void`).send({ reason: "Entered twice" });
    const fin = (await admin.get(`/api/admin/enrollments/${r.enrollment_id}/finance`)).body.data;
    expect(fin).toMatchObject({ total_paid: 0, balance: 500, payment_status: "outstanding" });
    expect(fin.payments[0].void_reason).toBe("Entered twice");
    expect((await query("SELECT 1 FROM payments WHERE id = $1", [p.id])).length).toBe(1);
  });

  it("reports export as CSV with spreadsheet formulas neutralised", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const ref = (await apply(offeringId, applicant({ full_name: "=HYPERLINK(evil)" }))).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    await admin.post(`/api/admin/applications/${app.id}/approve`);
    const csv = await admin.get("/api/admin/reports/enrollment?format=csv");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=HYPERLINK(evil)");
  });
});

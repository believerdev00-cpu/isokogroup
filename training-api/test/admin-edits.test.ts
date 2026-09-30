import { afterAll, describe, expect, it } from "vitest";
import { apply, applicant, dates, makeAdmin, makeTrainer, openOffering, pool, queryOne, visitor } from "./helpers.js";

afterAll(() => pool.end());

// supabase/migrations/20260930110000_training_admin_edits.sql and the routes that use it
describe("a deadline per program", () => {
  it("a program can close before its intake; applicants see its own deadline", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { intake, offeringId } = await openOffering(admin);

    const early = await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ application_closes_on: add(-1) });
    expect(early.status).toBe(200);
    expect(early.body.data.application_closes_on).toBe(add(-1));
    expect((await apply(offeringId)).res.status).toBe(400);
    // its only program closed: the intake shows closed and leaves the public list
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("closed");
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: any) => i.id === intake.id)).toBe(false);

    // extended again: open, and the public list shows the program's own date
    await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ application_closes_on: add(3) });
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("open");
    const listed = (await visitor().get("/api/public/intakes")).body.data.find((i: any) => i.id === intake.id);
    expect(listed.programs[0]).toMatchObject({ application_closes_on: add(3), is_full: false, is_closed: false });
    expect((await apply(offeringId)).res.status).toBe(201);

    // cleared: the intake's deadline applies again
    await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ application_closes_on: null });
    const again = (await visitor().get("/api/public/intakes")).body.data.find((i: any) => i.id === intake.id);
    expect(again.programs[0].application_closes_on).toBe(intake.application_closes_on);
  });

  it("refuses a program deadline before applications open", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { offeringId } = await openOffering(admin);
    const res = await admin.patch(`/api/admin/intake-programs/${offeringId}`).send({ application_closes_on: add(-30) });
    expect(res.status).toBe(400);
  });

  it("changing the intake deadline opens or closes it at once", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { intake, offeringId } = await openOffering(admin);
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_closes_on: add(-1) });
    expect((await apply(offeringId)).res.status).toBe(400);
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_closes_on: add(20) });
    expect((await admin.get(`/api/admin/intakes/${intake.id}`)).body.data.status).toBe("open");
    expect((await apply(offeringId)).res.status).toBe(201);
  });
});

describe("editing applications", () => {
  it("an admin corrects the applicant's details; the change is logged", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const { res } = await apply(offeringId);
    const id = (await queryOne("SELECT id FROM applications WHERE reference = $1", [res.body.data.reference])).id;

    const edited = await admin.patch(`/api/admin/applications/${id}`).send({ full_name: "Corrected Name", phone: "+250 788 999 000" });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ full_name: "Corrected Name", phone: "+250 788 999 000" });
    expect(edited.body.data.pay_token).toBeUndefined();
    const log = await queryOne("SELECT details FROM activity_log WHERE entity_id = $1 AND action = 'application.edited'", [id]);
    expect(log.details.fields.sort()).toEqual(["full_name", "phone"]);
  });

  it("moving an application re-prices the registration fee", async () => {
    const admin = await makeAdmin();
    const a = await openOffering(admin, { registration: 10000 });
    const b = await openOffering(admin, { registration: 4000 });
    const { res } = await apply(a.offeringId);
    const id = (await queryOne("SELECT id FROM applications WHERE reference = $1", [res.body.data.reference])).id;
    const owed = async () => Number((await queryOne("SELECT public.finance_totals_for('training.applications', $1) ->> 'balance' AS b", [id])).b);
    expect(await owed()).toBe(10000);

    const moved = await admin.patch(`/api/admin/applications/${id}`).send({ intake_program_id: b.offeringId });
    expect(moved.status).toBe(200);
    expect(moved.body.data.intake_program_id).toBe(b.offeringId);
    expect(await owed()).toBe(4000);
    expect(await queryOne("SELECT 1 FROM activity_log WHERE entity_id = $1 AND action = 'application.moved'", [id])).toBeTruthy();
  });

  it("refuses to edit a decided application, a duplicate move, and anyone but admins", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const other = await openOffering(admin);
    const person = applicant();
    const first = await apply(offeringId, person);
    await apply(other.offeringId, person);
    const id = (await queryOne("SELECT id FROM applications WHERE reference = $1", [first.res.body.data.reference])).id;

    expect((await admin.patch(`/api/admin/applications/${id}`).send({ intake_program_id: other.offeringId })).status).toBe(409);
    const trainer = await makeTrainer(admin);
    expect((await trainer.agent.patch(`/api/admin/applications/${id}`).send({ full_name: "Hacked Name" })).status).toBe(403);
    expect((await visitor().patch(`/api/admin/applications/${id}`).send({ full_name: "Hacked Name" })).status).toBe(401);

    await admin.post(`/api/admin/applications/${id}/reject`).send({ note: "No" });
    const res = await admin.patch(`/api/admin/applications/${id}`).send({ full_name: "Too Late" });
    expect(res.status).toBe(400);
  });
});

describe("editing announcements", () => {
  it("an admin corrects the text; it records when", async () => {
    const admin = await makeAdmin();
    const created = await admin.post("/api/admin/announcements").send({ title: "Exam on Monday", body: "Room 1", audience: "students" });
    const res = await admin.patch(`/api/admin/announcements/${created.body.data.id}`).send({ title: "Exam on Tuesday" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: "Exam on Tuesday", body: "Room 1" });
    expect(res.body.data.updated_at).toBeTruthy();
  });
});

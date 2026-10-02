import { afterAll, describe, expect, it } from "vitest";
import { apply, dates, makeAdmin, openOffering, pool, queryOne, visitor, type Agent } from "./helpers.js";

afterAll(() => pool.end());

type Announcement = {
  id: string;
  name: string;
  slug: string;
  state: "open" | "closing_soon" | "coming_soon";
  days_left: number | null;
  program_count: number;
  programs: string[];
  is_featured: boolean;
  ticker_priority: number;
};

const band = async () => (await visitor().get("/api/public/announcements")).body.data as Announcement[];
const inBand = async (id: string) => (await band()).find((a) => a.id === id) ?? null;

/** A published intake whose applications have not opened yet. */
async function upcomingOffering(admin: Agent) {
  const { add } = await dates();
  const code = `U${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const program = await admin.post("/api/admin/programs").send({
    code, name: `Program ${code}`, category: "Logistics", duration_value: 3, duration_unit: "months",
    tuition_fee: 400, registration_fee: 40,
  });
  const intake = await admin.post("/api/admin/intakes").send({
    name: `Coming Intake ${code}`,
    application_opens_on: add(5), application_closes_on: add(25),
    training_starts_on: add(30), training_ends_on: add(120), location: "Kigali",
  });
  await admin.post(`/api/admin/intakes/${intake.body.data.id}/programs`).send({ program_id: program.body.data.id, capacity: 20 });
  const published = await admin.post(`/api/admin/intakes/${intake.body.data.id}/publish`);
  expect(published.body.data.status).toBe("upcoming");
  return { intake: published.body.data, program: program.body.data };
}

// supabase/migrations/20261003120000_training_intake_ticker.sql and the endpoint the website's band reads
describe("the intake band the website shows", () => {
  it("announces an open intake with its programs, and needs no account", async () => {
    const admin = await makeAdmin();
    const { intake, program } = await openOffering(admin);
    const res = await visitor().get("/api/public/announcements");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache"); // a withdrawn intake must leave the band at once
    const mine = (res.body.data as Announcement[]).find((a) => a.id === intake.id);
    expect(mine).toMatchObject({
      slug: intake.slug, state: "open", program_count: 1, programs: [program.name],
      is_featured: false, ticker_priority: 0,
    });
    // openOffering closes in ten days, so it is open rather than closing soon
    expect(mine!.days_left).toBe(10);
  });

  it("says closing soon inside the last week, and counts the days", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();
    const { intake } = await openOffering(admin);
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_closes_on: add(3) });
    expect(await inBand(intake.id)).toMatchObject({ state: "closing_soon", days_left: 3 });
    // the last day still counts as closing soon
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ application_closes_on: add(0) });
    expect(await inBand(intake.id)).toMatchObject({ state: "closing_soon", days_left: 0 });
  });

  it("says coming soon before applications open, and the intake page says when", async () => {
    const admin = await makeAdmin();
    const { intake } = await upcomingOffering(admin);
    expect(await inBand(intake.id)).toMatchObject({ state: "coming_soon", days_left: null, program_count: 1 });
    // not in the list of intakes taking applications
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: { id: string }) => i.id === intake.id)).toBe(false);
    // but its own page opens, marked as not yet taking applications
    const page = await visitor().get(`/api/public/intakes/${intake.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ id: intake.id, status: "upcoming", applications_open: false });
    expect(page.body.data.programs).toHaveLength(1);
  });

  it("an open intake's page says applications are open", async () => {
    const admin = await makeAdmin();
    const { intake } = await openOffering(admin);
    const page = await visitor().get(`/api/public/intakes/${intake.slug}`);
    expect(page.body.data).toMatchObject({ id: intake.id, status: "open", applications_open: true });
  });

  it("never announces a draft, full, closed, completed or archived intake", async () => {
    const admin = await makeAdmin();
    const { add } = await dates();

    // draft: published is what puts it in the band
    const draftOnly = await admin.post("/api/admin/intakes").send({
      name: `Draft Intake ${Math.random().toString(36).slice(2, 7)}`,
      application_opens_on: add(-1), application_closes_on: add(20),
      training_starts_on: add(25), training_ends_on: add(90), location: "Kigali",
    });
    expect(draftOnly.body.data.status).toBe("draft");
    expect(await inBand(draftOnly.body.data.id)).toBeNull();

    // full: the only program stops accepting
    const full = await openOffering(admin);
    await admin.patch(`/api/admin/intake-programs/${full.offeringId}`).send({ accepting_applications: false });
    expect((await admin.get(`/api/admin/intakes/${full.intake.id}`)).body.data.status).toBe("full");
    expect(await inBand(full.intake.id)).toBeNull();

    // closed: the deadline has passed
    const closed = await openOffering(admin);
    await admin.patch(`/api/admin/intakes/${closed.intake.id}`).send({ application_closes_on: add(-1) });
    expect((await admin.get(`/api/admin/intakes/${closed.intake.id}`)).body.data.status).toBe("closed");
    expect(await inBand(closed.intake.id)).toBeNull();

    // completed and archived
    const done = await openOffering(admin);
    await admin.post(`/api/admin/intakes/${done.intake.id}/complete`);
    expect(await inBand(done.intake.id)).toBeNull();
    const gone = await openOffering(admin);
    await admin.post(`/api/admin/intakes/${gone.intake.id}/close`);
    await admin.post(`/api/admin/intakes/${gone.intake.id}/archive`);
    expect(await inBand(gone.intake.id)).toBeNull();
  });

  it("an admin can keep one intake out of the band without unpublishing it", async () => {
    const admin = await makeAdmin();
    const { intake } = await openOffering(admin);
    expect(await inBand(intake.id)).not.toBeNull();
    const off = await admin.patch(`/api/admin/intakes/${intake.id}`).send({ show_in_ticker: false });
    expect(off.body.data.show_in_ticker).toBe(false);
    expect(await inBand(intake.id)).toBeNull();
    // still taking applications on the site
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: { id: string }) => i.id === intake.id)).toBe(true);
    await admin.patch(`/api/admin/intakes/${intake.id}`).send({ show_in_ticker: true });
    expect(await inBand(intake.id)).not.toBeNull();
  });

  it("shows featured intakes first, then the admin's priority", async () => {
    const admin = await makeAdmin();
    const plain = await openOffering(admin);
    const middle = await openOffering(admin);
    const featured = await openOffering(admin);
    await admin.patch(`/api/admin/intakes/${middle.intake.id}`).send({ ticker_priority: 50 });
    const f = await admin.patch(`/api/admin/intakes/${featured.intake.id}`).send({ is_featured: true, ticker_priority: 10 });
    expect(f.body.data).toMatchObject({ is_featured: true, ticker_priority: 10 });

    const mine = [featured.intake.id, middle.intake.id, plain.intake.id];
    const order = (await band()).filter((a) => mine.includes(a.id)).map((a) => a.id);
    expect(order).toEqual(mine);
  });

  it("refuses a priority outside 0 to 100", async () => {
    const admin = await makeAdmin();
    const { intake } = await openOffering(admin);
    expect((await admin.patch(`/api/admin/intakes/${intake.id}`).send({ ticker_priority: 101 })).status).toBe(400);
    expect((await admin.patch(`/api/admin/intakes/${intake.id}`).send({ ticker_priority: -1 })).status).toBe(400);
  });

  it("unpublish takes an intake off the site and out of the band, keeping its applications", async () => {
    const admin = await makeAdmin();
    const { intake, offeringId } = await openOffering(admin);
    const sent = await apply(offeringId);
    expect(sent.res.status).toBe(201);

    const res = await admin.post(`/api/admin/intakes/${intake.id}/unpublish`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    expect(await inBand(intake.id)).toBeNull();
    expect((await visitor().get("/api/public/intakes")).body.data.some((i: { id: string }) => i.id === intake.id)).toBe(false);
    expect((await visitor().get(`/api/public/intakes/${intake.slug}`)).status).toBe(404);
    // the application is untouched and no one can apply while it is a draft
    expect(await queryOne("SELECT id FROM applications WHERE reference = $1", [sent.res.body.data.reference])).not.toBeNull();
    expect((await apply(offeringId)).res.status).toBe(400);
    // and it can go back up
    expect((await admin.post(`/api/admin/intakes/${intake.id}/publish`)).body.data.status).toBe("open");
    expect(await inBand(intake.id)).not.toBeNull();
  });

  it("only staff set what the band shows", async () => {
    const admin = await makeAdmin();
    const { intake } = await openOffering(admin);
    expect((await visitor().patch(`/api/admin/intakes/${intake.id}`).send({ is_featured: true })).status).toBe(401);
    expect((await visitor().post(`/api/admin/intakes/${intake.id}/unpublish`)).status).toBe(401);
    expect((await queryOne("SELECT is_featured FROM intakes WHERE id = $1", [intake.id]))!.is_featured).toBe(false);
  });
});

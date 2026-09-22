import crypto from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { pool, query, queryOne } from "../src/db.js";
import { createUserAccount } from "../src/services/auth.js";
import { today } from "../src/services/settings.js";

export const app = createApp();
export const PASSWORD = "Password123!";
export type Agent = ReturnType<typeof request.agent>;

export const uid = () => crypto.randomUUID().slice(0, 8);

/** Signs in with Supabase Auth, as the Isoko site does. Null if the password is wrong. */
export async function accessToken(email: string, password = PASSWORD): Promise<string | null> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.ok ? ((await res.json()) as { access_token: string }).access_token : null;
}

/** An agent that sends the account's access token with every request. */
export async function login(email: string, password = PASSWORD): Promise<Agent> {
  const token = await accessToken(email, password);
  if (!token) throw new Error(`login ${email} failed`);
  return request.agent(app).set("Authorization", `Bearer ${token}`);
}

export async function makeAdmin() {
  const email = `admin-${uid()}@test.local`;
  await createUserAccount({ email, password: PASSWORD, role: "admin", full_name: "Test Admin" });
  return login(email);
}

/** A trainer created through the admin API; returns their id and a signed-in agent. */
export async function makeTrainer(admin: Agent) {
  const email = `trainer-${uid()}@test.local`;
  const res = await admin.post("/api/admin/trainers").send({ full_name: "Test Trainer", email, specialization: "Web" });
  if (res.status !== 201) throw new Error(`trainer: ${JSON.stringify(res.body)}`);
  const agent = await login(email, res.body.data.login.temporary_password);
  await agent.post("/api/auth/change-password").send({ current_password: res.body.data.login.temporary_password, new_password: PASSWORD });
  return { id: res.body.data.id as string, agent, email };
}

export async function dates() {
  const d = await today();
  const add = (n: number) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  return { today: d, add };
}

/** Program + published intake (open now, training already running) + offering. */
export async function openOffering(admin: Agent, opts: { capacity?: number; tuition?: number; registration?: number } = {}) {
  const { add } = await dates();
  const code = `T${uid().slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  const program = await admin.post("/api/admin/programs").send({
    code,
    name: `Program ${code}`,
    category: "Technology",
    duration_value: 6,
    duration_unit: "months",
    tuition_fee: opts.tuition ?? 500,
    registration_fee: opts.registration ?? 50,
  });
  if (program.status !== 201) throw new Error(JSON.stringify(program.body));
  const intake = await admin.post("/api/admin/intakes").send({
    name: `Intake ${uid()}`,
    application_opens_on: add(-10),
    application_closes_on: add(10),
    training_starts_on: add(-5),
    training_ends_on: add(60),
    location: "Kigali",
  });
  if (intake.status !== 201) throw new Error(JSON.stringify(intake.body));
  const offering = await admin.post(`/api/admin/intakes/${intake.body.data.id}/programs`).send({
    program_id: program.body.data.id,
    capacity: opts.capacity ?? 30,
  });
  if (offering.status !== 201) throw new Error(JSON.stringify(offering.body));
  const published = await admin.post(`/api/admin/intakes/${intake.body.data.id}/publish`);
  if (published.status !== 200) throw new Error(JSON.stringify(published.body));
  return { program: program.body.data, intake: published.body.data, offeringId: offering.body.data.id as string };
}

export function applicant(overrides: Record<string, unknown> = {}) {
  const n = uid();
  return {
    full_name: `Applicant ${n}`,
    date_of_birth: "2000-05-01",
    gender: "female",
    phone: "+250 788 123 456",
    email: `applicant-${n}@test.local`,
    address: "KG 11 Ave, Kigali",
    emergency_contact_name: "Parent",
    emergency_contact_phone: "+250 788 000 111",
    previous_education: "A-level",
    ...overrides,
  };
}

export async function apply(offeringId: string, fields = applicant()) {
  const res = await request(app).post("/api/public/applications").send({ intake_program_id: offeringId, ...fields });
  return { res, fields };
}

export const visitor = () => request(app);
export { pool, query, queryOne };

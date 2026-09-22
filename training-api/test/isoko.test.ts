import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { accessToken, app, applicant, apply, login, makeAdmin, openOffering, PASSWORD, query, queryOne, uid, visitor } from "./helpers.js";

// How the Training Center fits into Isoko: one account (Supabase Auth) for the
// whole site, with Training Center roles on top.

/** An ordinary Isoko account (e.g. a shop customer), created as the site's sign-up would. */
async function isokoAccount(email = `isoko-${uid()}@test.local`, password = "Own-password-42") {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Isoko Customer" } }),
  });
  const body = (await res.json()) as { id: string };
  if (!res.ok) throw new Error(JSON.stringify(body));
  return { id: body.id, email, password };
}

describe("Isoko accounts", () => {
  it("an Isoko account without a Training Center role is signed in but has no access", async () => {
    const acct = await isokoAccount();
    const agent = await login(acct.email, acct.password);
    expect((await agent.get("/api/auth/me")).body.data).toBeNull();
    expect((await agent.get("/api/student/dashboard")).status).toBe(401);
    expect((await agent.get("/api/admin/students")).status).toBe(401);
  });

  it("requests without a token, or with a bad one, are anonymous", async () => {
    expect((await visitor().get("/api/auth/me")).body.data).toBeNull();
    const forged = await request(app).get("/api/admin/students").set("Authorization", "Bearer not-a-real-token");
    expect(forged.status).toBe(401);
  });

  it("Isoko administrators are Training Center administrators", async () => {
    const acct = await isokoAccount();
    await query("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')", [acct.id]);
    const agent = await login(acct.email, acct.password);
    const me = (await agent.get("/api/auth/me")).body.data;
    expect(me).toMatchObject({ id: acct.id, role: "admin" });
    expect((await agent.get("/api/admin/students")).status).toBe(200);
  });

  it("an applicant who already has an Isoko account keeps it and its password", async () => {
    const admin = await makeAdmin();
    const acct = await isokoAccount();
    const { offeringId } = await openOffering(admin);
    const ref = (await apply(offeringId, applicant({ email: acct.email.toUpperCase() }))).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    const approval = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    expect(approval.login).toEqual({ email: acct.email, temporary_password: null });

    const student = await login(acct.email, acct.password);
    const me = (await student.get("/api/auth/me")).body.data;
    expect(me).toMatchObject({ id: acct.id, role: "student", must_change_password: false });
    expect((await student.get("/api/student/dashboard")).status).toBe(200);
    const notice = await queryOne("SELECT body FROM notifications WHERE user_id = $1 AND type = 'application_approved'", [acct.id]);
    expect(notice.body).not.toMatch(/temporary password/i);
  });

  it("a new student gets an Isoko account that works across the site", async () => {
    const admin = await makeAdmin();
    const { offeringId } = await openOffering(admin);
    const fields = applicant();
    const ref = (await apply(offeringId, fields)).res.body.data.reference;
    const app = await queryOne("SELECT id FROM applications WHERE reference = $1", [ref]);
    const approval = (await admin.post(`/api/admin/applications/${app.id}/approve`)).body.data;
    expect(approval.login.temporary_password).toEqual(expect.any(String));
    const authUser = await queryOne("SELECT id FROM auth.users WHERE email = $1", [fields.email]);
    const profile = await queryOne("SELECT full_name FROM public.profiles WHERE user_id = $1", [authUser.id]);
    expect(profile.full_name).toBe(fields.full_name);
  });

  it("changing the password changes the Isoko password and signs out other devices", async () => {
    const admin = await makeAdmin();
    const res = await admin.post("/api/admin/trainers").send({ full_name: "Pat Trainer", email: `pat-${uid()}@test.local` });
    const { email, temporary_password: temp } = res.body.data.login;
    const laptop = await login(email, temp);
    const phone = await login(email, temp);
    expect((await laptop.post("/api/auth/change-password").send({ current_password: "wrong", new_password: PASSWORD })).status).toBe(400);
    expect((await laptop.post("/api/auth/change-password").send({ current_password: temp, new_password: PASSWORD })).status).toBe(200);
    expect(await accessToken(email, temp)).toBeNull();
    expect(await accessToken(email, PASSWORD)).toEqual(expect.any(String));
    expect((await laptop.get("/api/trainer/classes")).status).toBe(200);
    expect((await phone.get("/api/trainer/classes")).status).toBe(401);
  });
});

describe("browser access", () => {
  it("only the Isoko site's origins may call the API from a browser", async () => {
    const ok = await visitor().options("/api/public/center").set("Origin", "http://localhost:8080").set("Access-Control-Request-Method", "POST");
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(ok.headers["access-control-allow-headers"]).toMatch(/authorization/);

    const other = await visitor().get("/api/public/center").set("Origin", "https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    const write = await visitor().post("/api/public/applications").set("Origin", "https://evil.example").send({});
    expect(write.status).toBe(403);
  });

  it("the Edge Function path serves the same API", async () => {
    expect((await visitor().get("/training/health")).body.data).toEqual({ ok: true });
  });
});

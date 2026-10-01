// @vitest-environment node
//
// The Resend email provider of notifications-dispatch, against a fake Resend
// (what Resend's API answers). Nothing is sent. Runs under Node, not jsdom:
// the function uses fetch, Response and AbortSignal.timeout as Deno has them.
//
//   npx vitest run supabase/tests/resend-provider.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_FROM, recipient, resendProvider } from "../functions/notifications-dispatch/resend.ts";

const KEY = "re_test_0123456789abcdefABCDEF";
const env = (vars: Record<string, string>) => ({ get: (n: string) => vars[n] });
const message = (over: Partial<{ id: string; to: string; name: string | null; subject: string; body: string }> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", to: "customer@example.com", name: "Aline U.", subject: "Your order", body: "Hello", ...over,
});

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
let calls: Call[];
let answer: { status: number; json: unknown };

beforeEach(() => {
  calls = [];
  answer = { status: 200, json: { id: "em_123" } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answer.json), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const provider = (extra: Record<string, string> = {}) => {
  const p = resendProvider(env({ RESEND_API_KEY: KEY, EMAIL_PROVIDER: "resend", ...extra }));
  if (typeof p === "string") throw new Error(p);
  return p;
};

describe("configuration", () => {
  it("is wired in as the email provider named resend", () => {
    // channels.ts pulls in nodemailer through a Deno "npm:" specifier, which Node can't load; check the wiring by text
    const channels = readFileSync(new URL("../functions/notifications-dispatch/channels.ts", import.meta.url), "utf8");
    expect(channels).toMatch(/name === "resend" && channel === "email"\) providers\.set\(channel, resendProvider\(env\)\)/);
  });
  it("names the missing setting, never a value", () => {
    expect(resendProvider(env({}))).toBe("EMAIL_PROVIDER is resend but RESEND_API_KEY is not set");
    expect(resendProvider(env({ RESEND_API_KEY: KEY, EMAIL_FROM: "not an address" }))).toMatch(/EMAIL_FROM must be/);
  });
  it("sends from Isoko Groups <noreply@isokogroups.com> unless EMAIL_FROM says otherwise", async () => {
    await provider().send(message());
    expect(calls[0].body.from).toBe(DEFAULT_FROM);
    expect(DEFAULT_FROM).toBe("Isoko Groups <noreply@isokogroups.com>");
    await provider({ EMAIL_FROM: "Isoko Training <training@isokogroups.com>" }).send(message());
    expect(calls[1].body.from).toBe("Isoko Training <training@isokogroups.com>");
  });
});

describe("sending", () => {
  it("posts the message to Resend with the key, and the delivery id as the idempotency key", async () => {
    const r = await provider().send(message());
    expect(r).toEqual({ ok: true, messageId: "em_123" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["Idempotency-Key"]).toBe("notification/11111111-1111-4111-8111-111111111111");
    expect(calls[0].body).toMatchObject({ to: ['"Aline U." <customer@example.com>'], subject: "Your order", text: "Hello" });
  });
  it("uses a local fake Resend only when RESEND_API_BASE is set outside hosted Supabase", async () => {
    await provider({ RESEND_API_BASE: "http://127.0.0.1:54399/" }).send(message());
    expect(calls[0].url).toBe("http://127.0.0.1:54399/emails");
    await provider({ RESEND_API_BASE: "http://127.0.0.1:54399/", SB_REGION: "eu-west-1" }).send(message());
    expect(calls[1].url).toBe("https://api.resend.com/emails");
  });
  it("quotes names safely and sends without a name when there is none", () => {
    expect(recipient("a@b.co", 'Eve <x@y.z> "hi"')).toBe('"Eve  x@y.z   hi" <a@b.co>');
    expect(recipient("a@b.co", null)).toBe("a@b.co");
  });
  it("refuses an invalid address without calling Resend", async () => {
    expect(await provider().send(message({ to: "not-an-email" }))).toEqual({ ok: false, error: "Invalid email address", retry: false });
    expect(calls).toHaveLength(0);
  });
});

describe("errors", () => {
  it("reports a refused key without echoing it", async () => {
    answer = { status: 401, json: { statusCode: 401, name: "validation_error", message: `API key is invalid: ${KEY}` } };
    const r = await provider().send(message());
    expect(r).toEqual({ ok: false, error: "Resend refused the API key (check RESEND_API_KEY)", retry: false });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  it("gives up on a message Resend refuses, with Resend's reason, keys masked", async () => {
    answer = { status: 422, json: { statusCode: 422, name: "validation_error", message: `The isokogroups.com domain is not verified (${KEY})` } };
    const r = await provider().send(message());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retry).toBe(false);
      expect(r.error).toMatch(/^Resend refused the message: The isokogroups.com domain is not verified/);
      expect(r.error).not.toContain(KEY);
    }
  });
  it("tries again later when Resend is busy or down", async () => {
    answer = { status: 429, json: { statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" } };
    expect(await provider().send(message())).toEqual({ ok: false, error: "Resend rate limit", retry: true });
    answer = { status: 503, json: {} };
    expect(await provider().send(message())).toMatchObject({ ok: false, retry: true });
  });
  it("tries again later when Resend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await provider().send(message())).toEqual({ ok: false, error: "Resend unreachable", retry: true });
  });
});

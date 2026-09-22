import crypto from "node:crypto";
import { config } from "../config.js";
import { conflict, HttpError } from "../lib/http.js";
import { onRollback, queryOne, type Queryable, pool } from "../db.js";

// Sign-in is Isoko's own Supabase Auth: the Training Center has no passwords or
// sessions of its own. training.users says which role an Isoko account has here
// (its id is the auth user's id).

/** A readable temporary password, e.g. "kite-4821-river" (shown once, must be changed). */
export function temporaryPassword() {
  const words = ["river", "hill", "kite", "lake", "maple", "cedar", "stone", "cloud", "sun", "tiger", "coffee", "drum"];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomInt(1000, 10000)}-${pick()}`;
}

export type SessionUser = {
  id: string;
  email: string;
  role: "admin" | "trainer" | "student";
  full_name: string;
  must_change_password: boolean;
  /** Supabase session of this request, so "sign out other devices" can keep it */
  sessionId: string | null;
};

type AuthUser = { id: string; email: string; sessionId: string | null };

// Tokens are checked with Supabase Auth; a short cache avoids a round trip per request.
const tokenCache = new Map<string, { user: AuthUser; until: number }>();

function sessionIdOf(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

async function authFetch(path: string, init: RequestInit & { key?: string } = {}) {
  const { key = config.serviceRoleKey, ...rest } = init;
  return fetch(`${config.supabaseUrl}/auth/v1${path}`, {
    ...rest,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(rest.headers ?? {}) },
  });
}

/** The Supabase user behind an access token, or null if the token isn't valid. */
export async function userForToken(token: string): Promise<AuthUser | null> {
  const cached = tokenCache.get(token);
  if (cached && cached.until > Date.now()) return cached.user;
  const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json()) as { id: string; email?: string };
  if (!body?.id || !body.email) return null;
  const user = { id: body.id, email: body.email.toLowerCase(), sessionId: sessionIdOf(token) };
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(token, { user, until: Date.now() + 30_000 });
  return user;
}

/** The Training Center user for a signed-in Isoko account. Isoko admins are Training Center admins. */
export async function findSessionUser(auth: AuthUser): Promise<SessionUser | null> {
  let row = await queryOne(
    "SELECT id, email, role, full_name, must_change_password, is_active FROM users WHERE id = $1",
    [auth.id],
  );
  if (!row) {
    const isAdmin = await queryOne("SELECT public.has_role($1, 'admin') AS yes", [auth.id]);
    if (!isAdmin?.yes) return null;
    const profile = await queryOne("SELECT full_name, phone FROM public.profiles WHERE user_id = $1", [auth.id]);
    row = await queryOne(
      `INSERT INTO users (id, email, role, full_name, phone) VALUES ($1, $2, 'admin', $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, role, full_name, must_change_password, is_active`,
      [auth.id, auth.email, profile?.full_name || auth.email.split("@")[0], profile?.phone ?? null],
    );
  }
  if (!row.is_active) return null;
  const { is_active: _active, ...user } = row;
  return { ...user, sessionId: auth.sessionId };
}

/** Checks a password against Supabase Auth (used before changing it). */
export async function verifyPassword(email: string, password: string) {
  const res = await authFetch("/token?grant_type=password", {
    method: "POST",
    key: config.anonKey,
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

/**
 * The signed-in user changes their own password (as themselves, with their access
 * token): Supabase Auth keeps this session and signs out their other devices.
 */
export async function changeOwnPassword(accessToken: string, password: string) {
  const res = await authFetch("/user", {
    method: "PUT",
    key: config.anonKey,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { msg?: string; message?: string } | null;
    throw new HttpError(400, body?.msg ?? body?.message ?? "Could not change the password. Please try again.", "auth_error");
  }
  tokenCache.clear();
}

/** An admin sets someone's password; Supabase Auth signs that person out everywhere. */
export async function setPassword(userId: string, password: string) {
  await updateAuthUser(userId, { password });
}

/** Changes the Isoko (Supabase Auth) account itself. */
export async function updateAuthUser(userId: string, fields: { password?: string; email?: string }) {
  const res = await authFetch(`/admin/users/${userId}`, { method: "PUT", body: JSON.stringify(fields) });
  if (!res.ok) throw new HttpError(502, "Could not update the account. Please try again.", "auth_error");
  tokenCache.clear();
}

/** Signs a user out everywhere except, optionally, the given session. */
export async function deleteSessionsFor(userId: string, exceptSessionId?: string | null, client: Queryable = pool) {
  await client.query("DELETE FROM auth.sessions WHERE user_id = $1 AND id::text <> coalesce($2, '')", [userId, exceptSessionId ?? null]);
  tokenCache.clear();
}

/**
 * Gives someone a Training Center role. If they already have an Isoko account
 * (same email) it is linked and keeps its password (password: null in the result);
 * otherwise an account is created with the given temporary password.
 */
export async function createUserAccount(
  input: { email: string; password: string; role: "admin" | "trainer" | "student"; full_name: string; phone?: string | null; must_change_password?: boolean },
  client: Queryable = pool,
): Promise<{ id: string; email: string; password: string | null }> {
  const email = input.email.trim().toLowerCase();
  const taken = await queryOne("SELECT role FROM users WHERE lower(email) = $1", [email], client);
  if (taken) throw conflict(`${email} already has a Training Center ${taken.role} account`);

  let id: string;
  let password: string | null = input.password;
  const existing = await queryOne<{ id: string }>("SELECT id FROM auth.users WHERE lower(email) = $1", [email], client);
  if (existing) {
    id = existing.id;
    password = null;
  } else {
    const res = await authFetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.full_name },
      }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; msg?: string; message?: string } | null;
    if (!res.ok || !body?.id) {
      throw new HttpError(502, `Could not create the account for ${email}: ${body?.msg ?? body?.message ?? res.status}`, "auth_error");
    }
    id = body.id;
    // If the surrounding transaction rolls back, remove the account again
    const newId = body.id;
    onRollback(client, () => authFetch(`/admin/users/${newId}`, { method: "DELETE" }).then(() => undefined));
  }
  await client.query(
    `INSERT INTO users (id, email, role, full_name, phone, must_change_password) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email, input.role, input.full_name, input.phone ?? null, password ? (input.must_change_password ?? false) : false],
  );
  return { id, email, password };
}

// Who is calling one of the Information Hub's staff functions, and the CORS
// headers they answer with. Two kinds of caller are accepted: the project's
// own service-role key (the weekly cron) and a signed-in member of the data
// staff (data_analyst or admin, decided by the database's is_service_staff).
// The token is never decoded for trust: the role check runs through PostgREST
// with the caller's token, so a forged token simply fails there.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mocksAllowed } from "./environment.ts";

type Env = { get(name: string): string | undefined };

export type Caller =
  | { kind: "service" }
  | { kind: "staff"; userId: string }
  | { kind: "none"; status: 401 | 403; error: string };

export function bearerOf(req: Request): string | null {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** The user id written in a JWT (not verified here: the database verifies the token when it is used) */
export function subjectOf(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "authenticated" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function identifyCaller(env: Env, req: Request, allowServiceRole: boolean): Promise<Caller> {
  const token = bearerOf(req);
  if (!token) return { kind: "none", status: 401, error: "Sign in first" };
  const serviceKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (allowServiceRole && serviceKey && token === serviceKey) return { kind: "service" };
  const userId = subjectOf(token);
  if (!userId) return { kind: "none", status: 401, error: "Sign in first" };
  const user = createClient(env.get("SUPABASE_URL")!, env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await user.rpc("is_service_staff", { _service: "data" });
  if (error) return { kind: "none", status: 401, error: "Sign in first" };
  if (data !== true) return { kind: "none", status: 403, error: "Only ISOKO's data staff can do this" };
  return { kind: "staff", userId };
}

/** CORS for the website's origins (SITE_ORIGINS); anything goes locally */
export function corsFor(env: Env, req: Request): Record<string, string> {
  const origins = (env.get("SITE_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const allow = origins.includes(origin) ? origin : mocksAllowed(env) ? "*" : (origins[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

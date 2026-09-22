import type { NextFunction, Request, Response } from "express";
import { queryOne } from "../db.js";
import { forbidden, notFound, unauthorized } from "../lib/http.js";
import { findSessionUser, userForToken, type SessionUser } from "../services/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      /** The signed-in Isoko account, even if it has no Training Center role */
      authUser?: { id: string; email: string };
      /** The access token of this request (to act as the user in Supabase Auth) */
      accessToken?: string;
    }
  }
}

/** Reads the Supabase access token ("Authorization: Bearer ...") sent by the Isoko site. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const auth = await userForToken(token);
    if (auth) {
      req.authUser = auth;
      req.accessToken = token;
      const user = await findSessionUser(auth);
      if (user) req.user = user;
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  next();
}

/**
 * Allows only the given roles. Roles come from the database via the session.
 * Someone still on a temporary password (given out by an admin) must choose their
 * own before using any portal, so a leaked temporary password has little value.
 */
export function requireRole(...roles: SessionUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    if (req.user.must_change_password) throw forbidden("Choose a new password before continuing");
    next();
  };
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** The trainer record of the signed-in trainer. */
export async function currentTrainerId(req: Request): Promise<string> {
  const me = currentUser(req);
  const row = await queryOne<{ id: string }>("SELECT id FROM trainers WHERE user_id = $1 AND is_active", [me.id]);
  if (!row) throw forbidden("Your trainer profile is inactive. Contact the administrator.");
  return row.id;
}

/** The student record of the signed-in student. */
export async function currentStudentId(req: Request): Promise<string> {
  const me = currentUser(req);
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [me.id]);
  if (!row) throw notFound("No student record is linked to this account");
  return row.id;
}

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { DatabaseStore } from "../lib/rateLimitStore.js";
import { query, queryOne } from "../db.js";
import { badRequest, parse } from "../lib/http.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { changeOwnPassword, verifyPassword } from "../services/auth.js";

// Signing in and out happens with Isoko's Supabase Auth in the browser. The API
// only says who the signed-in account is here and handles password changes.
export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 20 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new DatabaseStore("password"),
  message: { error: { message: "Too many attempts. Please wait a few minutes and try again.", code: "rate_limited" } },
});

async function me(userId: string) {
  return queryOne(
    `SELECT u.id, u.email, u.role, u.full_name, u.phone, u.must_change_password,
            s.id AS student_id, s.student_number, t.id AS trainer_id
     FROM users u LEFT JOIN students s ON s.user_id = u.id LEFT JOIN trainers t ON t.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
}

// null when the Isoko account has no Training Center role (not an admin, trainer or student)
authRouter.get("/me", async (req, res) => {
  if (req.user) {
    await query("UPDATE users SET last_login_at = now() WHERE id = $1 AND (last_login_at IS NULL OR last_login_at < now() - interval '10 minutes')", [req.user.id]);
  }
  res.json({ data: req.user ? await me(req.user.id) : null });
});

authRouter.post("/change-password", requireAuth, limiter, async (req, res) => {
  const user = currentUser(req);
  const body = parse(
    z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8, "Use at least 8 characters").max(200),
    }),
    req.body,
  );
  if (!(await verifyPassword(user.email, body.current_password))) throw badRequest("Your current password is incorrect");
  if (body.current_password === body.new_password) throw badRequest("Choose a password different from the current one");
  await changeOwnPassword(req.accessToken!, body.new_password);
  await query("UPDATE users SET must_change_password = false WHERE id = $1", [user.id]);
  res.json({ data: await me(user.id) });
});

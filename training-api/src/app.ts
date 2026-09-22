import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { runJobsSoon } from "./jobs.js";
import { loadUser } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { checkOrigin } from "./middleware/origin.js";
import { adminRouter } from "./routes/admin/index.js";
import { authRouter } from "./routes/auth.js";
import { notificationsRouter } from "./routes/notifications.js";
import { publicRouter } from "./routes/public.js";
import { studentRouter } from "./routes/student.js";
import { teachingRouter } from "./routes/teaching.js";
import { trainerRouter } from "./routes/trainer.js";

// The Isoko site calls the API from its own origin with the Supabase access token
// in the Authorization header, so only the site's origins may read responses.
function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, apikey, x-client-info");
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }
  next();
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(cors, securityHeaders);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  const api = express.Router();
  api.use(checkOrigin);
  api.use(loadUser);
  // Emails and intake statuses are brought up to date after requests, since an
  // Edge Function has no long-running timers.
  api.use((_req, res, next) => {
    res.on("finish", runJobsSoon);
    next();
  });
  api.get("/health", (_req, res) => {
    res.json({ data: { ok: true } });
  });
  api.use("/public", publicRouter);
  api.use("/auth", authRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/admin", adminRouter);
  api.use("/classes", teachingRouter);
  api.use("/trainer", trainerRouter);
  api.use("/student", studentRouter);
  api.use(notFoundHandler);
  // "/training" is the Edge Function's own path; "/api" is used under Node.
  app.use(["/training", "/api"], api);

  app.use(errorHandler);
  return app;
}

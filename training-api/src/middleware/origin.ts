import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { forbidden } from "../lib/http.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF defence on top of SameSite=Lax cookies: a state-changing request that says
// where it came from must come from our own site.
export function checkOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // same-origin requests from older browsers, curl, tests
  const self = `${req.protocol}://${req.get("host")}`;
  if (origin === self || config.allowedOrigins.includes(origin)) return next();
  throw forbidden("Request origin not allowed");
}

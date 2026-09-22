import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "../lib/http.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Not found", code: "not_found" } });
}

// Users see only messages we wrote; database errors and stack traces stay in the log.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : "Invalid file upload";
    res.status(400).json({ error: { message, code: "bad_upload" } });
    return;
  }
  // Errors raised by Express itself (static files, body parser) carry their own status
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500 && (err as { expose?: boolean }).expose) {
    res.status(status).json({ error: { message: status === 404 ? "Not found" : "Bad request", code: "bad_request" } });
    return;
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    res.status(400).json({ error: { message: "Invalid JSON body", code: "bad_request" } });
    return;
  }
  // Postgres constraint violations are the result of bad input, not server faults
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") {
    res.status(409).json({ error: { message: "This already exists", code: "conflict" } });
    return;
  }
  if (pgCode === "23503" || pgCode === "23514" || pgCode === "22P02") {
    res.status(400).json({ error: { message: "Invalid data", code: "bad_request" } });
    return;
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: { message: "Something went wrong", code: "server_error" } });
}

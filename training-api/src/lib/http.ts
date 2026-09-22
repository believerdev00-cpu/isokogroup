import type { Request } from "express";
import { z, ZodError } from "zod";

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message, "bad_request");
export const unauthorized = (message = "Please sign in") => new HttpError(401, message, "unauthorized");
export const forbidden = (message = "You are not allowed to do this") => new HttpError(403, message, "forbidden");
export const notFound = (message = "Not found") => new HttpError(404, message, "not_found");
export const conflict = (message: string) => new HttpError(409, message, "conflict");

/** Parses input with a zod schema, turning failures into a 400 with a readable message. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest(formatZodError(result.error));
  return result.data;
}

export function formatZodError(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid input";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

export const uuid = z.string().uuid();

export function param(req: Request, name: string): string {
  return parse(uuid, req.params[name]);
}

/** Optional, trimmed text: empty strings become null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)")
  .nullish()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

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

/**
 * The platform's finance functions refuse bad requests with messages written
 * for people (SQLSTATE 22023 bad value, 42501 not allowed, 23505 duplicate,
 * P0002 not found). Those become HTTP errors with that message; anything else
 * is rethrown unchanged.
 */
export async function dbRules<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    const status = { "22023": 400, "42501": 403, "23505": 409, P0002: 404 }[code ?? ""];
    if (status && message) throw new HttpError(status, message, status === 403 ? "forbidden" : "bad_request");
    throw err;
  }
}

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

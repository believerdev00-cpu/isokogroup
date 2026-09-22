import crypto from "node:crypto";
import path from "node:path";
import type { Response } from "express";
import multer from "multer";
import { config } from "../config.js";
import { badRequest, HttpError, notFound } from "../lib/http.js";

// Every file here is private: application documents and student photos live in a
// private Supabase Storage bucket and are only streamed by API routes that check
// who is asking. The bucket is never exposed to the browser directly.
export type StorageArea = "application-documents" | "student-photos";

const ALLOWED: Record<StorageArea, { exts: string[]; mime: string[] }> = {
  "application-documents": { exts: [".pdf", ".jpg", ".jpeg", ".png", ".webp"], mime: ["application/pdf", "image/"] },
  "student-photos": { exts: [".jpg", ".jpeg", ".png", ".webp"], mime: ["image/"] },
};

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const KEY_PATTERN = /^[a-z-]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export type IncomingFile = { buffer: Buffer; originalname: string; mimetype: string };

export interface StorageService {
  save(area: StorageArea, ownerId: string, file: IncomingFile): Promise<string>;
  remove(key: string): Promise<void>;
  send(res: Response, key: string): Promise<void>;
}

class SupabaseStorage implements StorageService {
  private url(key: string) {
    return `${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${key}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, ...extra };
  }

  async save(area: StorageArea, ownerId: string, file: IncomingFile) {
    const ext = path.extname(file.originalname).toLowerCase();
    const rules = ALLOWED[area];
    if (!rules.exts.includes(ext) || !rules.mime.some((m) => file.mimetype.startsWith(m))) {
      throw badRequest(`Please upload a ${rules.exts.join(", ")} file`);
    }
    const key = `${area}/${ownerId}/${crypto.randomUUID()}${ext}`;
    const res = await fetch(this.url(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": CONTENT_TYPES[ext], "x-upsert": "false" }),
      body: new Uint8Array(file.buffer),
    });
    if (!res.ok) throw new HttpError(502, "Could not store the file. Please try again.", "storage_error");
    return key;
  }

  async remove(key: string) {
    if (!KEY_PATTERN.test(key)) return;
    await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    }).catch(() => null);
  }

  async send(res: Response, key: string) {
    if (!KEY_PATTERN.test(key)) throw notFound();
    const file = await fetch(this.url(key), { headers: this.headers() }).catch(() => null);
    if (!file || !file.ok) throw notFound("File not found");
    const ext = path.extname(key).toLowerCase();
    res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(await file.arrayBuffer()));
  }
}

export const storage: StorageService = new SupabaseStorage();

// Uploads are small (documents, photos), so they're kept in memory until stored.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

/** Kept for the routes' error paths; memory uploads need no clean-up. */
export function discardUpload(_file: Express.Multer.File | undefined) {}

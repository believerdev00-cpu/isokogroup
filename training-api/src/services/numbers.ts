import { queryOne, type Queryable } from "../db.js";

// Human-readable, yearly-sequenced numbers:
//   ISOKO-APP-2027-00125  application reference
//   ISK-2027-00125        student number
//   ISK-RCPT-2027-00007   receipt
//   ISK-CERT-2027-00125   certificate
const FORMATS = {
  application: (y: number, n: number) => `ISOKO-APP-${y}-${String(n).padStart(5, "0")}`,
  student: (y: number, n: number) => `ISK-${y}-${String(n).padStart(5, "0")}`,
  receipt: (y: number, n: number) => `ISK-RCPT-${y}-${String(n).padStart(5, "0")}`,
  certificate: (y: number, n: number) => `ISK-CERT-${y}-${String(n).padStart(5, "0")}`,
} as const;

/** Next number in the series; runs inside the caller's transaction so it can't be reused. */
export async function nextNumber(kind: keyof typeof FORMATS, year: number, client: Queryable) {
  const row = await queryOne<{ value: number }>(
    `INSERT INTO counters (key, value) VALUES ($1, 1)
     ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [`${kind}:${year}`],
    client,
  );
  return FORMATS[kind](year, row!.value);
}

export const yearOf = (date: string | Date) => new Date(date).getUTCFullYear();

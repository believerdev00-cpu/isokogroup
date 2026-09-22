// Display helpers. Dates from the API are 'YYYY-MM-DD' (calendar dates) or ISO
// timestamps; calendar dates are shown as-is, never shifted by time zone.

const isDateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const toDate = (v: string | Date) => (typeof v === "string" && isDateOnly(v) ? new Date(`${v}T00:00:00Z`) : new Date(v));

/** 5 Jan 2027 */
export function formatDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = toDate(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: isDateOnly(String(v)) ? "UTC" : undefined });
}

/** January 5, 2027 */
export function formatLongDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = toDate(v);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: isDateOnly(String(v)) ? "UTC" : undefined });
}

/** Jan 2027 */
export function formatMonth(v: string | null | undefined) {
  if (!v) return "—";
  return toDate(v).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Oct – Dec 2026" or "Jan – Jun 2027" */
export function formatPeriod(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "—";
  const s = toDate(start);
  const e = toDate(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const m = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return sameYear ? `${m(s)} – ${m(e)} ${e.getUTCFullYear()}` : `${m(s)} ${s.getUTCFullYear()} – ${m(e)} ${e.getUTCFullYear()}`;
}

export function formatDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatMoney(amount: number | null | undefined, currency = "RWF") {
  if (amount === null || amount === undefined) return "—";
  return `${currency} ${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatPercent(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}%`;
}

export function formatDuration(value: number, unit: string) {
  const u = value === 1 ? unit.replace(/s$/, "") : unit;
  return `${value} ${u.charAt(0).toUpperCase()}${u.slice(1)}`;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [1,2,3,4,5] → "Mon–Fri"; [1,3,5] → "Mon, Wed, Fri" */
export function formatDays(days: number[] | null | undefined) {
  if (!days || days.length === 0) return "—";
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${WEEKDAYS[sorted[0] - 1]}–${WEEKDAYS[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((d) => WEEKDAYS[d - 1]).join(", ");
}

/** "08:00" → "8:00 AM" */
export function formatTime(t: string | null | undefined) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** "under_review" → "Under review" */
export const humanize = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");

/** plural(1, "student") → "1 student"; plural(3, "class", "classes") → "3 classes" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

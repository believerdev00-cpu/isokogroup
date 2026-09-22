import { pool, queryOne, type Queryable } from "../db.js";

export type CenterSettings = {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
};
export type GradingSettings = { pass_mark: number; scale: { grade: string; min: number }[] };
export type CertificateRequirements = {
  require_completed: boolean;
  min_attendance: number;
  require_all_assessments: boolean;
  require_pass: boolean;
  require_fees_cleared: boolean;
};
export type ApplicationSettings = { require_document: boolean };

type SettingsMap = {
  center: CenterSettings;
  grading: GradingSettings;
  certificate_requirements: CertificateRequirements;
  applications: ApplicationSettings;
};

export const SETTING_KEYS = ["center", "grading", "certificate_requirements", "applications"] as const;

export async function getSetting<K extends keyof SettingsMap>(key: K, client: Queryable = pool): Promise<SettingsMap[K]> {
  const row = await queryOne<{ value: SettingsMap[K] }>("SELECT value FROM settings WHERE key = $1", [key], client);
  if (!row) throw new Error(`Missing setting ${key}`);
  return row.value;
}

export async function allSettings(): Promise<SettingsMap> {
  const entries = await Promise.all(SETTING_KEYS.map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as SettingsMap;
}

/** Today's date in the center's time zone, as 'YYYY-MM-DD'. */
export async function today(client: Queryable = pool): Promise<string> {
  const { timezone } = await getSetting("center", client);
  const row = await queryOne<{ d: string }>("SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d", [timezone], client);
  return row!.d;
}

export function gradeFor(percentage: number, grading: GradingSettings) {
  const sorted = [...grading.scale].sort((a, b) => b.min - a.min);
  return (sorted.find((s) => percentage >= s.min) ?? sorted[sorted.length - 1]).grade;
}

import { useApi } from "@/training/lib/query";
import type { Intake, IntakeProgram } from "@/training/lib/types";

export type Settings = {
  center: { name: string; tagline: string; email: string; phone: string; address: string; currency: string; timezone: string };
  grading: { pass_mark: number; scale: { grade: string; min: number }[] };
  certificate_requirements: {
    require_completed: boolean;
    min_attendance: number;
    require_all_assessments: boolean;
    require_pass: boolean;
    require_fees_cleared: boolean;
  };
  applications: { require_document: boolean };
};

export type Trainer = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  specialization: string | null;
  bio: string | null;
  is_active: boolean;
  last_login_at: string | null;
  active_classes: number;
};

export const useSettings = () => useApi<Settings>("/admin/settings");

/** The center's currency code (RWF until settings load). */
export function useCurrency() {
  return useSettings().data?.center.currency ?? "RWF";
}

export const useIntakes = () => useApi<Intake[]>("/admin/intakes");
export const useTrainers = () => useApi<Trainer[]>("/admin/trainers");
export const useIntakeDetail = (id: string | null) =>
  useApi<Intake & { programs: IntakeProgram[] }>(id ? `/admin/intakes/${id}` : null);
export const usePrograms = () => useApi<{ id: string; name: string; code: string; is_active: boolean }[]>("/admin/programs");

/** Mutation prefixes to refresh after money or enrollment changes. */
export const FINANCE_KEYS = ["/admin/enrollments", "/admin/students", "/admin/payments", "/admin/dashboard", "/admin/reports", "/admin/certificates"];

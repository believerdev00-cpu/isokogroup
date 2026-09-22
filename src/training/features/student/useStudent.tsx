import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, NativeSelect, PageHeader, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { useApi } from "@/training/lib/query";
import type { AttendanceSummary, EnrollmentStatus, FinanceSummary, ResultSummary } from "@/training/lib/types";

export type StudentEnrollment = {
  id: string;
  status: EnrollmentStatus;
  enrolled_on: string;
  completed_on: string | null;
  program_id: string;
  program_name: string;
  program_code: string;
  duration_value: number;
  duration_unit: "weeks" | "months";
  program_description: string;
  course_content: string;
  intake_id: string;
  intake_name: string;
  training_starts_on: string;
  training_ends_on: string;
  location: string;
  class_id: string | null;
  class_code: string | null;
  room: string | null;
  meeting_days: number[] | null;
  start_time: string | null;
  end_time: string | null;
  trainer_name: string | null;
  trainer_email: string | null;
  attendance: AttendanceSummary;
  results: ResultSummary;
  finance: FinanceSummary;
  progress: number;
};

export type CertificateRequirements = {
  require_completed: boolean;
  min_attendance: number;
  require_all_assessments: boolean;
  require_pass: boolean;
  require_fees_cleared: boolean;
  pass_mark: number;
};

export type StudentDashboard = {
  student: {
    id: string;
    student_number: string;
    full_name: string;
    email: string;
    phone: string;
    address: string;
    date_of_birth: string | null;
    created_at: string;
  };
  currency: string;
  certificate_requirements: CertificateRequirements;
  enrollments: StudentEnrollment[];
};

export function useStudentDashboard() {
  return useApi<StudentDashboard>("/student/dashboard");
}

/** Most recent active enrollment, else the most recent one (the API sorts newest first). */
function defaultEnrollment(list: StudentEnrollment[]) {
  return list.find((e) => e.status === "active") ?? list[0];
}

/**
 * Page shell for student pages that are about one enrollment. A student with more
 * than one program (over the years) gets a selector; the choice is kept in ?e=.
 */
export function StudentEnrollmentPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (enrollment: StudentEnrollment, data: StudentDashboard) => ReactNode;
}) {
  const q = useStudentDashboard();
  const [params, setParams] = useSearchParams();
  return (
    <QueryView query={q}>
      {(data) => {
        if (data.enrollments.length === 0) {
          return (
            <>
              <PageHeader title={title} />
              <EmptyState
                icon={GraduationCap}
                title="You're not enrolled in a program yet"
                description="When an application is approved, your program appears here."
                action={<Button asChild variant="outline"><Link to="/training-center/intakes">See available intakes</Link></Button>}
              />
            </>
          );
        }
        const chosen = data.enrollments.find((e) => e.id === params.get("e")) ?? defaultEnrollment(data.enrollments);
        return (
          <>
            <PageHeader
              title={title}
              subtitle={subtitle ?? `${chosen.program_name} · ${chosen.intake_name}`}
              actions={
                data.enrollments.length > 1 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Program</span>
                    <NativeSelect
                      className="w-64"
                      value={chosen.id}
                      onChange={(e) => {
                        const next = new URLSearchParams(params);
                        next.set("e", e.target.value);
                        setParams(next, { replace: true });
                      }}
                    >
                      {data.enrollments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.program_name} — {e.intake_name}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ) : undefined
              }
            />
            {children(chosen, data)}
          </>
        );
      }}
    </QueryView>
  );
}

/** "Tomorrow, 8:00 AM" style description of the next meeting, or null. */
export function nextClass(e: StudentEnrollment) {
  if (!e.meeting_days?.length || !e.start_time || e.status !== "active") return null;
  const now = new Date();
  const end = new Date(`${e.training_ends_on}T23:59:59`);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = ((d.getDay() + 6) % 7) + 1;
    if (!e.meeting_days.includes(iso)) continue;
    const [h, m] = e.start_time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    if (i === 0 && d < now) continue;
    if (d > end || d < new Date(`${e.training_starts_on}T00:00:00`)) {
      if (d > end) return null;
      continue;
    }
    return { date: d, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "long" }) };
  }
  return null;
}

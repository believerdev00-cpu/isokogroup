import type { AssessmentType, AttendanceMark, AttendanceSummary, ResultSummary } from "@/training/lib/types";

// Shapes returned by /api/classes/... (server/src/routes/teaching.ts)

export type RosterStudent = {
  enrollment_id: string;
  enrollment_status: string;
  student_id: string;
  student_number: string;
  full_name: string;
  phone: string;
  email: string;
};

export type ClassSession = { id: string; session_date: string; topic: string; notes: string };

export type Assessment = {
  id: string;
  class_id: string;
  type: AssessmentType;
  title: string;
  description: string;
  due_date: string | null;
  max_marks: number;
  weight: number;
  marked_count?: number;
};

export type ClassDetail = {
  id: string;
  code: string;
  room: string;
  meeting_days: number[];
  start_time: string;
  end_time: string;
  status: "active" | "completed" | "cancelled";
  program_name: string;
  program_code: string;
  intake_name: string;
  intake_id: string;
  training_starts_on: string;
  training_ends_on: string;
  trainer_name: string | null;
  students: (RosterStudent & { attendance: AttendanceSummary; results: ResultSummary; progress: number })[];
  sessions: ClassSession[];
  assessments: Assessment[];
};

export type AttendanceDay = {
  date: string;
  session: ClassSession | null;
  students: (RosterStudent & { status: AttendanceMark | null; note: string | null; attendance_rate: number | null })[];
};

export type Grading = { pass_mark: number; scale: { grade: string; min: number }[] };

export type AssessmentMarks = {
  assessment: Assessment;
  grading: Grading;
  students: (RosterStudent & { marks: number | null; feedback: string; percentage: number | null; grade: string | null })[];
};

export type ClassResults = {
  assessments: Pick<Assessment, "id" | "type" | "title" | "max_marks" | "weight" | "due_date">[];
  students: (RosterStudent & { marks: Record<string, number>; results: ResultSummary })[];
};

export const ASSESSMENT_TYPES: AssessmentType[] = ["assignment", "test", "exam", "project"];

export function gradeFor(pct: number, grading: Grading) {
  const sorted = [...grading.scale].sort((a, b) => b.min - a.min);
  return (sorted.find((g) => pct >= g.min) ?? sorted[sorted.length - 1])?.grade ?? "—";
}

/** Today's date in the browser as YYYY-MM-DD. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resultLabel(r: ResultSummary) {
  if (r.passed === null) return { status: "in_progress", label: "In progress" };
  return r.passed ? { status: "pass", label: "Pass" } : { status: "fail", label: "Fail" };
}

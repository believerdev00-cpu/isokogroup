// Shapes returned by the API (see server/src/routes). Only fields the UI uses.

export type IntakeStatus = "draft" | "upcoming" | "open" | "full" | "closed" | "completed" | "archived";
export type ApplicationStatus = "pending" | "under_review" | "approved" | "rejected" | "waitlisted" | "withdrawn";
export type EnrollmentStatus = "active" | "completed" | "withdrawn";
export type PaymentStatus = "paid" | "partially_paid" | "outstanding";
export type AttendanceMark = "present" | "absent" | "late" | "excused";
export type AssessmentType = "assignment" | "test" | "exam" | "project";

export type Center = {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  require_document: boolean;
};

export type Program = {
  id: string;
  code: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  duration_value: number;
  duration_unit: "weeks" | "months";
  tuition_fee: number;
  registration_fee: number;
  course_content: string;
  requirements: string;
  max_students: number;
  is_active: boolean;
  intake_count?: number;
  active_students?: number;
};

/** A program as offered in a public intake listing. */
export type PublicOffering = {
  intake_program_id: string;
  program_id: string;
  name: string;
  slug: string;
  code: string;
  category: string;
  description: string;
  duration_value: number;
  duration_unit: "weeks" | "months";
  requirements: string;
  schedule: string;
  tuition_fee: number;
  registration_fee: number;
  capacity: number;
  enrolled: number;
  available_seats: number;
  /** no longer bookable: full, not accepting, or past its own deadline */
  is_full: boolean;
  /** this program's application deadline (its own, or the intake's) */
  application_closes_on?: string;
  /** past this program's own deadline */
  is_closed?: boolean;
};

export type PublicIntake = {
  id: string;
  name: string;
  slug: string;
  description: string;
  location: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  training_ends_on: string;
  status: IntakeStatus;
  /** False for an intake that is published but has not opened to applicants yet. */
  applications_open?: boolean;
  programs: PublicOffering[];
};

export type Intake = {
  id: string;
  name: string;
  slug: string;
  description: string;
  location: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  training_ends_on: string;
  status: IntakeStatus;
  status_mode: "auto" | "manual";
  published_at: string | null;
  program_count: number;
  capacity: number;
  enrolled: number;
  pending_applications: number;
  /** Today relative to the application period, computed by the server in the center's time zone. */
  application_window?: "upcoming" | "open" | "closed";
  /** What the website's moving intake band shows, and how prominently. */
  show_in_ticker: boolean;
  is_featured: boolean;
  ticker_priority: number;
};

export type IntakeProgram = {
  id: string;
  intake_id: string;
  program_id: string;
  program_name: string;
  program_code: string;
  capacity: number;
  enrolled: number;
  available_seats: number;
  tuition_fee: number | null;
  registration_fee: number | null;
  program_tuition_fee: number;
  program_registration_fee: number;
  schedule: string;
  accepting_applications: boolean;
  /** this program's own application deadline (YYYY-MM-DD); null: the intake's */
  application_closes_on: string | null;
  pending_applications: number;
  waitlisted: number;
  class_count: number;
};

export type AttendanceSummary = { sessions: number; present: number; late: number; absent: number; excused: number; rate: number | null };
export type ResultSummary = {
  assessments_total: number;
  assessments_completed: number;
  percentage: number | null;
  final_percentage: number | null;
  grade: string | null;
  passed: boolean | null;
};
export type FinanceSummary = { total_fees: number; total_paid: number; balance: number; payment_status: PaymentStatus };

export type Eligibility = {
  eligible: boolean;
  checks: { key: string; label: string; required: boolean; met: boolean; detail: string }[];
};

/** Returned when an application is approved (or a student is added). */
export type ApprovalResult = {
  application_id: string;
  student_id: string;
  student_number: string;
  enrollment_id: string;
  class_code: string | null;
  /** temporary_password is null when an existing Isoko account was linked (it keeps its password) */
  login: { email: string; temporary_password: string | null } | null;
};

export type ClassSummary = {
  id: string;
  code: string;
  room: string;
  meeting_days: number[];
  start_time: string;
  end_time: string;
  status: "active" | "completed" | "cancelled";
  trainer_id?: string | null;
  trainer_name?: string | null;
  program_name: string;
  intake_name: string;
  intake_id?: string;
  intake_program_id?: string;
  student_count: number;
};

export type Notification = { id: string; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: "all" | "students" | "trainers" | "intake" | "class";
  created_at: string;
  /** when an admin last corrected it */
  updated_at?: string | null;
  class_code?: string | null;
  intake_name?: string | null;
  author?: string | null;
};

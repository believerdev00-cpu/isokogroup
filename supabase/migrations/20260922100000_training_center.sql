-- Isoko Training Center, in its own "training" schema of the Isoko database.
--
-- Only the 'training' Edge Function reads and writes these tables (it connects as
-- the database owner). The schema is not exposed through the Supabase API and
-- the anon/authenticated roles get no access to it.
--
-- Sign-in is Isoko's Supabase Auth: training.users.id is the auth user's id and
-- says which Training Center role (admin, trainer, student) that account has.

CREATE SCHEMA IF NOT EXISTS training;
REVOKE ALL ON SCHEMA training FROM PUBLIC, anon, authenticated;
SET search_path TO training, public;

-- Isoko Training Center schema.
--
-- The core idea: reusable PROGRAMS are offered in time-boxed INTAKES
-- (intake_programs, each with its own capacity and fees). People APPLY to an
-- intake program; approval turns the applicant into a STUDENT (a person, kept
-- once) with an ENROLLMENT (that person in that intake program). Classes,
-- attendance, assessments, payments and certificates all hang off enrollments,
-- so one student can take several programs over the years and nothing is lost
-- when an intake closes.

CREATE OR REPLACE FUNCTION training.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============== PEOPLE & ACCESS ==============
CREATE TABLE roles (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL
);
INSERT INTO roles (key, name, description) VALUES
  ('admin', 'Administrator', 'Runs the training center: intakes, applications, students, finance, certificates, settings'),
  ('trainer', 'Trainer', 'Teaches assigned classes: attendance, lessons, assessments and results'),
  ('student', 'Student', 'Sees their own program, schedule, attendance, results, payments and certificate');

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL REFERENCES roles(key),
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Yearly running numbers for references (applications, students, receipts, certificates)
CREATE TABLE counters (
  key text PRIMARY KEY,
  value integer NOT NULL
);

CREATE TABLE trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  specialization text,
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trainers_updated_at BEFORE UPDATE ON trainers FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- ============== PROGRAMS & INTAKES ==============
CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_value integer NOT NULL CHECK (duration_value > 0),
  duration_unit text NOT NULL CHECK (duration_unit IN ('weeks', 'months')),
  tuition_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (tuition_fee >= 0),
  registration_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
  course_content text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  max_students integer NOT NULL DEFAULT 30 CHECK (max_students > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER programs_updated_at BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- status is what applicants see. In 'auto' mode the server keeps it in step with
-- the dates and seats (upcoming → open → full/closed); in 'manual' mode an admin
-- has pinned it. draft, completed and archived are always set by an admin.
CREATE TABLE intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  application_opens_on date NOT NULL,
  application_closes_on date NOT NULL,
  training_starts_on date NOT NULL,
  training_ends_on date NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'upcoming', 'open', 'full', 'closed', 'completed', 'archived')),
  status_mode text NOT NULL DEFAULT 'auto' CHECK (status_mode IN ('auto', 'manual')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (application_closes_on >= application_opens_on),
  CHECK (training_ends_on >= training_starts_on)
);
CREATE INDEX intakes_status_idx ON intakes (status);
CREATE TRIGGER intakes_updated_at BEFORE UPDATE ON intakes FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- A program as offered in one intake. Fees default to the program's but can differ.
CREATE TABLE intake_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES intakes(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  capacity integer NOT NULL CHECK (capacity > 0),
  tuition_fee numeric(12,2) CHECK (tuition_fee >= 0),
  registration_fee numeric(12,2) CHECK (registration_fee >= 0),
  schedule text NOT NULL DEFAULT '',
  accepting_applications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_id, program_id)
);
CREATE INDEX intake_programs_program_idx ON intake_programs (program_id);
CREATE TRIGGER intake_programs_updated_at BEFORE UPDATE ON intake_programs FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- ============== APPLICATIONS ==============
CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  student_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  phone text NOT NULL,
  email text NOT NULL,
  address text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_phone text NOT NULL DEFAULT '',
  previous_education text NOT NULL DEFAULT '',
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX students_email_key ON students (lower(email));
CREATE INDEX students_name_idx ON students (lower(full_name));
CREATE INDEX students_phone_idx ON students (phone);
CREATE TRIGGER students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  intake_program_id uuid NOT NULL REFERENCES intake_programs(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  phone text NOT NULL,
  email text NOT NULL,
  address text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_phone text NOT NULL DEFAULT '',
  previous_education text NOT NULL DEFAULT '',
  additional_info text NOT NULL DEFAULT '',
  document_path text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'waitlisted', 'withdrawn')),
  decision_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applications_intake_program_idx ON applications (intake_program_id, status);
CREATE INDEX applications_status_idx ON applications (status, submitted_at);
CREATE INDEX applications_email_idx ON applications (lower(email));
CREATE INDEX applications_phone_idx ON applications (phone);
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- ============== ENROLLMENTS & CLASSES ==============
CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  intake_program_id uuid NOT NULL REFERENCES intake_programs(id) ON DELETE RESTRICT,
  trainer_id uuid REFERENCES trainers(id) ON DELETE SET NULL,
  room text NOT NULL DEFAULT '',
  -- ISO weekdays the class meets (1 = Monday ... 7 = Sunday)
  meeting_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '10:00',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK (meeting_days <@ '{1,2,3,4,5,6,7}'::smallint[])
);
CREATE INDEX classes_trainer_idx ON classes (trainer_id);
CREATE INDEX classes_intake_program_idx ON classes (intake_program_id);
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- A student taking one program in one intake. Fees are copied in at enrollment so
-- later price changes don't rewrite what a student owes.
CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  intake_program_id uuid NOT NULL REFERENCES intake_programs(id) ON DELETE RESTRICT,
  application_id uuid UNIQUE REFERENCES applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_on date NOT NULL DEFAULT current_date,
  completed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, intake_program_id)
);
CREATE INDEX enrollments_intake_program_idx ON enrollments (intake_program_id, status);
CREATE TRIGGER enrollments_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

-- Which class an enrollment attends (one class per enrollment).
CREATE TABLE class_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_students_class_idx ON class_students (class_id);

-- One row per class meeting that has a lesson or attendance recorded.
CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  topic text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, session_date)
);
CREATE TRIGGER class_sessions_updated_at BEFORE UPDATE ON class_sessions FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, enrollment_id)
);
CREATE INDEX attendance_enrollment_idx ON attendance (enrollment_id);

-- ============== ASSESSMENTS ==============
CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('assignment', 'test', 'exam', 'project')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  due_date date,
  max_marks numeric(8,2) NOT NULL CHECK (max_marks > 0),
  -- Share of the final mark, in percent. Weights of a class needn't add to 100;
  -- the final mark is normalised by the total weight.
  weight numeric(6,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessments_class_idx ON assessments (class_id);
CREATE TRIGGER assessments_updated_at BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION training.set_updated_at();

CREATE TABLE assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  marks numeric(8,2) NOT NULL CHECK (marks >= 0),
  feedback text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, enrollment_id)
);
CREATE INDEX assessment_results_enrollment_idx ON assessment_results (enrollment_id);

-- ============== FINANCE ==============
-- What an enrollment owes: registration and tuition are added on approval,
-- admins can add other approved fees.
CREATE TABLE fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('registration', 'tuition', 'other')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fee_charges_enrollment_idx ON fee_charges (enrollment_id);

-- Payments are never deleted; a mistake is voided with a reason.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'momo', 'bank', 'card', 'other')),
  reference text NOT NULL DEFAULT '',
  paid_on date NOT NULL,
  notes text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  void_reason text
);
CREATE INDEX payments_enrollment_idx ON payments (enrollment_id);
CREATE INDEX payments_paid_on_idx ON payments (paid_on);

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now()
);

-- ============== CERTIFICATES ==============
-- Name, program and intake are copied at issue time so a certificate always reads
-- the same even if records are later corrected.
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT,
  certificate_number text NOT NULL UNIQUE,
  verification_code text NOT NULL UNIQUE,
  student_name text NOT NULL,
  program_name text NOT NULL,
  intake_name text NOT NULL,
  final_grade text,
  issued_on date NOT NULL DEFAULT current_date,
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============== COMMUNICATION ==============
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  -- everyone, all students, all trainers, one intake's students, or one class
  audience text NOT NULL CHECK (audience IN ('all', 'students', 'trainers', 'intake', 'class')),
  intake_id uuid REFERENCES intakes(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((audience = 'intake') = (intake_id IS NOT NULL)),
  CHECK ((audience = 'class') = (class_id IS NOT NULL))
);
CREATE INDEX announcements_created_idx ON announcements (created_at DESC);

-- In-app notices for users, and emails to anyone (applicants have no account).
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  -- Outbox: 'pending' emails are sent by the server after the work that created
  -- them has committed.
  email_status text NOT NULL DEFAULT 'none'
    CHECK (email_status IN ('none', 'pending', 'sent', 'failed', 'not_configured')),
  email_attempts integer NOT NULL DEFAULT 0,
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_outbox_idx ON notifications (created_at) WHERE email_status = 'pending';

-- Who did what, for the actions that matter (decisions, money, certificates, overrides).
CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_entity_idx ON activity_log (entity, entity_id);

-- ============== DEFAULT SETTINGS ==============
INSERT INTO settings (key, value) VALUES
  ('center', '{"name": "Isoko Training Center", "tagline": "Practical skills. Real opportunities.",
               "email": "training@isoko.rw", "phone": "+250 788 000 000",
               "address": "Kigali, Rwanda", "currency": "RWF", "timezone": "Africa/Kigali"}'),
  ('grading', '{"pass_mark": 50, "scale": [{"grade": "A", "min": 80}, {"grade": "B", "min": 70},
               {"grade": "C", "min": 60}, {"grade": "D", "min": 50}, {"grade": "F", "min": 0}]}'),
  ('certificate_requirements', '{"require_completed": true, "min_attendance": 75,
               "require_all_assessments": true, "require_pass": true, "require_fees_cleared": true}'),
  ('applications', '{"require_document": false}');

-- ============== DERIVED NUMBERS ==============
-- Seats per intake program: available = capacity - approved (non-withdrawn) enrollments.
CREATE VIEW intake_program_stats AS
SELECT ip.id AS intake_program_id,
       ip.intake_id,
       ip.program_id,
       ip.capacity,
       ip.accepting_applications,
       count(e.id) FILTER (WHERE e.status <> 'withdrawn')::int AS enrolled,
       greatest(ip.capacity - count(e.id) FILTER (WHERE e.status <> 'withdrawn'), 0)::int AS available_seats
FROM intake_programs ip
LEFT JOIN enrollments e ON e.intake_program_id = ip.id
GROUP BY ip.id;

-- What each enrollment owes and has paid (voided payments don't count).
CREATE VIEW enrollment_balances AS
SELECT e.id AS enrollment_id,
       coalesce((SELECT sum(amount) FROM fee_charges f WHERE f.enrollment_id = e.id), 0)::numeric(12,2) AS total_fees,
       coalesce((SELECT sum(amount) FROM payments p WHERE p.enrollment_id = e.id AND p.voided_at IS NULL), 0)::numeric(12,2) AS total_paid
FROM enrollments e;


-- ============== ACCESS ==============
REVOKE ALL ON ALL TABLES IN SCHEMA training FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA training FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA training FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA training REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA training REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA training REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Application documents and student photos. Private: files are only streamed by
-- the API after it checks who is asking, so no storage policies are added.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('training', 'training', false, 8388608,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

RESET search_path;

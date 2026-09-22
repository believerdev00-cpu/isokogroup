import { useRef, useState } from "react";
import { Camera, KeyRound, Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog, Facts, Field, NativeSelect, PageHeader, ProgressBar, QueryView, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import CertificatePanel from "@/training/features/certificates/CertificatePanel";
import EnrollmentFinance from "@/training/features/finance/EnrollmentFinance";
import { TempPassword } from "@/training/features/admin-core/shared";
import { api, useApiObjectUrl } from "@/training/lib/api";
import { formatDate, formatDateTime, formatPercent, humanize, initials, plural } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { AttendanceSummary, ClassSummary, EnrollmentStatus, FinanceSummary, ResultSummary } from "@/training/lib/types";

type Enrollment = {
  id: string;
  status: EnrollmentStatus;
  enrolled_on: string;
  completed_on: string | null;
  program_name: string;
  intake_name: string;
  intake_id: string;
  intake_program_id: string;
  training_starts_on: string;
  training_ends_on: string;
  class_id: string | null;
  class_code: string | null;
  room: string | null;
  trainer_name: string | null;
  application_reference: string | null;
  certificate_id: string | null;
  certificate_number: string | null;
  attendance: AttendanceSummary;
  results: ResultSummary;
  finance: FinanceSummary;
  progress: number;
};

type Student = {
  id: string;
  user_id: string | null;
  student_number: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string;
  email: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  previous_education: string;
  created_at: string;
  updated_at: string;
  has_photo: boolean;
  last_login_at: string | null;
  must_change_password: boolean | null;
  enrollments: Enrollment[];
};

// Eligibility (/admin/enrollments/...) depends on status, attendance, marks and fees
function StudentPhoto({ path, name }: { path: string; name: string }) {
  const src = useApiObjectUrl(path);
  return src ? (
    <img src={src} alt={`Photo of ${name}`} className="h-28 w-28 rounded-xl border object-cover" />
  ) : (
    <div className="h-28 w-28 animate-pulse rounded-xl bg-muted" aria-hidden />
  );
}

const CACHES = ["/admin/students", "/admin/enrollments", "/admin/certificates", "/admin/dashboard", "/admin/intakes", "/admin/classes"];

function EditContactDialog({ s, open, onOpenChange }: { s: Student; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({
    full_name: s.full_name, phone: s.phone, address: s.address, date_of_birth: s.date_of_birth ?? "", gender: s.gender ?? "",
    emergency_contact_name: s.emergency_contact_name, emergency_contact_phone: s.emergency_contact_phone, previous_education: s.previous_education,
  });
  const save = useApiMutation(() => api.patch(`/admin/students/${s.id}`, { ...f, date_of_birth: f.date_of_birth || null, gender: f.gender || null }), {
    invalidate: CACHES,
    success: "Details saved",
    onSuccess: () => onOpenChange(false),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit student details</DialogTitle>
          <DialogDescription>The email is the student's login and can't be changed here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="e-name" className="sm:col-span-2"><Input id="e-name" value={f.full_name} onChange={set("full_name")} /></Field>
          <Field label="Phone" htmlFor="e-phone"><Input id="e-phone" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Date of birth" htmlFor="e-dob"><Input id="e-dob" type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></Field>
          <Field label="Gender" htmlFor="e-gender">
            <NativeSelect id="e-gender" value={f.gender} onChange={set("gender")}>
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </NativeSelect>
          </Field>
          <Field label="Address" htmlFor="e-address"><Input id="e-address" value={f.address} onChange={set("address")} /></Field>
          <Field label="Emergency contact" htmlFor="e-ecn"><Input id="e-ecn" value={f.emergency_contact_name} onChange={set("emergency_contact_name")} /></Field>
          <Field label="Emergency phone" htmlFor="e-ecp"><Input id="e-ecp" value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} /></Field>
          <Field label="Previous education" htmlFor="e-edu" className="sm:col-span-2"><Textarea id="e-edu" rows={2} value={f.previous_education} onChange={set("previous_education")} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || f.full_name.trim().length < 3 || f.phone.trim().length < 7}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassSelect({ e }: { e: Enrollment }) {
  const classes = useApi<ClassSummary[]>(`/admin/classes?intake_program_id=${e.intake_program_id}`);
  const move = useApiMutation((classId: string) => api.put(`/admin/enrollments/${e.id}/class`, { class_id: classId || null }), {
    invalidate: CACHES,
    success: "Class updated",
  });
  const options = (classes.data ?? []).filter((c) => c.status === "active" || c.id === e.class_id);
  if (classes.data && options.length === 0) {
    return (
      <p className="text-sm">
        No class for this program yet. <Link to={`/training-center/admin/classes/new?intake_program_id=${e.intake_program_id}`} className="font-semibold text-primary hover:underline">Create a class</Link>
      </p>
    );
  }
  return (
    <NativeSelect value={e.class_id ?? ""} onChange={(ev) => move.mutate(ev.target.value)} disabled={move.isPending || e.status === "withdrawn"} aria-label="Class" className="max-w-xs">
      <option value="">Not in a class</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>{c.code} · {c.trainer_name ?? "no trainer"} · {plural(c.student_count, "student")}</option>
      ))}
    </NativeSelect>
  );
}

const STATUS_ACTIONS: Record<EnrollmentStatus, { to: EnrollmentStatus; label: string; title: string; description: string; destructive?: boolean }[]> = {
  active: [
    { to: "completed", label: "Mark completed", title: "Mark this program completed?", description: "Do this when the student has finished the training. It's one of the certificate requirements." },
    { to: "withdrawn", label: "Withdraw", destructive: true, title: "Withdraw the student from this program?", description: "Their seat becomes free for someone else. Attendance, results and payments stay on record." },
  ],
  completed: [
    { to: "active", label: "Reopen", title: "Set back to active?", description: "Use this if the program was marked completed by mistake." },
  ],
  withdrawn: [
    { to: "active", label: "Reactivate", title: "Reactivate this enrollment?", description: "The student takes a seat again, if one is free." },
  ],
};

function EnrollmentView({ e }: { e: Enrollment }) {
  const [action, setAction] = useState<(typeof STATUS_ACTIONS)["active"][number] | null>(null);
  const change = useApiMutation((status: EnrollmentStatus) => api.patch(`/admin/enrollments/${e.id}`, { status }), {
    invalidate: CACHES,
    success: "Enrollment updated",
    onSuccess: () => setAction(null),
  });
  const r = e.results;
  return (
    <div className="space-y-6">
      <Section
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.program_name} <StatusBadge status={e.status} />
          </span>
        }
        description={`${e.intake_name} · Training ${formatDate(e.training_starts_on)} – ${formatDate(e.training_ends_on)}`}
        actions={STATUS_ACTIONS[e.status].map((a) => (
          <Button key={a.to} size="sm" variant="outline" className={a.destructive ? "text-destructive hover:text-destructive" : undefined} onClick={() => setAction(a)}>
            {a.label}
          </Button>
        ))}
      >
        <div className="space-y-5">
          <Facts
            columns={3}
            items={[
              ["Registered", formatDate(e.enrolled_on)],
              ["Trainer", e.trainer_name ?? "—"],
              ["Room", e.room ?? "—"],
              ["Application", e.application_reference ?? "—"],
              ["Completed", e.completed_on ? formatDate(e.completed_on) : "—"],
              ["Certificate", e.certificate_number ?? "Not issued"],
            ]}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Class</p>
            <ClassSelect e={e} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Attendance</p>
              <p className="tabular text-xl font-bold">{formatPercent(e.attendance.rate)}</p>
              <p className="text-xs text-muted-foreground">
                {e.attendance.present} present · {e.attendance.late} late · {e.attendance.absent} absent · {e.attendance.excused} excused
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Results</p>
              <p className="tabular text-xl font-bold">{r.grade ? `${r.grade} · ${formatPercent(r.percentage)}` : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {r.assessments_completed} of {r.assessments_total} assessments marked
                {r.passed !== null && ` · ${r.passed ? "Pass" : "Fail"}`}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Course progress</p>
              <ProgressBar value={e.progress} label="Course progress" />
            </div>
          </div>
        </div>
      </Section>
      <EnrollmentFinance enrollmentId={e.id} />
      <CertificatePanel enrollmentId={e.id} certificateId={e.certificate_id} />
      {action && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={action.title}
          description={action.description}
          confirmLabel={action.label}
          destructive={action.destructive}
          pending={change.isPending}
          onConfirm={() => change.mutate(action.to)}
        />
      )}
    </div>
  );
}

export default function StudentProfile() {
  const { id } = useParams();
  const q = useApi<Student>(`/admin/students/${id}`);
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [login, setLogin] = useState<{ email: string; temporary_password: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const reset = useApiMutation(() => api.post<{ email: string; temporary_password: string }>(`/admin/students/${id}/reset-password`), {
    onSuccess: (r) => {
      setResetOpen(false);
      setLogin(r);
    },
  });
  const photo = useApiMutation(
    async (file: File) => {
      const form = new FormData();
      form.append("photo", file);
      setUploading(true);
      try {
        return await api.upload(`/admin/students/${id}/photo`, form);
      } finally {
        setUploading(false);
      }
    },
    { invalidate: [`/admin/students/${id}`], success: "Photo updated", onSuccess: () => setPhotoVersion((v) => v + 1) },
  );

  return (
    <QueryView query={q}>
      {(s) => (
        <div className="space-y-6">
          <PageHeader back={{ to: "/training-center/admin/students", label: "Students" }} title={`Student: ${s.student_number}`} subtitle={`Student since ${formatDate(s.created_at)}`} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Section className="lg:col-span-2">
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  {s.has_photo ? (
                    <StudentPhoto
                      path={`/admin/students/${s.id}/photo?v=${encodeURIComponent(s.updated_at)}-${photoVersion}`}
                      name={s.full_name}
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-secondary text-3xl font-bold text-primary" aria-hidden>
                      {initials(s.full_name)}
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      if (f) photo.mutate(f);
                      ev.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
                    {s.has_photo ? "Change photo" : "Add photo"}
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-xl font-bold">{s.full_name}</h2>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                  </div>
                  <div className="mt-3">
                    <Facts
                      items={[
                        ["Phone", <a key="p" href={`tel:${s.phone.replace(/\s/g, "")}`} className="hover:text-primary">{s.phone}</a>],
                        ["Email", <a key="e" href={`mailto:${s.email}`} className="hover:text-primary">{s.email}</a>],
                        ["Date of birth", formatDate(s.date_of_birth)],
                        ["Gender", humanize(s.gender)],
                        ["Address", s.address || "—"],
                        ["Emergency contact", s.emergency_contact_name ? `${s.emergency_contact_name} · ${s.emergency_contact_phone}` : "—"],
                        ["Previous education", s.previous_education || "—"],
                      ]}
                    />
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Portal account">
              {s.user_id ? (
                <div className="space-y-3 text-sm">
                  <p>
                    Last sign-in: <span className="font-medium">{s.last_login_at ? formatDateTime(s.last_login_at) : "Never"}</span>
                  </p>
                  {s.must_change_password && <p className="text-muted-foreground">Still using the temporary password.</p>}
                  <Button variant="outline" onClick={() => setResetOpen(true)}><KeyRound className="mr-1.5 h-4 w-4" />Reset password</Button>
                  {login && <TempPassword email={login.email} password={login.temporary_password} />}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No portal account yet.</p>
              )}
            </Section>
          </div>

          {s.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments.</p>
          ) : s.enrollments.length === 1 ? (
            <EnrollmentView e={s.enrollments[0]} />
          ) : (
            <Tabs defaultValue={s.enrollments[0].id}>
              <TabsList className="h-auto flex-wrap justify-start">
                {s.enrollments.map((e) => (
                  <TabsTrigger key={e.id} value={e.id}>{e.program_name} · {e.intake_name}</TabsTrigger>
                ))}
              </TabsList>
              {s.enrollments.map((e) => (
                <TabsContent key={e.id} value={e.id} className="mt-4">
                  <EnrollmentView e={e} />
                </TabsContent>
              ))}
            </Tabs>
          )}

          {editing && <EditContactDialog s={s} open onOpenChange={setEditing} />}
          <ConfirmDialog
            open={resetOpen}
            onOpenChange={setResetOpen}
            title="Reset this student's password?"
            description="They'll get a new temporary password and be signed out everywhere. You'll see the password once, to share with them."
            confirmLabel="Reset password"
            pending={reset.isPending}
            onConfirm={() => reset.mutate()}
          />
        </div>
      )}
    </QueryView>
  );
}

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Field, NativeSelect, PageHeader, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalResultDialog, APPLICATION_CACHES } from "@/training/features/admin-core/shared";
import { api } from "@/training/lib/api";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { ApprovalResult, Intake, IntakeProgram } from "@/training/lib/types";

const EMPTY = {
  full_name: "", date_of_birth: "", gender: "", phone: "", email: "", address: "",
  emergency_contact_name: "", emergency_contact_phone: "", previous_education: "",
};

// For walk-in students: creates the application and approves it in one step.
export default function AddStudent() {
  const navigate = useNavigate();
  const [intakeId, setIntakeId] = useState("");
  const [intakeProgramId, setIntakeProgramId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  const intakes = useApi<Intake[]>("/admin/intakes");
  const detail = useApi<Intake & { programs: IntakeProgram[] }>(intakeId ? `/admin/intakes/${intakeId}` : null);
  const running = (intakes.data ?? []).filter((i) => !["completed", "archived"].includes(i.status));
  const chosen = detail.data?.programs.find((p) => p.id === intakeProgramId);

  const add = useApiMutation(
    () => api.post<ApprovalResult>("/admin/students", { ...form, intake_program_id: intakeProgramId, gender: form.gender || null, date_of_birth: form.date_of_birth || null }),
    { invalidate: APPLICATION_CACHES, onSuccess: setResult },
  );

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const valid =
    !!chosen && chosen.available_seats > 0 && form.full_name.trim().length >= 3 && form.phone.trim().length >= 7 && /\S+@\S+\.\S+/.test(form.email);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) add.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: "/training-center/admin/students", label: "Students" }}
        title="Add student"
        subtitle="For walk-in students. This creates their application, student number, fees and portal account in one step."
      />
      <form onSubmit={submit} className="space-y-6">
        <Section title="Program">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Intake" htmlFor="intake" required>
              <NativeSelect id="intake" value={intakeId} onChange={(e) => { setIntakeId(e.target.value); setIntakeProgramId(""); }}>
                <option value="">Choose an intake…</option>
                {running.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </NativeSelect>
            </Field>
            <Field
              label="Program"
              htmlFor="program"
              required
              error={chosen && chosen.available_seats <= 0 ? "This program is full. Increase its capacity in the intake first." : null}
              hint={chosen ? `${chosen.available_seats} of ${chosen.capacity} seats left` : undefined}
            >
              <NativeSelect id="program" value={intakeProgramId} onChange={(e) => setIntakeProgramId(e.target.value)} disabled={!detail.data}>
                <option value="">{intakeId ? "Choose a program…" : "Choose an intake first"}</option>
                {(detail.data?.programs ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.program_name}{p.available_seats <= 0 ? " (full)" : ""}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </Section>

        <Section title="Student details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required className="sm:col-span-2">
              <Input id="name" value={form.full_name} onChange={set("full_name")} autoComplete="off" />
            </Field>
            <Field label="Phone" htmlFor="phone" required>
              <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+250 7…" />
            </Field>
            <Field label="Email" htmlFor="email" required hint="Used to sign in to the student portal">
              <Input id="email" type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Date of birth" htmlFor="dob">
              <Input id="dob" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} />
            </Field>
            <Field label="Gender" htmlFor="gender">
              <NativeSelect id="gender" value={form.gender} onChange={set("gender")}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </NativeSelect>
            </Field>
            <Field label="Address" htmlFor="address" className="sm:col-span-2">
              <Input id="address" value={form.address} onChange={set("address")} />
            </Field>
            <Field label="Emergency contact name" htmlFor="ecn">
              <Input id="ecn" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
            </Field>
            <Field label="Emergency contact phone" htmlFor="ecp">
              <Input id="ecp" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
            </Field>
            <Field label="Previous education" htmlFor="edu" className="sm:col-span-2">
              <Textarea id="edu" rows={2} value={form.previous_education} onChange={set("previous_education")} />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate("/training-center/admin/students")}>Cancel</Button>
          <Button type="submit" size="lg" disabled={!valid || add.isPending}>
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add and enroll student
          </Button>
        </div>
      </form>
      <ApprovalResultDialog
        title="Student added"
        result={result}
        onClose={() => {
          const id = result?.student_id;
          setResult(null);
          if (id) navigate(`/training-center/admin/students/${id}`);
        }}
      />
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Field, Loading, NativeSelect, PageHeader, SeatsMeter, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDate } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { IntakeStatus, Program } from "@/training/lib/types";

type Offering = { intake_program_id: string; intake_id: string; intake_name: string; status: IntakeStatus; training_starts_on: string; capacity: number; enrolled: number; available_seats: number };
type Detail = Program & { offerings: Offering[] };

type Form = {
  code: string;
  name: string;
  category: string;
  description: string;
  duration_value: string;
  duration_unit: "weeks" | "months";
  tuition_fee: string;
  registration_fee: string;
  course_content: string;
  requirements: string;
  max_students: string;
  is_active: boolean;
};

const EMPTY: Form = {
  code: "", name: "", category: "", description: "", duration_value: "3", duration_unit: "months", tuition_fee: "0",
  registration_fee: "0", course_content: "", requirements: "", max_students: "30", is_active: true,
};

const CATEGORIES = ["Technology", "Creative", "Business", "Languages", "Vocational"];

export default function ProgramForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const existing = useApi<Detail>(editing ? `/admin/programs/${id}` : null);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    const p = existing.data;
    if (p) {
      setForm({
        code: p.code, name: p.name, category: p.category, description: p.description, duration_value: String(p.duration_value),
        duration_unit: p.duration_unit, tuition_fee: String(p.tuition_fee), registration_fee: String(p.registration_fee),
        course_content: p.course_content, requirements: p.requirements, max_students: String(p.max_students), is_active: p.is_active,
      });
    }
  }, [existing.data]);

  const save = useApiMutation(
    (f: Form) => {
      const body = {
        ...f,
        code: f.code.toUpperCase(),
        duration_value: Number(f.duration_value),
        tuition_fee: Number(f.tuition_fee || 0),
        registration_fee: Number(f.registration_fee || 0),
        max_students: Number(f.max_students),
      };
      return editing ? api.patch<Program>(`/admin/programs/${id}`, body) : api.post<Program>("/admin/programs", body);
    },
    {
      invalidate: ["/admin/programs", "/admin/intakes", "/admin/dashboard"],
      success: editing ? "Program saved" : "Program created",
      onSuccess: (p) => (editing ? undefined : navigate(`/training-center/admin/programs/${p.id}`, { replace: true })),
    },
  );

  if (editing && existing.isLoading) return <Loading />;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const codeOk = /^[A-Za-z0-9]{2,8}$/.test(form.code);
  const valid = codeOk && form.name.trim().length >= 3 && form.category.trim().length >= 2 && Number(form.duration_value) > 0 && Number(form.max_students) > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate(form);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        back={{ to: "/training-center/admin/programs", label: "Programs" }}
        title={editing ? existing.data?.name ?? "Program" : "New program"}
        subtitle={editing ? "Changes to fees apply to new enrollments only; existing students keep what they signed up for." : "A program can be offered in many intakes."}
      />
      <form onSubmit={submit} className="space-y-6">
        <Section title="Program">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required className="sm:col-span-2">
              <Input id="name" value={form.name} onChange={set("name")} placeholder="Full-Stack Web Development" />
            </Field>
            <Field label="Code" htmlFor="code" required hint="2–8 letters or digits, used in class codes (e.g. WD)" error={form.code && !codeOk ? "Use 2–8 letters or digits" : null}>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={8} />
            </Field>
            <Field label="Category" htmlFor="category" required>
              <Input id="category" list="categories" value={form.category} onChange={set("category")} />
              <datalist id="categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2" hint="Shown on the public Programs page.">
              <Textarea id="description" rows={3} value={form.description} onChange={set("description")} />
            </Field>
            <Field label="Duration" htmlFor="duration" required>
              <div className="flex gap-2">
                <Input id="duration" type="number" min={1} inputMode="numeric" value={form.duration_value} onChange={set("duration_value")} className="w-24" />
                <NativeSelect value={form.duration_unit} onChange={set("duration_unit")} aria-label="Duration unit">
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </NativeSelect>
              </div>
            </Field>
            <Field label="Maximum students" htmlFor="max" required hint="Default number of seats when added to an intake">
              <Input id="max" type="number" min={1} inputMode="numeric" value={form.max_students} onChange={set("max_students")} />
            </Field>
          </div>
        </Section>

        <Section title="Fees" description="Intakes can set different fees for a particular period.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tuition fee" htmlFor="tuition">
              <Input id="tuition" type="number" min={0} inputMode="numeric" value={form.tuition_fee} onChange={set("tuition_fee")} />
            </Field>
            <Field label="Registration fee" htmlFor="registration">
              <Input id="registration" type="number" min={0} inputMode="numeric" value={form.registration_fee} onChange={set("registration_fee")} />
            </Field>
          </div>
        </Section>

        <Section title="Content and requirements">
          <div className="space-y-4">
            <Field label="Course content" htmlFor="content" hint="One topic per line.">
              <Textarea id="content" rows={6} value={form.course_content} onChange={set("course_content")} />
            </Field>
            <Field label="Requirements" htmlFor="requirements" hint="What applicants need before starting.">
              <Textarea id="requirements" rows={3} value={form.requirements} onChange={set("requirements")} />
            </Field>
            <label className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Active (can be added to intakes and shown publicly)
            </label>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate("/training-center/admin/programs")}>Cancel</Button>
          <Button type="submit" size="lg" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create program"}
          </Button>
        </div>
      </form>

      {editing && existing.data && (
        <Section title="Offered in intakes">
          {existing.data.offerings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not in any intake yet. Open an intake and use “Add program”.</p>
          ) : (
            <ul className="divide-y">
              {existing.data.offerings.map((o) => (
                <li key={o.intake_program_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_1.2fr] sm:items-center sm:gap-4">
                  <div>
                    <Link to={`/training-center/admin/intakes/${o.intake_id}`} className="font-medium hover:text-primary">{o.intake_name}</Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge status={o.status} /> Starts {formatDate(o.training_starts_on)}
                    </div>
                  </div>
                  <SeatsMeter enrolled={o.enrolled} capacity={o.capacity} compact />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

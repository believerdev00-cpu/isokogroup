import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Field, Loading, PageHeader, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Intake } from "@/training/lib/types";

type Form = {
  name: string;
  description: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  training_ends_on: string;
  location: string;
};

const EMPTY: Form = { name: "", description: "", application_opens_on: "", application_closes_on: "", training_starts_on: "", training_ends_on: "", location: "Isoko Training Center, Kigali" };

function dateErrors(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.application_opens_on && f.application_closes_on && f.application_closes_on < f.application_opens_on) e.application_closes_on = "The deadline must be on or after the opening date";
  if (f.training_starts_on && f.application_opens_on && f.training_starts_on < f.application_opens_on) e.training_starts_on = "Training can't start before applications open";
  if (f.training_starts_on && f.training_ends_on && f.training_ends_on < f.training_starts_on) e.training_ends_on = "Training must end after it starts";
  return e;
}

export default function IntakeForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const existing = useApi<Intake>(editing ? `/admin/intakes/${id}` : null);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    if (existing.data) {
      const i = existing.data;
      setForm({
        name: i.name,
        description: i.description,
        application_opens_on: i.application_opens_on,
        application_closes_on: i.application_closes_on,
        training_starts_on: i.training_starts_on,
        training_ends_on: i.training_ends_on,
        location: i.location,
      });
    }
  }, [existing.data]);

  const save = useApiMutation((f: Form) => (editing ? api.patch<Intake>(`/admin/intakes/${id}`, f) : api.post<Intake>("/admin/intakes", f)), {
    invalidate: ["/admin/intakes", "/admin/dashboard"],
    success: editing ? "Intake saved" : "Intake created. Now add the programs it offers.",
    onSuccess: (i) => navigate(`/training-center/admin/intakes/${i.id}`),
  });

  if (editing && existing.isLoading) return <Loading />;
  const errors = dateErrors(form);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const complete = form.name.trim().length >= 3 && form.application_opens_on && form.application_closes_on && form.training_starts_on && form.training_ends_on;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length === 0 && complete) save.mutate(form);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editing ? `Edit ${existing.data?.name ?? "intake"}` : "Create intake"}
        subtitle={editing ? undefined : "New intakes start as drafts. Nobody sees them until you publish."}
        back={editing ? { to: `/training-center/admin/intakes/${id}`, label: "Back to intake" } : { to: "/training-center/admin/intakes", label: "Intakes" }}
      />
      <form onSubmit={submit} className="space-y-6">
        <Section title="About the intake">
          <div className="space-y-4">
            <Field label="Name" htmlFor="name" required hint="For example: January 2027 Intake">
              <Input id="name" value={form.name} onChange={set("name")} required />
            </Field>
            <Field label="Description" htmlFor="description" hint="Shown to applicants on the Available Intakes page.">
              <Textarea id="description" rows={3} value={form.description} onChange={set("description")} />
            </Field>
            <Field label="Location" htmlFor="location">
              <Input id="location" value={form.location} onChange={set("location")} />
            </Field>
          </div>
        </Section>
        <Section title="Dates" description="Applications are accepted automatically between the opening date and the deadline.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Applications open" htmlFor="opens" required error={errors.application_opens_on}>
              <Input id="opens" type="date" value={form.application_opens_on} onChange={set("application_opens_on")} required />
            </Field>
            <Field label="Application deadline" htmlFor="closes" required error={errors.application_closes_on}>
              <Input id="closes" type="date" value={form.application_closes_on} onChange={set("application_closes_on")} required />
            </Field>
            <Field label="Training starts" htmlFor="starts" required error={errors.training_starts_on}>
              <Input id="starts" type="date" value={form.training_starts_on} onChange={set("training_starts_on")} required />
            </Field>
            <Field label="Training ends" htmlFor="ends" required error={errors.training_ends_on}>
              <Input id="ends" type="date" value={form.training_ends_on} onChange={set("training_ends_on")} required />
            </Field>
          </div>
        </Section>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" size="lg" disabled={save.isPending || !complete || Object.keys(errors).length > 0}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create intake"}
          </Button>
        </div>
      </form>
    </div>
  );
}

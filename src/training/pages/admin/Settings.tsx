import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, PageHeader, QueryView, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/training/lib/api";
import { useApiMutation } from "@/training/lib/query";
import { useSettings, type Settings as SettingsData } from "@/training/features/admin-ops/lookups";

type Key = keyof SettingsData;

function useSave<K extends Key>(key: K, label: string) {
  return useApiMutation((value: SettingsData[K]) => api.put(`/admin/settings/${key}`, value), {
    invalidate: ["/admin/settings", "/public/center", "/admin/certificates", "/admin/reports", "/admin/students"],
    success: `${label} saved`,
  });
}

function SaveBar({ onSave, pending, dirty }: { onSave: () => void; pending: boolean; dirty: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-3 border-t pt-4">
      <Button onClick={onSave} disabled={pending || !dirty}>Save changes</Button>
      {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
    </div>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <Label htmlFor={id} className="leading-snug">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Keeps a local copy of one settings section so staff can edit, then save. */
function useDraft<T>(value: T): [T, (v: T) => void, boolean] {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return [draft, setDraft, JSON.stringify(draft) !== JSON.stringify(value)];
}

function CenterSection({ value }: { value: SettingsData["center"] }) {
  const [d, setD, dirty] = useDraft(value);
  const save = useSave("center", "Center details");
  const f = (k: keyof typeof d, label: string, hint?: string, type = "text"): ReactNode => (
    <Field label={label} htmlFor={`c-${k}`} hint={hint}>
      <Input id={`c-${k}`} type={type} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </Field>
  );
  return (
    <Section title="Center details" description="Shown on the public website, receipts and certificates.">
      <div className="grid gap-4 sm:grid-cols-2">
        {f("name", "Center name")}
        {f("tagline", "Tagline", "Printed under the name on certificates")}
        {f("email", "Email", undefined, "email")}
        {f("phone", "Phone", undefined, "tel")}
        <div className="sm:col-span-2">{f("address", "Address")}</div>
        {f("currency", "Currency", "3-letter code, e.g. RWF or USD")}
        {f("timezone", "Time zone", "Decides what 'today' means for attendance, e.g. Africa/Kigali")}
      </div>
      <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate({ ...d, currency: d.currency.toUpperCase() })} />
    </Section>
  );
}

function GradingSection({ value }: { value: SettingsData["grading"] }) {
  const [d, setD, dirty] = useDraft(value);
  const save = useSave("grading", "Grading");
  const sorted = [...d.scale].sort((a, b) => b.min - a.min);
  const hasZero = d.scale.some((g) => Number(g.min) === 0);
  const setRow = (i: number, patch: Partial<{ grade: string; min: number }>) =>
    setD({ ...d, scale: d.scale.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return (
    <Section title="Grading" description="How percentages become grades, and the mark needed to pass.">
      <div className="max-w-md space-y-4">
        <Field label="Pass mark (%)" htmlFor="g-pass" hint="A student passes when their final mark is at least this.">
          <Input id="g-pass" type="number" min={0} max={100} value={d.pass_mark} onChange={(e) => setD({ ...d, pass_mark: Number(e.target.value) })} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">Grade scale</p>
          <ul className="space-y-2">
            {d.scale.map((g, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input aria-label="Grade" className="w-20" value={g.grade} maxLength={3} onChange={(e) => setRow(i, { grade: e.target.value })} />
                <span className="text-sm text-muted-foreground">from</span>
                <Input aria-label={`Minimum % for grade ${g.grade}`} type="number" min={0} max={100} className="w-24" value={g.min} onChange={(e) => setRow(i, { min: Number(e.target.value) })} />
                <span className="text-sm text-muted-foreground">%</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove grade ${g.grade}`}
                  disabled={d.scale.length <= 2}
                  onClick={() => setD({ ...d, scale: d.scale.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setD({ ...d, scale: [...d.scale, { grade: "", min: 0 }] })}>
            <Plus className="h-4 w-4" /> Add grade
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Reads as: {sorted.map((g) => `${g.grade || "?"} ≥ ${g.min}%`).join(", ")}
          </p>
          {!hasZero && <p className="mt-1 text-xs font-medium text-destructive">The lowest grade must start at 0%.</p>}
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        onSave={() => hasZero && d.scale.every((g) => g.grade.trim()) && save.mutate({ ...d, scale: sorted })}
      />
    </Section>
  );
}

function CertificateSection({ value }: { value: SettingsData["certificate_requirements"] }) {
  const [d, setD, dirty] = useDraft(value);
  const save = useSave("certificate_requirements", "Certificate requirements");
  return (
    <Section title="Certificate requirements" description="What a student must achieve before a certificate can be issued.">
      <div className="max-w-xl divide-y">
        <ToggleRow id="r-completed" label="Program completed" hint="The enrollment is marked completed on the student's profile." checked={d.require_completed} onChange={(v) => setD({ ...d, require_completed: v })} />
        <div className="flex items-start justify-between gap-4 py-3">
          <Label htmlFor="r-att" className="leading-snug">
            Minimum attendance
            <span className="block text-xs font-normal text-muted-foreground">Set 0 to not require attendance.</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input id="r-att" type="number" min={0} max={100} className="w-24" value={d.min_attendance} onChange={(e) => setD({ ...d, min_attendance: Number(e.target.value) })} />
            <span className="text-sm">%</span>
          </div>
        </div>
        <ToggleRow id="r-all" label="All assessments marked" hint="Every assignment, test, exam and project of the class has a mark." checked={d.require_all_assessments} onChange={(v) => setD({ ...d, require_all_assessments: v })} />
        <ToggleRow id="r-pass" label="Passed" hint="The final mark reaches the pass mark set under Grading." checked={d.require_pass} onChange={(v) => setD({ ...d, require_pass: v })} />
        <ToggleRow id="r-fees" label="Fees cleared" hint="Nothing left to pay." checked={d.require_fees_cleared} onChange={(v) => setD({ ...d, require_fees_cleared: v })} />
      </div>
      <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(d)} />
    </Section>
  );
}

function ApplicationSection({ value }: { value: SettingsData["applications"] }) {
  const [d, setD, dirty] = useDraft(value);
  const save = useSave("applications", "Application settings");
  return (
    <Section title="Applications" description="What applicants must provide on the online form.">
      <div className="max-w-xl">
        <ToggleRow
          id="a-doc"
          label="Require an identification document"
          hint="Applicants must attach an ID or passport scan (PDF or photo) before they can submit."
          checked={d.require_document}
          onChange={(v) => setD({ ...d, require_document: v })}
        />
      </div>
      <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(d)} />
    </Section>
  );
}

export default function Settings() {
  const q = useSettings();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Changes apply straight away across the website and all portals." />
      <QueryView query={q}>
        {(s) => (
          <div className="space-y-6">
            <CenterSection value={s.center} />
            <GradingSection value={s.grading} />
            <CertificateSection value={s.certificate_requirements} />
            <ApplicationSection value={s.applications} />
          </div>
        )}
      </QueryView>
    </div>
  );
}

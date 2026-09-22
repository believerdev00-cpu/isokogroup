import { useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, Field, NativeSelect, Pill, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDate, humanize } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { AssessmentType } from "@/training/lib/types";
import { cn } from "@/lib/utils";
import { ASSESSMENT_TYPES, gradeFor, type Assessment, type AssessmentMarks, type ClassDetail } from "./types";

const TYPE_TONE: Record<AssessmentType, "info" | "primary" | "gold" | "warning"> = {
  assignment: "info",
  test: "primary",
  exam: "warning",
  project: "gold",
};

export function TypeBadge({ type }: { type: AssessmentType }) {
  return <Pill tone={TYPE_TONE[type]}>{humanize(type)}</Pill>;
}

export default function AssessmentsTab({ klass }: { klass: ClassDetail }) {
  const [editing, setEditing] = useState<Assessment | "new" | null>(null);
  const [deleting, setDeleting] = useState<Assessment | null>(null);
  const [marking, setMarking] = useState<Assessment | null>(null);
  const totalWeight = klass.assessments.reduce((s, a) => s + Number(a.weight), 0);

  const remove = useApiMutation(() => api.delete(`/classes/assessments/${deleting!.id}`), {
    invalidate: [`/classes/${klass.id}`],
    success: "Assessment deleted",
    onSuccess: () => setDeleting(null),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {klass.assessments.length} assessments · weights add up to <strong className="tabular text-foreground">{totalWeight}%</strong>
          {klass.assessments.length > 0 && totalWeight !== 100 && " (final marks are scaled to the total weight)"}
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> Create assessment
        </Button>
      </div>

      {klass.assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No assessments yet"
          description="Create assignments, tests, exams or projects, then enter the marks for each student."
          action={<Button onClick={() => setEditing("new")}>Create assessment</Button>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {klass.assessments.map((a) => {
            const marked = a.marked_count ?? 0;
            const all = klass.students.length;
            return (
              <li key={a.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <TypeBadge type={a.type} />
                    <p className="mt-2 font-semibold">{a.title}</p>
                    {a.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Date</dt><dd className="font-medium">{formatDate(a.due_date)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Max marks</dt><dd className="tabular font-medium">{Number(a.max_marks)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Weight</dt><dd className="tabular font-medium">{Number(a.weight)}%</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                  <span className={cn("text-sm", marked === all && all > 0 ? "font-medium text-success" : "text-muted-foreground")}>
                    {marked} of {all} marked
                  </span>
                  <Button size="sm" variant={marked === all && all > 0 ? "outline" : "default"} onClick={() => setMarking(a)} disabled={all === 0}>
                    Enter marks
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <AssessmentDialog classId={klass.id} assessment={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.title}"?`}
        description="Assessments that already have marks can't be deleted."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />

      <Sheet open={!!marking} onOpenChange={(o) => !o && setMarking(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {marking && <MarksEntry classId={klass.id} assessmentId={marking.id} onDone={() => setMarking(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AssessmentDialog({ classId, assessment, onClose }: { classId: string; assessment: Assessment | null; onClose: () => void }) {
  const [form, setForm] = useState({
    type: assessment?.type ?? ("assignment" as AssessmentType),
    title: assessment?.title ?? "",
    description: assessment?.description ?? "",
    due_date: assessment?.due_date ?? "",
    max_marks: assessment ? String(Number(assessment.max_marks)) : "100",
    weight: assessment ? String(Number(assessment.weight)) : "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const body = { ...form, due_date: form.due_date || null, max_marks: Number(form.max_marks), weight: Number(form.weight) };

  const save = useApiMutation(
    () => (assessment ? api.patch(`/classes/assessments/${assessment.id}`, body) : api.post(`/classes/${classId}/assessments`, body)),
    { invalidate: [`/classes/${classId}`], success: assessment ? "Assessment updated" : "Assessment created", onSuccess: onClose },
  );
  const valid = form.title.trim().length >= 2 && Number(form.max_marks) > 0 && Number(form.weight) > 0 && Number(form.weight) <= 100;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assessment ? "Edit assessment" : "Create assessment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="a-type" required>
              <NativeSelect id="a-type" value={form.type} onChange={set("type")}>
                {ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="a-date" hint="Due date or date written">
              <Input id="a-date" type="date" value={form.due_date} onChange={set("due_date")} />
            </Field>
          </div>
          <Field label="Title" htmlFor="a-title" required>
            <Input id="a-title" value={form.title} maxLength={160} onChange={set("title")} placeholder="e.g. JavaScript basics test" required />
          </Field>
          <Field label="Description" htmlFor="a-desc">
            <Textarea id="a-desc" value={form.description} rows={3} maxLength={4000} onChange={set("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Maximum marks" htmlFor="a-max" required>
              <Input id="a-max" type="number" inputMode="decimal" min={1} step="any" value={form.max_marks} onChange={set("max_marks")} required />
            </Field>
            <Field label="Weight (%)" htmlFor="a-weight" required hint="Share of the final mark">
              <Input id="a-weight" type="number" inputMode="decimal" min={1} max={100} step="any" value={form.weight} onChange={set("weight")} required />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {assessment ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarksEntry({ classId, assessmentId, onDone }: { classId: string; assessmentId: string; onDone: () => void }) {
  const q = useApi<AssessmentMarks>(`/classes/assessments/${assessmentId}/results`);
  return <QueryView query={q}>{(data) => <MarksForm key={assessmentId} classId={classId} data={data} onDone={onDone} />}</QueryView>;
}

function MarksForm({ classId, data, onDone }: { classId: string; data: AssessmentMarks; onDone: () => void }) {
  const { assessment, grading } = data;
  const max = Number(assessment.max_marks);
  const [marks, setMarks] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.students.map((s) => [s.enrollment_id, s.marks === null ? "" : String(Number(s.marks))])),
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(() => Object.fromEntries(data.students.map((s) => [s.enrollment_id, s.feedback ?? ""])));

  const invalid = (v: string) => v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > max);
  const anyInvalid = Object.values(marks).some(invalid);
  const filled = data.students.filter((s) => marks[s.enrollment_id] !== "");

  const save = useApiMutation(
    () =>
      api.put(`/classes/assessments/${assessment.id}/results`, {
        records: filled.map((s) => ({ enrollment_id: s.enrollment_id, marks: Number(marks[s.enrollment_id]), feedback: feedback[s.enrollment_id] ?? "" })),
      }),
    { invalidate: [`/classes/${classId}`, `/classes/assessments/${assessment.id}`, "/admin/students", "/admin/enrollments"], success: "Marks saved", onSuccess: onDone },
  );

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="text-left">
        <SheetTitle>{assessment.title}</SheetTitle>
        <SheetDescription>
          {humanize(assessment.type)} · out of {max} · weight {Number(assessment.weight)}% · pass mark {grading.pass_mark}%
        </SheetDescription>
      </SheetHeader>
      <ul className="mt-4 flex-1 divide-y">
        {data.students.map((s) => {
          const v = marks[s.enrollment_id] ?? "";
          const bad = invalid(v);
          const pct = v !== "" && !bad ? Math.round((Number(v) / max) * 1000) / 10 : null;
          const inputId = `mark-${s.enrollment_id}`;
          return (
            <li key={s.enrollment_id} className="space-y-2 py-3">
              <div className="flex items-center gap-3">
                <label htmlFor={inputId} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.full_name}</span>
                  <span className="text-xs text-muted-foreground">{s.student_number}</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={max}
                    step="any"
                    value={v}
                    aria-invalid={bad}
                    aria-describedby={`${inputId}-info`}
                    className={cn("h-11 w-20 text-right text-base", bad && "border-destructive")}
                    onChange={(e) => setMarks((m) => ({ ...m, [s.enrollment_id]: e.target.value }))}
                  />
                  <span className="text-sm text-muted-foreground">/ {max}</span>
                </div>
                <span id={`${inputId}-info`} className="w-16 text-right text-sm">
                  {bad ? (
                    <span className="text-xs font-medium text-destructive">0–{max}</span>
                  ) : pct === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <span className="tabular block font-semibold">{pct}%</span>
                      <span className={cn("text-xs font-semibold", pct >= grading.pass_mark ? "text-success" : "text-destructive")}>{gradeFor(pct, grading)}</span>
                    </>
                  )}
                </span>
              </div>
              <Input
                aria-label={`Feedback for ${s.full_name}`}
                placeholder="Feedback (optional)"
                maxLength={1000}
                value={feedback[s.enrollment_id] ?? ""}
                onChange={(e) => setFeedback((f) => ({ ...f, [s.enrollment_id]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-6 mt-4 flex items-center justify-between gap-3 border-t bg-background px-6 py-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {anyInvalid ? <span className="font-medium text-destructive">Fix marks above {max}</span> : `${filled.length} of ${data.students.length} entered`}
        </p>
        <Button size="lg" onClick={() => save.mutate()} disabled={anyInvalid || filled.length === 0 || save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save all marks
        </Button>
      </div>
    </div>
  );
}

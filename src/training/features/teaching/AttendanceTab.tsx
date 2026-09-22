import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Loader2, MessageSquarePlus, Save, Users } from "lucide-react";
import { EmptyState, Field, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { formatDays, formatLongDate, formatTime } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { AttendanceMark } from "@/training/lib/types";
import { cn } from "@/lib/utils";
import { AttendanceRate } from "./StudentsTab";
import { localToday, type AttendanceDay, type ClassDetail } from "./types";

const MARKS: { value: AttendanceMark; label: string; short: string; on: string }[] = [
  { value: "present", label: "Present", short: "P", on: "bg-success text-white border-success" },
  { value: "absent", label: "Absent", short: "A", on: "bg-destructive text-white border-destructive" },
  { value: "late", label: "Late", short: "L", on: "bg-warning text-white border-warning" },
  { value: "excused", label: "Excused", short: "E", on: "bg-info text-white border-info" },
];

type Draft = { marks: Record<string, AttendanceMark | undefined>; notes: Record<string, string>; topic: string; lessonNotes: string };

export default function AttendanceTab({ klass }: { klass: ClassDetail }) {
  const today = localToday();
  const [date, setDate] = useState(today);
  const day = useApi<AttendanceDay>(`/classes/${klass.id}/attendance?date=${date}`);
  const meetsThatDay = useMemo(() => {
    const dow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    return klass.meeting_days.includes(dow);
  }, [date, klass.meeting_days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <Field label="Date" htmlFor="att-date" className="sm:w-56">
          <Input id="att-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} />
        </Field>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{formatLongDate(date)}{date === today && " · Today"}</p>
          <p>
            Class meets {formatDays(klass.meeting_days)}, {formatTime(klass.start_time)}–{formatTime(klass.end_time)}
            {!meetsThatDay && <span className="ml-1 font-medium text-warning">(not a usual class day)</span>}
          </p>
        </div>
      </div>
      <QueryView query={day}>{(data) => <AttendanceSheet key={`${data.date}-${data.session?.id ?? "new"}`} klass={klass} data={data} />}</QueryView>
    </div>
  );
}

function AttendanceSheet({ klass, data }: { klass: ClassDetail; data: AttendanceDay }) {
  const initial = (): Draft => ({
    marks: Object.fromEntries(data.students.map((s) => [s.enrollment_id, s.status ?? undefined])),
    notes: Object.fromEntries(data.students.map((s) => [s.enrollment_id, s.note ?? ""])),
    topic: data.session?.topic ?? "",
    lessonNotes: data.session?.notes ?? "",
  });
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Draft>(initial);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // Warn before leaving the page with unsaved marks
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useApiMutation(
    () =>
      api.put<{ saved: number }>(`/classes/${klass.id}/attendance`, {
        date: data.date,
        topic: draft.topic,
        notes: draft.lessonNotes,
        records: data.students
          .filter((s) => draft.marks[s.enrollment_id])
          .map((s) => ({ enrollment_id: s.enrollment_id, status: draft.marks[s.enrollment_id]!, note: draft.notes[s.enrollment_id] || null })),
      }),
    {
      invalidate: [`/classes/${klass.id}`, "/trainer/dashboard", "/admin/students", "/admin/enrollments"],
      success: (r) => `Attendance saved for ${r.saved} students`,
      onSuccess: () => setSaved(draft),
    },
  );

  if (data.students.length === 0) {
    return <EmptyState icon={Users} title="No students to mark" description="This class has no students yet." />;
  }

  const counts = MARKS.map((m) => ({ ...m, n: data.students.filter((s) => draft.marks[s.enrollment_id] === m.value).length }));
  const marked = data.students.filter((s) => draft.marks[s.enrollment_id]).length;
  const unmarked = data.students.length - marked;
  const setMark = (id: string, v: AttendanceMark) => setDraft((d) => ({ ...d, marks: { ...d.marks, [id]: v } }));
  const markAllPresent = () =>
    setDraft((d) => ({ ...d, marks: Object.fromEntries(data.students.map((s) => [s.enrollment_id, d.marks[s.enrollment_id] ?? "present"])) }));

  return (
    <div className="space-y-4 pb-24">
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <Field label="Today's lesson topic" htmlFor="topic" hint="Students see this with their attendance">
          <Input id="topic" value={draft.topic} maxLength={200} placeholder="e.g. JavaScript Functions" onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))} />
        </Field>
        <Field label="Lesson notes" htmlFor="lesson-notes">
          <Textarea id="lesson-notes" rows={1} value={draft.lessonNotes} maxLength={4000} placeholder="What was covered, homework…" onChange={(e) => setDraft((d) => ({ ...d, lessonNotes: e.target.value }))} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {counts.map((c) => (
            <span key={c.value} className="rounded-full border bg-card px-2.5 py-1 font-medium">
              {c.label}: <span className="tabular">{c.n}</span>
            </span>
          ))}
        </div>
        <Button variant="outline" onClick={markAllPresent} disabled={unmarked === 0}>
          <CheckCheck className="mr-2 h-4 w-4" /> Mark all present
        </Button>
      </div>

      <ul className="divide-y rounded-xl border bg-card shadow-sm">
        {data.students.map((s) => {
          const current = draft.marks[s.enrollment_id];
          const labelId = `att-${s.enrollment_id}`;
          return (
            <li key={s.enrollment_id} className="px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p id={labelId} className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.student_number} · <AttendanceRate rate={s.attendance_rate} /> attendance
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div role="radiogroup" aria-labelledby={labelId} className="grid flex-1 grid-cols-4 gap-1.5 sm:flex-none">
                    {MARKS.map((m) => {
                      const on = current === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={m.label}
                          onClick={() => setMark(s.enrollment_id, m.value)}
                          className={cn(
                            "min-h-11 rounded-lg border px-2 text-sm font-semibold transition-colors sm:min-w-[5.5rem]",
                            on ? m.on : "bg-background hover:bg-muted",
                          )}
                        >
                          <span className="sm:hidden">{m.short}</span>
                          <span className="hidden sm:inline">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-11 w-11 shrink-0", draft.notes[s.enrollment_id] && "text-primary")}
                    aria-label={`Note for ${s.full_name}`}
                    aria-expanded={openNote === s.enrollment_id}
                    onClick={() => setOpenNote(openNote === s.enrollment_id ? null : s.enrollment_id)}
                  >
                    <MessageSquarePlus className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              {(openNote === s.enrollment_id || draft.notes[s.enrollment_id]) && (
                <Input
                  className="mt-2"
                  aria-label={`Note for ${s.full_name}`}
                  placeholder="Note (optional), e.g. arrived 20 minutes late"
                  maxLength={300}
                  value={draft.notes[s.enrollment_id]}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: { ...d.notes, [s.enrollment_id]: e.target.value } }))}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* Sticky save bar: always reachable with a thumb on a phone */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">
            {save.isPending ? (
              "Saving…"
            ) : dirty ? (
              <span className="font-medium text-warning">
                Unsaved changes{unmarked > 0 ? ` · ${unmarked} not marked` : ""}
              </span>
            ) : marked === data.students.length ? (
              <span className="font-medium text-success">✓ Saved · all {marked} students marked</span>
            ) : (
              <span className="text-muted-foreground">{marked} of {data.students.length} marked</span>
            )}
          </p>
          <Button size="lg" onClick={() => save.mutate()} disabled={!dirty || marked === 0 || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save attendance
          </Button>
        </div>
      </div>
    </div>
  );
}

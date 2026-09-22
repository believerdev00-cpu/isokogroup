import { useState } from "react";
import { Pencil, UserMinus, UserPlus } from "lucide-react";
import { useParams } from "react-router-dom";
import { ConfirmDialog, Facts, NativeSelect, PageHeader, QueryView, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/training/lib/api";
import { formatDays, formatTime } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import { useTrainers } from "@/training/features/admin-ops/lookups";
import ScheduleFields, { scheduleValid, type Schedule } from "@/training/features/admin-ops/ScheduleFields";
import ClassWorkspace from "@/training/features/teaching/ClassWorkspace";

type ClassInfo = {
  id: string;
  code: string;
  room: string;
  meeting_days: number[];
  start_time: string;
  end_time: string;
  status: "active" | "completed" | "cancelled";
  trainer_id: string | null;
  trainer_name: string | null;
  program_name: string;
  intake_name: string;
  students: { enrollment_id: string; full_name: string; student_number: string }[];
};

const KEYS = ["/admin/classes", "/classes/", "/admin/students", "/admin/dashboard"];

export default function ClassDetail() {
  const { id = "" } = useParams();
  const q = useApi<ClassInfo>(`/classes/${id}`);
  const trainers = useTrainers();
  const [editing, setEditing] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [statusChange, setStatusChange] = useState<"active" | "completed" | "cancelled" | null>(null);
  const candidates = useApi<{ enrollment_id: string; student_number: string; full_name: string }[]>(adding ? `/admin/classes/${id}/candidates` : null);

  const patch = useApiMutation((body: Record<string, unknown>) => api.patch(`/admin/classes/${id}`, body), {
    invalidate: KEYS,
    success: "Class updated",
    onSuccess: () => {
      setEditing(false);
      setStatusChange(null);
    },
  });
  const addStudents = useApiMutation(() => api.post(`/admin/classes/${id}/students`, { enrollment_ids: picked }), {
    invalidate: KEYS,
    success: `Students added to the class`,
    onSuccess: () => {
      setAdding(false);
      setPicked([]);
    },
  });
  const removeStudent = useApiMutation((enrollmentId: string) => api.delete(`/admin/classes/${id}/students/${enrollmentId}`), {
    invalidate: KEYS,
    success: "Student removed from the class",
    onSuccess: () => setRemoving(null),
  });

  return (
    <QueryView query={q}>
      {(c) => (
        <div>
          <PageHeader
            back={{ to: "/training-center/admin/classes", label: "Classes" }}
            title={
              <span className="flex flex-wrap items-center gap-3">
                {c.code} <StatusBadge status={c.status} />
              </span>
            }
            subtitle={`${c.program_name} · ${c.intake_name}`}
            actions={
              <>
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <UserPlus className="h-4 w-4" /> Add students
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSchedule({ meeting_days: c.meeting_days, start_time: c.start_time.slice(0, 5), end_time: c.end_time.slice(0, 5), room: c.room });
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Edit timetable
                </Button>
                {c.status === "active" ? (
                  <>
                    <Button variant="outline" onClick={() => setStatusChange("completed")}>Mark completed</Button>
                    <Button variant="ghost" className="text-destructive" onClick={() => setStatusChange("cancelled")}>Cancel class</Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setStatusChange("active")}>Reactivate</Button>
                )}
              </>
            }
          />

          <div className="mb-6 grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5 lg:grid-cols-[1fr_auto]">
            <Facts
              columns={3}
              items={[
                ["Schedule", `${formatDays(c.meeting_days)}, ${formatTime(c.start_time.slice(0, 5))}–${formatTime(c.end_time.slice(0, 5))}`],
                ["Room", c.room || "—"],
                ["Students", c.students.length],
              ]}
            />
            <div className="min-w-60">
              <label htmlFor="class-trainer" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trainer
              </label>
              <NativeSelect
                id="class-trainer"
                className="mt-1"
                value={c.trainer_id ?? ""}
                disabled={patch.isPending}
                onChange={(e) => patch.mutate({ trainer_id: e.target.value || null })}
              >
                <option value="">No trainer assigned</option>
                {trainers.data
                  ?.filter((t) => t.is_active || t.id === c.trainer_id)
                  .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </NativeSelect>
              {!c.trainer_id && <p className="mt-1 text-xs font-medium text-warning">Assign a trainer so attendance can be taken.</p>}
            </div>
          </div>

          {c.students.length > 0 && (
            <details className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold">Remove a student from this class</summary>
              <ul className="mt-3 divide-y text-sm">
                {c.students.map((s) => (
                  <li key={s.enrollment_id} className="flex items-center justify-between gap-2 py-2">
                    <span>{s.full_name} <span className="text-muted-foreground">· {s.student_number}</span></span>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving({ id: s.enrollment_id, name: s.full_name })}>
                      <UserMinus className="h-4 w-4" /> Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <ClassWorkspace classId={c.id} initialTab="students" />

          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit timetable</DialogTitle>
              </DialogHeader>
              {schedule && <ScheduleFields value={schedule} onChange={setSchedule} />}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button disabled={!schedule || !scheduleValid(schedule) || patch.isPending} onClick={() => schedule && patch.mutate({ ...schedule })}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={adding}
            onOpenChange={(o) => {
              setAdding(o);
              if (!o) setPicked([]);
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add students to {c.code}</DialogTitle>
                <DialogDescription>Approved students of {c.program_name} ({c.intake_name}) who are not in a class yet.</DialogDescription>
              </DialogHeader>
              {candidates.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (candidates.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Every approved student of this program already has a class.</p>
              ) : (
                <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                  {candidates.data!.map((s) => (
                    <li key={s.enrollment_id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted">
                        <Checkbox
                          checked={picked.includes(s.enrollment_id)}
                          onCheckedChange={(v) =>
                            setPicked((p) => (v === true ? [...p, s.enrollment_id] : p.filter((x) => x !== s.enrollment_id)))
                          }
                        />
                        <span className="text-sm">{s.full_name} <span className="text-muted-foreground">· {s.student_number}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button disabled={picked.length === 0 || addStudents.isPending} onClick={() => addStudents.mutate()}>
                  Add {picked.length || ""} {picked.length === 1 ? "student" : "students"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={removing !== null}
            onOpenChange={(o) => !o && setRemoving(null)}
            title={`Remove ${removing?.name ?? ""} from ${c.code}?`}
            description="They stay enrolled in the program; their attendance and marks are kept. You can add them to another class."
            confirmLabel="Remove from class"
            destructive
            pending={removeStudent.isPending}
            onConfirm={() => removing && removeStudent.mutate(removing.id)}
          />
          <ConfirmDialog
            open={statusChange !== null}
            onOpenChange={(o) => !o && setStatusChange(null)}
            title={statusChange === "completed" ? "Mark this class completed?" : statusChange === "cancelled" ? "Cancel this class?" : "Reactivate this class?"}
            description={
              statusChange === "active"
                ? "The class will appear on the trainer's timetable again."
                : "It will no longer appear on timetables. Records are kept."
            }
            confirmLabel={statusChange === "completed" ? "Mark completed" : statusChange === "cancelled" ? "Cancel class" : "Reactivate"}
            destructive={statusChange === "cancelled"}
            pending={patch.isPending}
            onConfirm={() => statusChange && patch.mutate({ status: statusChange })}
          />
        </div>
      )}
    </QueryView>
  );
}

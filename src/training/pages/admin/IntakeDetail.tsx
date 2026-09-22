import { useState } from "react";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog, EmptyState, Facts, Field, NativeSelect, PageHeader, QueryView, SeatsMeter, Section, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/training/lib/api";
import { formatDate, formatMoney } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Intake, IntakeProgram, IntakeStatus, Program } from "@/training/lib/types";

type Detail = Intake & { programs: IntakeProgram[] };

type ActionKey = "publish" | "open" | "reopen" | "close" | "automatic" | "complete" | "archive";

// Mirrors the server's allowed transitions; explained in plain words for staff.
const ACTIONS: { key: ActionKey; label: string; from: IntakeStatus[]; manualOnly?: boolean; primary?: boolean; destructive?: boolean; title: string; description: string }[] = [
  { key: "publish", label: "Publish intake", from: ["draft"], primary: true, title: "Publish this intake?",
    description: "From now on it follows its dates automatically: it opens to applicants on the opening date, shows as Full when every program is full, and closes after the deadline." },
  { key: "open", label: "Open applications now", from: ["draft", "upcoming"], title: "Open applications now?",
    description: "Applicants can apply straight away, even if the opening date hasn't come yet. The intake stays open until you close it." },
  { key: "reopen", label: "Reopen applications", from: ["closed", "full", "completed"], title: "Reopen applications?",
    description: "Applicants can apply again, even after the deadline. Programs still need free seats. It stays open until you close it." },
  { key: "close", label: "Close applications", from: ["upcoming", "open", "full"], title: "Close applications?",
    description: "No new applications will be accepted, even before the deadline. Pending applications can still be reviewed." },
  { key: "automatic", label: "Use automatic status", from: ["upcoming", "open", "full", "closed"], manualOnly: true, title: "Go back to automatic status?",
    description: "The intake will follow its dates and seats again: open between the opening date and the deadline, full when no seats are left." },
  { key: "complete", label: "Mark completed", from: ["open", "full", "closed", "upcoming"], title: "Mark this intake completed?",
    description: "Use this when training has finished. No new applications are accepted. All student records are kept." },
  { key: "archive", label: "Archive", from: ["draft", "closed", "completed"], destructive: true, title: "Archive this intake?",
    description: "It disappears from everyday lists but all its history, students and certificates are kept." },
];

const STATUS_EXPLAIN: Record<IntakeStatus, string> = {
  draft: "Not published. Applicants can't see it yet.",
  upcoming: "Published. Applications open on the opening date.",
  open: "Accepting applications.",
  full: "Every program is full. No new applications.",
  closed: "Not accepting applications.",
  completed: "Training has finished.",
  archived: "Kept for records only.",
};

function OfferingDialog({ intakeId, offering, existingProgramIds, open, onOpenChange }: { intakeId: string; offering: IntakeProgram | null; existingProgramIds: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const programs = useApi<Program[]>(offering ? null : "/admin/programs");
  const available = (programs.data ?? []).filter((p) => p.is_active && !existingProgramIds.includes(p.id));
  const [programId, setProgramId] = useState("");
  const [capacity, setCapacity] = useState(String(offering?.capacity ?? ""));
  const [tuition, setTuition] = useState(offering?.tuition_fee != null ? String(offering.tuition_fee) : "");
  const [registration, setRegistration] = useState(offering?.registration_fee != null ? String(offering.registration_fee) : "");
  const [schedule, setSchedule] = useState(offering?.schedule ?? "");

  const chosen = offering ? null : available.find((p) => p.id === programId);
  const save = useApiMutation(
    () => {
      const body = {
        capacity: Number(capacity),
        tuition_fee: tuition === "" ? null : Number(tuition),
        registration_fee: registration === "" ? null : Number(registration),
        schedule,
      };
      return offering
        ? api.patch(`/admin/intake-programs/${offering.id}`, body)
        : api.post(`/admin/intakes/${intakeId}/programs`, { ...body, program_id: programId });
    },
    { invalidate: ["/admin/intakes", "/admin/dashboard"], success: offering ? "Program updated" : "Program added to the intake", onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{offering ? `Edit ${offering.program_name}` : "Add a program to this intake"}</DialogTitle>
          <DialogDescription>Leave fees empty to use the program's normal fees.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!offering && (
            <Field label="Program" htmlFor="program" required>
              <NativeSelect
                id="program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  const p = available.find((x) => x.id === e.target.value);
                  if (p && !capacity) setCapacity(String(p.max_students));
                }}
              >
                <option value="">Choose a program…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </NativeSelect>
              {programs.data && available.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every active program is already in this intake. <Link to="/training-center/admin/programs/new" className="font-semibold text-primary">Create a program</Link>
                </p>
              )}
            </Field>
          )}
          <Field label="Seats (capacity)" htmlFor="capacity" required hint={offering ? `${offering.enrolled} already enrolled` : undefined}>
            <Input id="capacity" type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tuition fee" htmlFor="tuition" hint={`Default: ${formatMoney(offering?.program_tuition_fee ?? chosen?.tuition_fee ?? null)}`}>
              <Input id="tuition" type="number" min={0} inputMode="numeric" value={tuition} onChange={(e) => setTuition(e.target.value)} />
            </Field>
            <Field label="Registration fee" htmlFor="registration" hint={`Default: ${formatMoney(offering?.program_registration_fee ?? chosen?.registration_fee ?? null)}`}>
              <Input id="registration" type="number" min={0} inputMode="numeric" value={registration} onChange={(e) => setRegistration(e.target.value)} />
            </Field>
          </div>
          <Field label="Schedule" htmlFor="schedule" hint="Shown to applicants, e.g. Mon–Fri, 8:00–10:00">
            <Input id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !(Number(capacity) > 0) || (!offering && !programId)}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {offering ? "Save" : "Add program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferingCard({ o, onEdit }: { o: IntakeProgram; onEdit: () => void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const toggle = useApiMutation((accepting: boolean) => api.patch(`/admin/intake-programs/${o.id}`, { accepting_applications: accepting }), {
    invalidate: ["/admin/intakes", "/admin/dashboard"],
    success: (_d) => "Saved",
  });
  const remove = useApiMutation(() => api.delete(`/admin/intake-programs/${o.id}`), {
    invalidate: ["/admin/intakes", "/admin/dashboard"],
    success: "Program removed from the intake",
    onSuccess: () => setConfirmRemove(false),
  });
  const tuition = o.tuition_fee ?? o.program_tuition_fee;
  const registration = o.registration_fee ?? o.program_registration_fee;
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{o.program_name}</p>
          <p className="text-xs text-muted-foreground">
            Tuition {formatMoney(tuition)}{o.tuition_fee != null && " (this intake)"} · Registration {formatMoney(registration)}
            {o.schedule && ` · ${o.schedule}`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${o.program_name}`}><Pencil className="h-4 w-4" /></Button>
          {o.enrolled === 0 && o.pending_applications === 0 && (
            <Button variant="ghost" size="icon" onClick={() => setConfirmRemove(true)} aria-label={`Remove ${o.program_name}`}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
      <div className="mt-3"><SeatsMeter enrolled={o.enrolled} capacity={o.capacity} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link to={`/training-center/admin/applications?intake_program_id=${o.id}`} className="font-medium text-primary hover:underline">
          {o.pending_applications} pending{o.waitlisted > 0 && ` · ${o.waitlisted} waitlisted`}
        </Link>
        {o.class_count > 0 ? (
          <Link to={`/training-center/admin/classes?intake_program_id=${o.id}`} className="text-muted-foreground hover:text-primary">{o.class_count} class{o.class_count === 1 ? "" : "es"}</Link>
        ) : (
          <Link to={`/training-center/admin/classes/new?intake_program_id=${o.id}`} className="font-medium text-warning hover:underline">No class yet — create one</Link>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch checked={o.accepting_applications} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} aria-label="Accepting applications" />
          Accepting applications
        </label>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${o.program_name}?`}
        description="It will no longer be offered in this intake. This is only possible while it has no applications or classes."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </li>
  );
}

export default function IntakeDetail() {
  const { id } = useParams();
  const q = useApi<Detail>(`/admin/intakes/${id}`);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [editing, setEditing] = useState<IntakeProgram | null>(null);
  const [adding, setAdding] = useState(false);
  const run = useApiMutation((key: ActionKey) => api.post(`/admin/intakes/${id}/${key}`), {
    invalidate: ["/admin/intakes", "/admin/dashboard"],
    success: "Intake status updated",
    onSuccess: () => setAction(null),
  });

  return (
    <QueryView query={q}>
      {(i) => {
        const actions = ACTIONS.filter((a) => a.from.includes(i.status) && (!a.manualOnly || i.status_mode === "manual"));
        return (
          <div className="space-y-6">
            <PageHeader
              back={{ to: "/training-center/admin/intakes", label: "Intakes" }}
              title={
                <span className="flex flex-wrap items-center gap-3">
                  {i.name} <StatusBadge status={i.status} />
                </span>
              }
              subtitle={`${STATUS_EXPLAIN[i.status]}${i.status_mode === "manual" && !["draft", "completed", "archived"].includes(i.status) ? " Set manually." : ""}`}
              actions={
                <>
                  <Button asChild variant="outline"><Link to={`/training-center/admin/intakes/${i.id}/edit`}><Pencil className="mr-1.5 h-4 w-4" />Edit</Link></Button>
                  <Button asChild variant="outline"><Link to={`/training-center/admin/applications?intake_id=${i.id}`}>Applications ({i.pending_applications} pending)</Link></Button>
                </>
              }
            />

            <Section title="Status" description="Applicants see this intake only while it is Open and has free seats.">
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <Button key={a.key} variant={a.primary ? "default" : a.destructive ? "outline" : "outline"} className={a.destructive ? "text-destructive hover:text-destructive" : undefined} onClick={() => setAction(a)}>
                    {a.label}
                  </Button>
                ))}
                {actions.length === 0 && <p className="text-sm text-muted-foreground">No status changes are available.</p>}
              </div>
              {i.status_mode === "auto" && !["draft", "completed", "archived"].includes(i.status) && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Automatic: opens on {formatDate(i.application_opens_on)}, closes after {formatDate(i.application_closes_on)}, and shows Full when no seats are left.
                </p>
              )}
            </Section>

            <Section title="Details">
              <Facts
                columns={3}
                items={[
                  ["Applications open", formatDate(i.application_opens_on)],
                  ["Application deadline", formatDate(i.application_closes_on)],
                  ["Location", i.location || "—"],
                  ["Training starts", formatDate(i.training_starts_on)],
                  ["Training ends", formatDate(i.training_ends_on)],
                  ["Seats", `${i.enrolled} / ${i.capacity} enrolled`],
                ]}
              />
              {i.description && <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{i.description}</p>}
            </Section>

            <Section
              title={`Programs offered (${i.programs.length})`}
              actions={!["completed", "archived"].includes(i.status) && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-4 w-4" />Add program</Button>}
            >
              {i.programs.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No programs in this intake yet."
                  description="Add the programs this intake offers and how many seats each has. You need at least one before publishing."
                  action={<Button onClick={() => setAdding(true)}>Add program</Button>}
                />
              ) : (
                <ul className="grid gap-4 lg:grid-cols-2">
                  {i.programs.map((o) => <OfferingCard key={o.id} o={o} onEdit={() => setEditing(o)} />)}
                </ul>
              )}
            </Section>

            {action && (
              <ConfirmDialog
                open
                onOpenChange={(o) => !o && setAction(null)}
                title={action.title}
                description={action.description}
                confirmLabel={action.label}
                destructive={action.destructive}
                pending={run.isPending}
                onConfirm={() => run.mutate(action.key)}
              />
            )}
            {(adding || editing) && (
              <OfferingDialog
                key={editing?.id ?? "new"}
                intakeId={i.id}
                offering={editing}
                existingProgramIds={i.programs.map((p) => p.program_id)}
                open
                onOpenChange={(o) => {
                  if (!o) {
                    setAdding(false);
                    setEditing(null);
                  }
                }}
              />
            )}
          </div>
        );
      }}
    </QueryView>
  );
}

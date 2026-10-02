import { useState } from "react";
import { BookOpen, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { createQuickProgram, emptyProgram, programDraftReady, programNameFromIntake, QuickProgramFields, type QuickProgramDraft } from "@/training/features/admin-core/QuickProgram";
import { cn } from "@/lib/utils";

type Detail = Intake & { programs: IntakeProgram[] };

type ActionKey = "publish" | "unpublish" | "open" | "reopen" | "close" | "automatic" | "complete" | "archive";

// Mirrors the server's allowed transitions; explained in plain words for staff.
const ACTIONS: { key: ActionKey; label: string; from: IntakeStatus[]; manualOnly?: boolean; primary?: boolean; destructive?: boolean; title: string; description: string }[] = [
  { key: "publish", label: "Publish intake", from: ["draft"], primary: true, title: "Publish this intake?",
    description: "From now on it follows its dates automatically: it opens to applicants on the opening date, shows as Full when every program is full, and closes after the deadline." },
  { key: "unpublish", label: "Unpublish", from: ["upcoming", "open", "full", "closed"], title: "Take this intake off the website?",
    description: "It goes back to a draft: applicants stop seeing it and it leaves the homepage intake band. Applications already received are kept, and you can publish it again." },
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

// The intake's dates in one step: extend or shorten the application period, or
// move the training. An automatic intake opens or closes to match at once.
function DatesDialog({ intake, open, onOpenChange }: { intake: Detail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [opens, setOpens] = useState(intake.application_opens_on);
  const [closes, setCloses] = useState(intake.application_closes_on);
  const [starts, setStarts] = useState(intake.training_starts_on);
  const [ends, setEnds] = useState(intake.training_ends_on);
  const error =
    closes < opens ? "The deadline must be on or after the opening date"
      : starts < opens ? "Training can't start before applications open"
        : ends < starts ? "Training must end after it starts" : null;
  const save = useApiMutation(
    () => api.patch(`/admin/intakes/${intake.id}`, {
      application_opens_on: opens, application_closes_on: closes, training_starts_on: starts, training_ends_on: ends,
    }),
    { invalidate: ["/admin/intakes", "/admin/dashboard"], success: "Dates saved", onSuccess: () => onOpenChange(false) },
  );
  const manual = intake.status_mode === "manual" && !["draft", "completed", "archived"].includes(intake.status);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change dates</DialogTitle>
          <DialogDescription>
            Applicants can apply from the opening date until the end of the deadline day.
            {manual ? " This intake's status is set by hand, so it stays as it is; press \"Use automatic status\" under Status to let the dates decide." : " The intake opens or closes to match straight away."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applications open" htmlFor="d-opens" required>
            <Input id="d-opens" type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
          </Field>
          <Field label="Application deadline" htmlFor="d-closes" required>
            <Input id="d-closes" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </Field>
          <Field label="Training starts" htmlFor="d-starts" required>
            <Input id="d-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </Field>
          <Field label="Training ends" htmlFor="d-ends" required>
            <Input id="d-ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !!error || !opens || !closes || !starts || !ends}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferingDialog({ intakeId, intakeName, intakeDeadline, offering, existingProgramIds, open, onOpenChange }: { intakeId: string; intakeName: string; intakeDeadline: string; offering: IntakeProgram | null; existingProgramIds: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const programs = useApi<Program[]>(offering ? null : "/admin/programs");
  const available = (programs.data ?? []).filter((p) => p.is_active && !existingProgramIds.includes(p.id));
  // A new program is the likely choice when the intake is empty and named after a
  // course we don't have yet (e.g. "Software Development for Beginners")
  const nameMatches = available.some((p) => intakeName.toLowerCase().includes(p.name.toLowerCase()));
  const [mode, setMode] = useState<"existing" | "new" | null>(null);
  const chosenMode = mode ?? (available.length === 0 || (existingProgramIds.length === 0 && !nameMatches) ? "new" : "existing");
  const [draft, setDraft] = useState<QuickProgramDraft>(() => emptyProgram(existingProgramIds.length === 0 ? programNameFromIntake(intakeName) : ""));
  const [programId, setProgramId] = useState("");
  const [capacity, setCapacity] = useState(String(offering?.capacity ?? ""));
  const [tuition, setTuition] = useState(offering?.tuition_fee != null ? String(offering.tuition_fee) : "");
  const [registration, setRegistration] = useState(offering?.registration_fee != null ? String(offering.registration_fee) : "");
  const [schedule, setSchedule] = useState(offering?.schedule ?? "");
  // empty: the intake's deadline
  const [deadline, setDeadline] = useState(offering?.application_closes_on ?? "");

  const isNew = !offering && chosenMode === "new";
  const chosen = offering || isNew ? null : available.find((p) => p.id === programId);
  const save = useApiMutation(
    async () => {
      const seats = Number(capacity || 30);
      if (isNew) {
        const program = await createQuickProgram(draft, seats);
        return api.post(`/admin/intakes/${intakeId}/programs`, {
          program_id: program.id, capacity: seats, schedule, application_closes_on: deadline || null,
        });
      }
      const body = {
        capacity: Number(capacity),
        tuition_fee: tuition === "" ? null : Number(tuition),
        registration_fee: registration === "" ? null : Number(registration),
        schedule,
        application_closes_on: deadline || null,
      };
      return offering
        ? api.patch(`/admin/intake-programs/${offering.id}`, body)
        : api.post(`/admin/intakes/${intakeId}/programs`, { ...body, program_id: programId });
    },
    {
      invalidate: ["/admin/intakes", "/admin/dashboard", "/admin/programs"],
      success: offering ? "Program updated" : isNew ? "Program created and added to the intake" : "Program added to the intake",
      onSuccess: () => onOpenChange(false),
    },
  );
  const ready = offering ? Number(capacity) > 0 : isNew ? programDraftReady(draft) && Number(capacity || 30) > 0 : !!programId && Number(capacity) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{offering ? `Edit ${offering.program_name}` : "Add a program to this intake"}</DialogTitle>
          <DialogDescription>{isNew ? "Create the course people will apply for; it's added to this intake straight away." : "Leave fees empty to use the program's normal fees."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!offering && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={m === "existing" && available.length === 0}
                  className={cn("rounded-md px-3 py-2 disabled:opacity-40", chosenMode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  {m === "existing" ? "A program we already have" : "A new program"}
                </button>
              ))}
            </div>
          )}
          {isNew ? (
            <QuickProgramFields draft={draft} onChange={setDraft} />
          ) : (
            !offering && (
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
              </Field>
            )
          )}
          <Field label="Seats" htmlFor="capacity" required hint={offering ? `${offering.enrolled} already enrolled` : "How many students this intake can take for it."}>
            <Input id="capacity" type="number" min={1} inputMode="numeric" value={capacity} placeholder={isNew ? "30" : undefined} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          {!isNew && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tuition fee" htmlFor="tuition" hint={`Default: ${formatMoney(offering?.program_tuition_fee ?? chosen?.tuition_fee ?? null)}`}>
                <Input id="tuition" type="number" min={0} inputMode="numeric" value={tuition} onChange={(e) => setTuition(e.target.value)} />
              </Field>
              <Field label="Registration fee" htmlFor="registration" hint={`Default: ${formatMoney(offering?.program_registration_fee ?? chosen?.registration_fee ?? null)}`}>
                <Input id="registration" type="number" min={0} inputMode="numeric" value={registration} onChange={(e) => setRegistration(e.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Schedule (optional)" htmlFor="schedule" hint="Shown to applicants, e.g. Mon–Fri, 8:00–10:00">
            <Input id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </Field>
          <Field
            label="Application deadline for this program (optional)"
            htmlFor="offering-deadline"
            hint={deadline && deadline > intakeDeadline
              ? `Later than the intake's deadline (${formatDate(intakeDeadline)}), which still applies unless you reopen the intake by hand.`
              : `Leave empty to use the intake's deadline (${formatDate(intakeDeadline)}). Set it to close this program earlier.`}
          >
            <div className="flex gap-2">
              <Input id="offering-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              {deadline && <Button type="button" variant="outline" onClick={() => setDeadline("")}>Clear</Button>}
            </div>
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !ready}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {offering ? "Save" : isNew ? "Create and add" : "Add program"}
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
          <p className="text-xs text-muted-foreground">
            Deadline: {o.application_closes_on ? <span className="font-medium text-foreground">{formatDate(o.application_closes_on)} (this program)</span> : "the intake's"}
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

/**
 * Can applicants see this intake? If not, why, and the one thing to do about it.
 * Mirrors the public list's rule: open, and a program accepting applications with a seat left.
 */
function Visibility({ intake: i, onAddProgram, onAction, pending }: { intake: Detail; onAddProgram: () => void; onAction: (k: ActionKey) => void; pending: boolean }) {
  const bookable = i.programs.filter((o) => o.accepting_applications && o.available_seats > 0);
  if (i.status === "open" && bookable.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <Eye className="h-5 w-5 shrink-0 text-success" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Applicants can see this intake and apply</span> for {bookable.length} program{bookable.length === 1 ? "" : "s"}, until {formatDate(i.application_closes_on)}.
        </p>
        <Button asChild size="sm" variant="outline"><a href="/training-center/intakes" target="_blank" rel="noopener noreferrer">See it on the website</a></Button>
      </div>
    );
  }
  if (["completed", "archived"].includes(i.status)) return null;

  let why: string;
  let fix: React.ReactNode = null;
  const btn = (label: string, onClick: () => void) => (
    <Button size="sm" onClick={onClick} disabled={pending}>{pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{label}</Button>
  );
  if (i.programs.length === 0) {
    why = "It has no programs yet, so there is nothing to apply for.";
    fix = btn("Add a program", onAddProgram);
  } else if (i.status === "draft") {
    why = "It is still a draft.";
    fix = btn("Publish now", () => onAction(i.application_opens_on > new Date().toISOString().slice(0, 10) ? "open" : "publish"));
  } else if (i.status === "upcoming") {
    why = `Applications open on ${formatDate(i.application_opens_on)}.`;
    fix = btn("Open applications now", () => onAction("open"));
  } else if (i.status === "closed") {
    why = "Applications are closed (the deadline passed, or they were closed).";
    fix = btn("Reopen applications", () => onAction("reopen"));
  } else if (i.status === "full" || bookable.length === 0) {
    why = i.programs.some((o) => o.accepting_applications)
      ? "Every program is full. Add seats to a program below (Edit), or reopen."
      : "No program is accepting applications. Turn on “Accepting applications” for a program below.";
    if (i.status === "full") fix = btn("Reopen applications", () => onAction("reopen"));
  } else {
    why = "It isn't open for applications.";
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4">
      <EyeOff className="h-5 w-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Applicants can't see this intake.</span> {why}
      </p>
      {fix}
    </div>
  );
}

export default function IntakeDetail() {
  const { id } = useParams();
  const q = useApi<Detail>(`/admin/intakes/${id}`);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [editing, setEditing] = useState<IntakeProgram | null>(null);
  const [changingDates, setChangingDates] = useState(false);
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

            <Visibility intake={i} onAddProgram={() => setAdding(true)} onAction={(key) => run.mutate(key)} pending={run.isPending} />

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

            <Section
              title="Details"
              actions={<Button variant="outline" size="sm" onClick={() => setChangingDates(true)}><Pencil className="mr-1.5 h-4 w-4" />Change dates</Button>}
            >
              <Facts
                columns={3}
                items={[
                  ["Applications open", formatDate(i.application_opens_on)],
                  ["Application deadline", formatDate(i.application_closes_on)],
                  ["Location", i.location || "—"],
                  ["Training starts", formatDate(i.training_starts_on)],
                  ["Training ends", formatDate(i.training_ends_on)],
                  ["Seats", `${i.enrolled} / ${i.capacity} enrolled`],
                  [
                    "Homepage band",
                    !i.show_in_ticker
                      ? "Not announced"
                      : i.is_featured
                        ? "Announced first (new intake)"
                        : `Announced (order ${i.ticker_priority})`,
                  ],
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
            {changingDates && <DatesDialog intake={i} open onOpenChange={setChangingDates} />}
            {(adding || editing) && (
              <OfferingDialog
                key={editing?.id ?? "new"}
                intakeId={i.id}
                intakeName={i.name}
                intakeDeadline={i.application_closes_on}
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

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field, Loading, PageHeader, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";
import { formatMoney } from "@/training/lib/format";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { Intake, Program } from "@/training/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createQuickProgram, emptyProgram, programDraftReady, programNameFromIntake, QuickProgramFields, type QuickProgramDraft } from "@/training/features/admin-core/QuickProgram";

type Form = {
  name: string;
  description: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  training_ends_on: string;
  location: string;
  // What the website's moving intake band shows
  show_in_ticker: boolean;
  is_featured: boolean;
  ticker_priority: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (days: number) => iso(new Date(Date.now() + days * 86_400_000));

// A new intake is usually "applications open today for a month, training a week
// later for three months"; everything can be changed.
function defaults(): Form {
  const now = new Date();
  const month = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return {
    name: `${month} Intake`,
    description: "",
    application_opens_on: iso(now),
    application_closes_on: plusDays(30),
    training_starts_on: plusDays(37),
    training_ends_on: plusDays(37 + 91),
    location: "Isoko Training Center, Kigali",
    show_in_ticker: true,
    is_featured: false,
    ticker_priority: "0",
  };
}

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
  const qc = useQueryClient();
  const existing = useApi<Intake>(editing ? `/admin/intakes/${id}` : null);
  const programs = useApi<Program[]>(editing ? null : "/admin/programs");
  const [form, setForm] = useState<Form>(() => (editing ? { ...defaults(), name: "" } : defaults()));
  // Programs offered in a new intake, with their seats
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  // A course that doesn't exist yet, created from here
  const [newProgram, setNewProgram] = useState<QuickProgramDraft | null>(null);
  const [newSeats, setNewSeats] = useState("30");
  const [creatingProgram, setCreatingProgram] = useState(false);
  const addNewProgram = async () => {
    if (!newProgram) return;
    setCreatingProgram(true);
    try {
      const p = await createQuickProgram(newProgram, Number(newSeats) || 30);
      await programs.refetch();
      setChosen((c) => ({ ...c, [p.id]: newSeats || "30" }));
      setNewProgram(null);
      toast.success(`${p.name} created and ticked`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreatingProgram(false);
    }
  };

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
        show_in_ticker: i.show_in_ticker,
        is_featured: i.is_featured,
        ticker_priority: String(i.ticker_priority ?? 0),
      });
    }
  }, [existing.data]);

  // the band's order is typed as text in the form; the API wants a number
  const payload = (f: Form) => ({ ...f, ticker_priority: Math.min(100, Math.max(0, Number(f.ticker_priority) || 0)) });

  const save = useApiMutation((f: Form) => api.patch<Intake>(`/admin/intakes/${id}`, payload(f)), {
    invalidate: ["/admin/intakes", "/admin/dashboard"],
    success: "Intake saved",
    onSuccess: (i) => navigate(`/training-center/admin/intakes/${i.id}`),
  });

  if (editing && existing.isLoading) return <Loading />;
  const errors = dateErrors(form);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const complete = form.name.trim().length >= 3 && form.application_opens_on && form.application_closes_on && form.training_starts_on && form.training_ends_on;
  const active = (programs.data ?? []).filter((p) => p.is_active);
  const picked = Object.entries(chosen);
  const seatsOk = picked.every(([, s]) => Number(s) > 0);

  // Create the intake, add its programs, and publish it (unless saving a draft)
  const create = async (publish: boolean) => {
    if (!complete || Object.keys(errors).length) return;
    if (publish && picked.length === 0) return toast.error("Choose at least one program so applicants have something to apply for.");
    if (!seatsOk) return toast.error("Enter how many seats each program has.");
    setBusy(publish ? "publish" : "draft");
    let intake: Intake | null = null;
    try {
      intake = await api.post<Intake>("/admin/intakes", payload(form));
      for (const [programId, seats] of picked) {
        await api.post(`/admin/intakes/${intake.id}/programs`, { program_id: programId, capacity: Number(seats), schedule: "" });
      }
      if (publish) await api.post(`/admin/intakes/${intake.id}/publish`);
      toast.success(
        publish
          ? form.application_opens_on <= iso(new Date())
            ? "Published. Applicants can apply now."
            : `Published. Applications open on ${new Date(form.application_opens_on).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`
          : "Saved as a draft. Applicants can't see it until you publish.",
      );
      qc.invalidateQueries();
      navigate(`/training-center/admin/intakes/${intake.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      // Whatever was created is kept; its page shows what is still missing
      if (intake) navigate(`/training-center/admin/intakes/${intake.id}`);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      if (Object.keys(errors).length === 0 && complete) save.mutate(form);
    } else create(true);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editing ? `Edit ${existing.data?.name ?? "intake"}` : "New intake"}
        subtitle={editing ? undefined : "Name it, check the dates, choose the programs, then press Publish."}
        back={editing ? { to: `/training-center/admin/intakes/${id}`, label: "Back to intake" } : { to: "/training-center/admin/intakes", label: "Intakes" }}
      />
      <form onSubmit={submit} className="space-y-6">
        <Section title="Name">
          <div className="space-y-4">
            <Field label="Intake name" htmlFor="name" required hint="For example: January 2027 Intake">
              <Input id="name" value={form.name} onChange={set("name")} required />
            </Field>
            <Field label="Description (optional)" htmlFor="description" hint="Shown to applicants.">
              <Textarea id="description" rows={2} value={form.description} onChange={set("description")} />
            </Field>
          </div>
        </Section>

        {!editing && (
          <Section
            title="Programs"
            description="Tick the courses this intake offers and how many students each can take. Missing one? Create it here."
            actions={!newProgram && <Button type="button" size="sm" variant="outline" onClick={() => setNewProgram(emptyProgram(programNameFromIntake(form.name)))}><Plus className="mr-1.5 h-4 w-4" />New program</Button>}
          >
            {newProgram && (
              <div className="mb-4 space-y-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                <p className="font-semibold">New program</p>
                <QuickProgramFields draft={newProgram} onChange={setNewProgram} />
                <Field label="Seats in this intake" htmlFor="qp-seats" required>
                  <Input id="qp-seats" type="number" min={1} inputMode="numeric" className="w-28" value={newSeats} onChange={(e) => setNewSeats(e.target.value)} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setNewProgram(null)}>Cancel</Button>
                  <Button type="button" onClick={addNewProgram} disabled={creatingProgram || !programDraftReady(newProgram) || !(Number(newSeats) > 0)}>
                    {creatingProgram && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create and add
                  </Button>
                </div>
              </div>
            )}
            {programs.isLoading ? (
              <Loading />
            ) : active.length === 0 ? (
              !newProgram && <p className="text-sm text-muted-foreground">There are no programs yet. Press <b>New program</b> to create the first one.</p>
            ) : (
              <ul className="space-y-2">
                {active.map((p) => {
                  const on = p.id in chosen;
                  return (
                    <li key={p.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors", on && "border-primary bg-primary/5")}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...chosen };
                          if (on) delete next[p.id];
                          else next[p.id] = String(p.max_students || 20);
                          setChosen(next);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-pressed={on}
                      >
                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                          {on && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">Tuition {formatMoney(p.tuition_fee)} · Registration {formatMoney(p.registration_fee)}</span>
                        </span>
                      </button>
                      {on && (
                        <label className="flex items-center gap-2 text-sm">
                          Seats
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            className="h-9 w-20"
                            value={chosen[p.id]}
                            onChange={(e) => setChosen({ ...chosen, [p.id]: e.target.value })}
                          />
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <Section title="Dates" description="Applicants can apply between the opening date and the deadline.">
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
            <Field label="Location" htmlFor="location" className="sm:col-span-2">
              <Input id="location" value={form.location} onChange={set("location")} />
            </Field>
          </div>
        </Section>

        <Section
          title="Homepage announcement"
          description="Published intakes move across the Isoko homepage in the intake band, with Applications Open, Closing Soon or Coming Soon decided by these dates and the free seats."
        >
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={form.show_in_ticker} onCheckedChange={(v) => setForm({ ...form, show_in_ticker: v })} />
              Announce this intake on the homepage
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} disabled={!form.show_in_ticker} />
              Show it first, marked as a new intake
            </label>
            <Field label="Order" htmlFor="ticker_priority" hint="0 to 100. A higher number comes earlier in the band.">
              <Input
                id="ticker_priority"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                className="w-24"
                value={form.ticker_priority}
                onChange={set("ticker_priority")}
                disabled={!form.show_in_ticker}
              />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          {editing ? (
            <Button type="submit" size="lg" disabled={save.isPending || !complete || Object.keys(errors).length > 0}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="lg" disabled={!!busy || !complete} onClick={() => create(false)}>
                {busy === "draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save as draft
              </Button>
              <Button type="submit" size="lg" disabled={!!busy || !complete || Object.keys(errors).length > 0}>
                {busy === "publish" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Publish
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

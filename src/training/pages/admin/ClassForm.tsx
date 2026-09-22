import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Field, NativeSelect, PageHeader, Section } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/training/lib/api";
import { useApi, useApiMutation } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";
import { useIntakeDetail, useIntakes, useTrainers } from "@/training/features/admin-ops/lookups";
import ScheduleFields, { scheduleValid, type Schedule } from "@/training/features/admin-ops/ScheduleFields";
import { plural } from "@/training/lib/format";

export default function ClassForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetIp = params.get("intake_program_id");
  const preset = useApi<{ intake_id: string; program_id: string }>(presetIp ? `/admin/intake-programs/${presetIp}` : null);

  const [intakeId, setIntakeId] = useState("");
  const [ipId, setIpId] = useState(presetIp ?? "");
  const [trainerId, setTrainerId] = useState("");
  const [schedule, setSchedule] = useState<Schedule>({ meeting_days: [1, 2, 3, 4, 5], start_time: "08:00", end_time: "10:00", room: "" });
  const [assignUnplaced, setAssignUnplaced] = useState(true);

  useEffect(() => {
    if (preset.data) setIntakeId(preset.data.intake_id);
  }, [preset.data]);

  const intakes = useIntakes();
  const intake = useIntakeDetail(intakeId || null);
  const trainers = useTrainers();

  const create = useApiMutation(
    () =>
      api.post<ClassSummary>("/admin/classes", {
        intake_program_id: ipId,
        trainer_id: trainerId || null,
        ...schedule,
        assign_unplaced: assignUnplaced,
      }),
    {
      invalidate: ["/admin/classes", "/admin/intakes", "/admin/students", "/admin/dashboard"],
      success: (c) => `Class ${c.code} created${c.student_count ? ` with ${plural(c.student_count, "student")}` : ""}`,
      onSuccess: (c) => navigate(`/training-center/admin/classes/${c.id}`, { replace: true }),
    },
  );

  const selectable = (intakes.data ?? []).filter((i) => !["archived"].includes(i.status));
  const valid = ipId && scheduleValid(schedule);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) create.mutate();
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Create class"
        subtitle="The class code (e.g. WD-JAN-2027-A) is generated from the program and intake."
        back={{ to: "/training-center/admin/classes", label: "Classes" }}
      />
      <form onSubmit={submit} className="space-y-6">
        <Section title="Program">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Intake" htmlFor="intake" required>
              <NativeSelect
                id="intake"
                value={intakeId}
                onChange={(e) => {
                  setIntakeId(e.target.value);
                  setIpId("");
                }}
              >
                <option value="">Choose an intake…</option>
                {selectable.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Program" htmlFor="program" required hint={intakeId && intake.data?.programs.length === 0 ? "This intake has no programs yet" : undefined}>
              <NativeSelect id="program" value={ipId} onChange={(e) => setIpId(e.target.value)} disabled={!intakeId}>
                <option value="">Choose a program…</option>
                {intake.data?.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.program_name} ({p.enrolled} enrolled{p.class_count ? `, ${p.class_count} class${p.class_count > 1 ? "es" : ""}` : ""})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Trainer" htmlFor="trainer" className="sm:col-span-2" hint="You can assign or change the trainer later.">
              <NativeSelect id="trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                <option value="">No trainer yet</option>
                {trainers.data?.filter((t) => t.is_active).map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}{t.specialization ? ` — ${t.specialization}` : ""}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </Section>
        <Section title="Timetable">
          <ScheduleFields value={schedule} onChange={setSchedule} />
        </Section>
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <Checkbox id="assign" checked={assignUnplaced} onCheckedChange={(v) => setAssignUnplaced(v === true)} />
          <Label htmlFor="assign" className="leading-snug">
            Add approved students of this program who don't have a class yet
            <span className="block text-xs font-normal text-muted-foreground">Students approved later are placed in a class automatically.</span>
          </Label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create class
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => navigate("/training-center/admin/classes")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

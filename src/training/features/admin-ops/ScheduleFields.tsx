import { Field } from "@/training/components/common";
import { Input } from "@/components/ui/input";
import { WEEKDAYS } from "@/training/lib/format";
import { cn } from "@/lib/utils";

export type Schedule = { meeting_days: number[]; start_time: string; end_time: string; room: string };

/** Room, meeting days and time fields shared by the create and edit class forms. */
export default function ScheduleFields({ value, onChange }: { value: Schedule; onChange: (v: Schedule) => void }) {
  const toggle = (d: number) =>
    onChange({
      ...value,
      meeting_days: value.meeting_days.includes(d) ? value.meeting_days.filter((x) => x !== d) : [...value.meeting_days, d].sort(),
    });
  const badTime = value.end_time <= value.start_time;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Meeting days" required className="sm:col-span-2" error={value.meeting_days.length === 0 ? "Pick at least one day" : null}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meeting days">
          {WEEKDAYS.map((label, i) => {
            const on = value.meeting_days.includes(i + 1);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i + 1)}
                className={cn(
                  "h-10 min-w-12 rounded-full border px-3 text-sm font-semibold transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Starts at" htmlFor="start-time" required>
        <Input id="start-time" type="time" value={value.start_time} onChange={(e) => onChange({ ...value, start_time: e.target.value })} />
      </Field>
      <Field label="Ends at" htmlFor="end-time" required error={badTime ? "Must be after the start time" : null}>
        <Input id="end-time" type="time" value={value.end_time} onChange={(e) => onChange({ ...value, end_time: e.target.value })} />
      </Field>
      <Field label="Room" htmlFor="room" hint="e.g. Computer Lab 1" className="sm:col-span-2">
        <Input id="room" value={value.room} onChange={(e) => onChange({ ...value, room: e.target.value })} />
      </Field>
    </div>
  );
}

export const scheduleValid = (s: Schedule) => s.meeting_days.length > 0 && s.end_time > s.start_time;

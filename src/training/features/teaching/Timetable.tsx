import { Megaphone } from "lucide-react";
import { EmptyState, Pill } from "@/training/components/common";
import { formatDateTime, formatTime, WEEKDAYS } from "@/training/lib/format";
import type { Announcement } from "@/training/lib/types";
import { cn } from "@/lib/utils";

export type TimetableEntry = {
  id: string;
  title: string;
  subtitle?: string;
  room?: string;
  meeting_days: number[];
  start_time: string;
  end_time: string;
  href?: string;
};

const isoToday = () => ((new Date().getDay() + 6) % 7) + 1;

/** Mon–Sun week with today highlighted. On phones, days stack; empty days are compact. */
export function Timetable({ entries, renderLink }: { entries: TimetableEntry[]; renderLink?: (e: TimetableEntry, children: React.ReactNode) => React.ReactNode }) {
  const today = isoToday();
  return (
    <ol className="grid gap-3 md:grid-cols-7 md:gap-2">
      {WEEKDAYS.map((label, i) => {
        const day = i + 1;
        const items = entries.filter((e) => e.meeting_days.includes(day)).sort((a, b) => a.start_time.localeCompare(b.start_time));
        const isToday = day === today;
        return (
          <li
            key={label}
            className={cn("rounded-xl border bg-card p-3 shadow-sm md:min-h-40", isToday && "border-primary ring-1 ring-primary/30", items.length === 0 && "hidden md:block")}
            aria-current={isToday ? "date" : undefined}
          >
            <p className={cn("mb-2 text-sm font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>
              {label}
              {isToday && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Today</span>}
            </p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No class</p>
            ) : (
              <ul className="space-y-2">
                {items.map((e) => {
                  const body = (
                    <div className="rounded-lg bg-secondary/70 p-2 text-sm">
                      <p className="tabular text-xs font-semibold text-primary">{formatTime(e.start_time)}–{formatTime(e.end_time)}</p>
                      <p className="font-medium leading-snug">{e.title}</p>
                      {e.subtitle && <p className="text-xs text-muted-foreground">{e.subtitle}</p>}
                      {e.room && <p className="text-xs text-muted-foreground">{e.room}</p>}
                    </div>
                  );
                  return <li key={e.id}>{renderLink ? renderLink(e, body) : body}</li>;
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const AUDIENCE: Record<Announcement["audience"], string> = {
  all: "Everyone",
  students: "All students",
  trainers: "All trainers",
  intake: "Intake",
  class: "Class",
};

export function AnnouncementList({ items, emptyText = "No announcements yet." }: { items: Announcement[]; emptyText?: string }) {
  if (items.length === 0) return <EmptyState icon={Megaphone} title={emptyText} />;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={a.audience === "class" ? "primary" : "gold"}>
              {a.audience === "class" && a.class_code ? a.class_code : a.audience === "intake" && a.intake_name ? a.intake_name : AUDIENCE[a.audience]}
            </Pill>
            <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}{a.author && ` · ${a.author}`}</span>
          </div>
          <p className="mt-2 font-semibold">{a.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
        </li>
      ))}
    </ul>
  );
}

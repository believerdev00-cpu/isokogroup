import { School } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, QueryView, StatusBadge } from "@/training/components/common";
import { formatDays, formatPeriod, formatTime, plural } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";

type TrainerClass = ClassSummary & { training_starts_on: string; training_ends_on: string };

export default function TrainerClasses() {
  const q = useApi<TrainerClass[]>("/trainer/classes");
  return (
    <div>
      <PageHeader title="My Classes" subtitle="Classes the administrator has assigned to you." />
      <QueryView query={q}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={School} title="No classes assigned yet" description="When a class is assigned to you, it will appear here." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id}>
                  <Link to={`/training-center/trainer/classes/${c.id}`} className="block h-full rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{c.program_name}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{c.code} · {c.intake_name}</p>
                    <p className="mt-3 text-sm">{formatDays(c.meeting_days)} · {formatTime(c.start_time)}–{formatTime(c.end_time)}</p>
                    <p className="text-sm text-muted-foreground">{c.room || "No room set"} · {plural(c.student_count, "student")}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Training {formatPeriod(c.training_starts_on, c.training_ends_on)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

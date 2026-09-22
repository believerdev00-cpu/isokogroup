import { Clock, MapPin, School, Users } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, PageHeader, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { formatDays, formatTime } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";
import { cn } from "@/lib/utils";
import ClassWorkspace from "./ClassWorkspace";

const TITLES = {
  attendance: { title: "Attendance", subtitle: "Choose a class to take or review attendance." },
  assessments: { title: "Assessments", subtitle: "Choose a class to create assessments and enter marks." },
  results: { title: "Results", subtitle: "Choose a class to see marks, grades and pass/fail." },
} as const;

const todayIso = () => ((new Date().getDay() + 6) % 7) + 1;

/** Pick a class, then work on it. The choice is kept in ?class= so reloads stay put. */
export default function ClassPicker({ role, tab }: { role: "admin" | "trainer"; tab: "attendance" | "assessments" | "results" }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("class");
  const classes = useApi<ClassSummary[]>(role === "admin" ? "/admin/classes?status=active" : "/trainer/classes");
  const t = TITLES[tab];

  const choose = (id: string | null) => {
    const next = new URLSearchParams();
    if (id) next.set("class", id);
    setParams(next);
  };

  return (
    <QueryView query={classes}>
      {(all) => {
        const list = all.filter((c) => c.status === "active");
        const current = list.find((c) => c.id === selected) ?? (list.length === 1 ? list[0] : undefined);
        if (current) {
          return (
            <div>
              <PageHeader
                title={t.title}
                subtitle={
                  <>
                    <strong className="text-foreground">{current.code}</strong> · {current.program_name} · {current.intake_name} ·{" "}
                    {formatDays(current.meeting_days)} {formatTime(current.start_time)}–{formatTime(current.end_time)}
                    {current.room && ` · ${current.room}`}
                  </>
                }
                actions={
                  list.length > 1 ? (
                    <Button variant="outline" onClick={() => choose(null)}>Change class</Button>
                  ) : undefined
                }
              />
              <ClassWorkspace key={current.id} classId={current.id} initialTab={tab} />
            </div>
          );
        }
        return (
          <div>
            <PageHeader title={t.title} subtitle={t.subtitle} />
            {list.length === 0 ? (
              <EmptyState
                icon={School}
                title={role === "trainer" ? "You have no active classes" : "No active classes yet"}
                description={role === "trainer" ? "Classes assigned to you by the administrator will appear here." : "Create a class for an intake program first."}
                action={role === "admin" ? <Button asChild><Link to="/training-center/admin/classes/new">Create class</Link></Button> : undefined}
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const meetsToday = c.meeting_days.includes(todayIso());
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => choose(c.id)}
                        className={cn(
                          "h-full w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-secondary/40",
                          meetsToday && "border-primary/30",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{c.code}</p>
                          {meetsToday && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">Today</span>}
                        </div>
                        <p className="mt-1 text-sm">{c.program_name}</p>
                        <p className="text-xs text-muted-foreground">{c.intake_name}</p>
                        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{formatDays(c.meeting_days)} · {formatTime(c.start_time)}–{formatTime(c.end_time)}</p>
                          {c.room && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden />{c.room}</p>}
                          <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{c.student_count} {c.student_count === 1 ? "student" : "students"}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}

import { CalendarCheck, CheckCircle2, Clock, MapPin, School, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, QueryView } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/training/lib/auth";
import { formatDays, formatLongDate, formatTime, plural } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";

type TodayClass = ClassSummary & { lesson_topic: string | null; session_id: string | null; attendance_taken: number };
type TrainerDashboard = { today: string; todays_classes: TodayClass[]; active_classes: ClassSummary[] };

export default function TrainerDashboard() {
  const { user } = useAuth();
  const q = useApi<TrainerDashboard>("/trainer/dashboard");
  const firstName = user?.full_name.split(" ")[0] ?? "";

  return (
    <QueryView query={q}>
      {(d) => (
        <div className="space-y-8">
          <div>
            <h1 className="page-title">Good day, {firstName}</h1>
            <p className="page-subtitle">{formatLongDate(d.today)}</p>
          </div>

          <section aria-labelledby="today-heading" className="space-y-3">
            <h2 id="today-heading" className="text-lg font-semibold">Today's Classes</h2>
            {d.todays_classes.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No classes today" description="Enjoy the day. Your weekly timetable is under Today's Schedule." />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {d.todays_classes.map((c) => {
                  const taken = c.attendance_taken > 0;
                  return (
                    <li key={c.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold">{c.program_name}</p>
                          <p className="text-sm text-muted-foreground">{c.code}</p>
                        </div>
                        {taken && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Attendance taken
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold"><Clock className="h-4 w-4 text-primary" aria-hidden />{formatTime(c.start_time)}–{formatTime(c.end_time)}</span>
                        {c.room && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />{c.room}</span>}
                        <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" aria-hidden />{plural(c.student_count, "student")}</span>
                      </div>
                      <div className="mt-4 rounded-lg bg-secondary/60 px-3 py-2.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today's Lesson</p>
                        {c.lesson_topic ? (
                          <p className="font-semibold">{c.lesson_topic}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No lesson planned — add today's topic when you take attendance.</p>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button asChild size="lg" variant={taken ? "outline" : "default"}>
                          <Link to={`/training-center/trainer/classes/${c.id}?tab=attendance`}>{taken ? "Update Attendance" : "Take Attendance"}</Link>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                          <Link to={`/training-center/trainer/classes/${c.id}?tab=students`}>Open Class</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="mine-heading" className="space-y-3">
            <h2 id="mine-heading" className="text-lg font-semibold">My classes</h2>
            {d.active_classes.length === 0 ? (
              <EmptyState icon={School} title="No classes assigned yet" description="When the administrator assigns you a class, it will appear here." />
            ) : (
              <ul className="divide-y rounded-xl border bg-card shadow-sm">
                {d.active_classes.map((c) => (
                  <li key={c.id}>
                    <Link to={`/training-center/trainer/classes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.program_name}</p>
                        <p className="text-xs text-muted-foreground">{c.code} · {formatDays(c.meeting_days)} {formatTime(c.start_time)}</p>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">{plural(c.student_count, "student")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </QueryView>
  );
}

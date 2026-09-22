import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  GraduationCap,
  School,
  UserCog,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, QueryView, SeatsMeter, Section, StatCard, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { formatDate, formatLongDate, formatMoney, formatTime } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { IntakeStatus } from "@/training/lib/types";

type DashboardData = {
  today: string;
  currency: string;
  stats: {
    open_intakes: number;
    active_students: number;
    pending_applications: number;
    active_programs: number;
    active_trainers: number;
    classes_today: number;
    fees_collected: number;
    fees_this_month: number;
    outstanding_fees: number;
  };
  current_intake: { id: string; name: string; status: IntakeStatus; application_closes_on: string; training_starts_on: string; training_ends_on: string } | null;
  overview: { intake_id: string; intake_name: string; intake_status: IntakeStatus; intake_program_id: string; program_name: string; capacity: number; enrolled: number; available_seats: number; pending: number }[];
  attention: { students_without_class: number; classes_without_trainer: number; waitlisted: number };
  todays_classes: { id: string; code: string; room: string; start_time: string; end_time: string; program_name: string; trainer_name: string | null; attendance_taken: boolean }[];
};

export default function Dashboard() {
  const q = useApi<DashboardData>("/admin/dashboard");
  return (
    <QueryView query={q}>
      {(d) => {
        const groups = new Map<string, { name: string; status: IntakeStatus; rows: DashboardData["overview"] }>();
        for (const row of d.overview) {
          const g = groups.get(row.intake_id) ?? { name: row.intake_name, status: row.intake_status, rows: [] };
          g.rows.push(row);
          groups.set(row.intake_id, g);
        }
        const attention = [
          d.stats.pending_applications > 0 && {
            to: "/training-center/admin/applications",
            text: `${d.stats.pending_applications} application${d.stats.pending_applications === 1 ? "" : "s"} waiting for a decision`,
            action: "Review",
          },
          d.attention.students_without_class > 0 && {
            to: "/training-center/admin/students?unassigned=1&status=active",
            text: `${d.attention.students_without_class} student${d.attention.students_without_class === 1 ? " is" : "s are"} not in a class yet`,
            action: "Assign",
          },
          d.attention.classes_without_trainer > 0 && {
            to: "/training-center/admin/classes",
            text: `${d.attention.classes_without_trainer} class${d.attention.classes_without_trainer === 1 ? " has" : "es have"} no trainer`,
            action: "Assign trainer",
          },
          d.attention.waitlisted > 0 && {
            to: "/training-center/admin/applications?status=waitlisted",
            text: `${d.attention.waitlisted} applicant${d.attention.waitlisted === 1 ? " is" : "s are"} on a waiting list`,
            action: "View",
          },
        ].filter(Boolean) as { to: string; text: string; action: string }[];

        return (
          <div className="space-y-6">
            <PageHeader
              title="Dashboard"
              subtitle={`What's happening at Isoko Training Center · ${formatLongDate(d.today)}`}
              actions={
                <>
                  <Button asChild><Link to="/training-center/admin/applications">Review Applications</Link></Button>
                  <Button asChild variant="outline"><Link to="/training-center/admin/intakes/new">Create Intake</Link></Button>
                  <Button asChild variant="outline"><Link to="/training-center/admin/students/new">Add Student</Link></Button>
                  <Button asChild variant="outline"><Link to="/training-center/admin/payments">Record Payment</Link></Button>
                </>
              }
            />

            {d.current_intake ? (
              <Link
                to={`/training-center/admin/intakes/${d.current_intake.id}`}
                className="block rounded-xl border bg-primary p-5 text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Current intake</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold">{d.current_intake.name}</h2>
                  <StatusBadge status={d.current_intake.status} className="border-white/20 bg-white/15 text-white" />
                </div>
                <p className="mt-2 text-sm text-primary-foreground/80">
                  Application deadline {formatDate(d.current_intake.application_closes_on)} · Training {formatDate(d.current_intake.training_starts_on)} –{" "}
                  {formatDate(d.current_intake.training_ends_on)}
                </p>
              </Link>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No active intakes yet."
                description="Create an intake, add programs to it and publish it so applicants can apply."
                action={<Button asChild><Link to="/training-center/admin/intakes/new">Create your first intake</Link></Button>}
              />
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Pending applications" value={d.stats.pending_applications} icon={ClipboardList} to="/training-center/admin/applications" tone={d.stats.pending_applications ? "gold" : "primary"} />
              <StatCard label="Active students" value={d.stats.active_students} icon={GraduationCap} to="/training-center/admin/students?status=active" />
              <StatCard label="Open intakes" value={d.stats.open_intakes} icon={CalendarDays} to="/training-center/admin/intakes" />
              <StatCard label="Classes today" value={d.stats.classes_today} icon={School} to="/training-center/admin/classes" />
              <StatCard label="Active programs" value={d.stats.active_programs} icon={BookOpen} to="/training-center/admin/programs" />
              <StatCard label="Active trainers" value={d.stats.active_trainers} icon={UserCog} to="/training-center/admin/trainers" />
              <StatCard
                label="Fees collected"
                value={formatMoney(d.stats.fees_collected, d.currency)}
                hint={`${formatMoney(d.stats.fees_this_month, d.currency)} this month`}
                icon={Wallet}
                to="/training-center/admin/payments"
              />
              <StatCard label="Outstanding fees" value={formatMoney(d.stats.outstanding_fees, d.currency)} icon={CreditCard} to="/training-center/admin/reports?type=outstanding" tone={d.stats.outstanding_fees ? "danger" : "primary"} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Section title="Intake overview" description="Seats taken in each program, and applications waiting.">
                  {groups.size === 0 ? (
                    <p className="text-sm text-muted-foreground">No open intakes right now.</p>
                  ) : (
                    <div className="space-y-6">
                      {[...groups.entries()].map(([id, g]) => (
                        <div key={id}>
                          <div className="mb-3 flex items-center gap-2">
                            <Link to={`/training-center/admin/intakes/${id}`} className="font-semibold hover:text-primary">{g.name}</Link>
                            <StatusBadge status={g.status} />
                          </div>
                          <ul className="space-y-4">
                            {g.rows.map((r) => (
                              <li key={r.intake_program_id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{r.program_name}</p>
                                  {r.pending > 0 && (
                                    <Link to={`/training-center/admin/applications?intake_program_id=${r.intake_program_id}`} className="text-xs font-semibold text-warning hover:underline">
                                      {r.pending} pending
                                    </Link>
                                  )}
                                </div>
                                <SeatsMeter enrolled={r.enrolled} capacity={r.capacity} compact />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

              <div className="space-y-6">
                <Section title="Needs attention">
                  {attention.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Nothing waiting. All caught up.</p>
                  ) : (
                    <ul className="space-y-3">
                      {attention.map((a) => (
                        <li key={a.to} className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                          <div className="min-w-0 flex-1 text-sm">
                            <p>{a.text}</p>
                            <Link to={a.to} className="font-semibold text-primary hover:underline">{a.action} →</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Today's classes">
                  {d.todays_classes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No classes meet today.</p>
                  ) : (
                    <ul className="divide-y">
                      {d.todays_classes.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <Link to={`/training-center/admin/classes/${c.id}`} className="block truncate text-sm font-medium hover:text-primary">{c.program_name}</Link>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(c.start_time)}–{formatTime(c.end_time)} · {c.room || c.code} · {c.trainer_name ?? "No trainer"}
                            </p>
                          </div>
                          {c.attendance_taken ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Taken</span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"><Clock className="h-4 w-4" /> Not yet</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

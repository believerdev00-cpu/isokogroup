import { Award, CalendarCheck, Clock, CreditCard, Layers, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Facts, ProgressBar, Section, StatCard, StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { nextClass, StudentEnrollmentPage } from "@/training/features/student/useStudent";
import { AnnouncementList } from "@/training/features/teaching/Timetable";
import { useAuth } from "@/training/lib/auth";
import { formatDate, formatDays, formatMoney, formatPercent, formatTime } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Announcement } from "@/training/lib/types";

type Cert = { id: string; enrollment_id: string; certificate_number: string; revoked: boolean; program_name: string; intake_name: string };

export default function StudentDashboard() {
  const { user } = useAuth();
  const announcements = useApi<Announcement[]>("/student/announcements");
  const certificates = useApi<Cert[]>("/student/certificates");
  const firstName = user?.full_name.split(" ")[0] ?? "";

  return (
    <StudentEnrollmentPage title={`Hello, ${firstName}`}>
      {(e, data) => {
        const next = nextClass(e);
        const cert = certificates.data?.find((c) => !c.revoked && c.enrollment_id === e.id);
        const fin = e.finance;
        return (
          <div className="space-y-6">
            <Section>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-primary">Student: {data.student.student_number}</p>
                  <p className="text-xl font-bold">{e.program_name}</p>
                  <p className="text-muted-foreground">
                    {e.intake_name} <StatusBadge status={e.status} className="ml-1 align-middle" />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {e.class_code ? (
                      <>Class {e.class_code}{e.room && ` · ${e.room}`}{e.trainer_name && ` · Trainer ${e.trainer_name}`}</>
                    ) : (
                      "You'll be placed in a class soon."
                    )}
                  </p>
                </div>
                {next && (
                  <div className="rounded-xl bg-secondary px-4 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> Next class
                    </p>
                    <p className="text-lg font-bold">
                      {next.label}, {formatTime(e.start_time)}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatDays(e.meeting_days)} · {formatTime(e.start_time)}–{formatTime(e.end_time)}</p>
                  </div>
                )}
              </div>
              <div className="mt-5">
                <p className="mb-1.5 text-sm font-medium">Course progress</p>
                <ProgressBar value={e.progress} label="Course progress" />
                <p className="mt-1 text-xs text-muted-foreground">Training {formatDate(e.training_starts_on)} – {formatDate(e.training_ends_on)}</p>
              </div>
            </Section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Attendance"
                value={formatPercent(e.attendance.rate)}
                hint={`${e.attendance.present + e.attendance.late} of ${e.attendance.sessions - e.attendance.excused} classes`}
                icon={CalendarCheck}
                tone={e.attendance.rate !== null && e.attendance.rate < 75 ? "danger" : "primary"}
                to="/training-center/student/attendance"
              />
              <StatCard
                label="Results"
                value={e.results.grade ?? "—"}
                hint={e.results.percentage === null ? "No marks yet" : `${formatPercent(e.results.percentage)} average`}
                icon={Layers}
                to="/training-center/student/results"
              />
              <StatCard
                label="Fees"
                value={<StatusBadge status={fin.payment_status} className="text-sm" />}
                hint={`Paid ${formatMoney(fin.total_paid, data.currency)} · Balance ${formatMoney(Math.max(fin.balance, 0), data.currency)}`}
                icon={CreditCard}
                tone={fin.balance > 0 ? "gold" : "primary"}
                to="/training-center/student/payments"
              />
              <StatCard
                label="Certificate"
                value={cert ? "Issued" : e.status === "completed" ? "Pending" : "Not yet"}
                hint={cert ? cert.certificate_number : "Available after you complete the program"}
                icon={Award}
                tone="gold"
                to="/training-center/student/certificate"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
              <Section
                title="Latest announcements"
                actions={<Button asChild variant="ghost" size="sm"><Link to="/training-center/student/announcements">See all</Link></Button>}
              >
                <AnnouncementList items={(announcements.data ?? []).slice(0, 3)} emptyText="No announcements yet" />
              </Section>
              <Section title="My details">
                <Facts
                  columns={1}
                  items={[
                    ["Name", data.student.full_name],
                    ["Student number", data.student.student_number],
                    ["Email", data.student.email],
                    ["Phone", data.student.phone],
                  ]}
                />
                <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
                  <UserRound className="h-4 w-4 shrink-0" aria-hidden />
                  To correct your details, contact the training center office.
                </p>
              </Section>
            </div>
          </div>
        );
      }}
    </StudentEnrollmentPage>
  );
}

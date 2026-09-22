import { CalendarCheck } from "lucide-react";
import { EmptyState, QueryView, Section, StatCard, StatusBadge } from "@/training/components/common";
import { StudentEnrollmentPage, type StudentEnrollment } from "@/training/features/student/useStudent";
import { formatDate, formatPercent } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { AttendanceMark } from "@/training/lib/types";

type Row = { session_date: string; topic: string; status: AttendanceMark; note: string | null };

export default function StudentAttendance() {
  return (
    <StudentEnrollmentPage title="Attendance">
      {(e, d) => <AttendanceView e={e} minimum={d.certificate_requirements.min_attendance} />}
    </StudentEnrollmentPage>
  );
}

function AttendanceView({ e, minimum }: { e: StudentEnrollment; minimum: number }) {
  const q = useApi<Row[]>(`/student/enrollments/${e.id}/attendance`);
  const a = e.attendance;
  const low = a.rate !== null && minimum > 0 && a.rate < minimum;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <StatCard label="Attendance" value={formatPercent(a.rate)} tone={low ? "danger" : "primary"} hint={low ? `Below the ${minimum}% needed for your certificate` : minimum > 0 ? `${minimum}% needed for your certificate` : undefined} />
        </div>
        <StatCard label="Present" value={a.present} />
        <StatCard label="Late" value={a.late} />
        <StatCard label="Absent" value={a.absent} tone={a.absent > 0 ? "danger" : "primary"} />
        <StatCard label="Excused" value={a.excused} />
      </div>
      <p className="text-xs text-muted-foreground">Present and late count as attended. Excused absences don't count against you.</p>
      <Section title="Class record">
        <QueryView query={q}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No attendance recorded yet" description="Your attendance appears here after each class." />
            ) : (
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.session_date} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatDate(r.session_date)}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.topic || "Class"}{r.note && ` · ${r.note}`}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )
          }
        </QueryView>
      </Section>
    </div>
  );
}

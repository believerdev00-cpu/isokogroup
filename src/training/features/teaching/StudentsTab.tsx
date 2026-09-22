import { Phone, Users } from "lucide-react";
import { EmptyState, ProgressBar, StatusBadge, TableWrap } from "@/training/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/training/lib/format";
import { cn } from "@/lib/utils";
import type { ClassDetail } from "./types";

export function AttendanceRate({ rate }: { rate: number | null }) {
  return (
    <span className={cn("tabular font-semibold", rate !== null && rate < 75 ? "text-destructive" : rate !== null && rate < 85 ? "text-warning" : "text-success")}>
      {formatPercent(rate)}
    </span>
  );
}

export default function StudentsTab({ klass }: { klass: ClassDetail }) {
  if (klass.students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students in this class yet"
        description="Students join automatically when their application is approved. An administrator can also add them from the class page."
      />
    );
  }
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-semibold">{klass.students.length} {klass.students.length === 1 ? "student" : "students"}</p>
        <p className="text-xs text-muted-foreground">Attendance below 75% is shown in red</p>
      </div>
      {/* Phones: cards */}
      <ul className="divide-y md:hidden">
        {klass.students.map((s) => (
          <li key={s.enrollment_id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.full_name}</p>
                <p className="text-xs text-muted-foreground">{s.student_number}</p>
              </div>
              <div className="text-right text-sm">
                <AttendanceRate rate={s.attendance.rate} />
                <p className="text-xs text-muted-foreground">attendance</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-primary">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {s.phone}
              </a>
              <span>
                {s.results.grade ? (
                  <>Grade <strong>{s.results.grade}</strong> · {formatPercent(s.results.percentage)}</>
                ) : (
                  <span className="text-muted-foreground">No marks yet</span>
                )}
              </span>
            </div>
            <ProgressBar value={s.progress} label="Course progress" />
          </li>
        ))}
      </ul>
      {/* Larger screens: table */}
      <div className="hidden md:block">
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="w-48">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {klass.students.map((s) => (
                <TableRow key={s.enrollment_id}>
                  <TableCell>
                    <p className="font-medium">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">{s.student_number}</p>
                  </TableCell>
                  <TableCell>
                    <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="text-primary hover:underline">{s.phone}</a>
                  </TableCell>
                  <TableCell className="text-right">
                    <AttendanceRate rate={s.attendance.rate} />
                    <p className="text-xs text-muted-foreground">{s.attendance.sessions} sessions</p>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatPercent(s.results.percentage)}</TableCell>
                  <TableCell>
                    {s.results.grade ? <StatusBadge status={s.results.passed === false ? "fail" : "pass"} label={s.results.grade} /> : "—"}
                  </TableCell>
                  <TableCell>
                    <ProgressBar value={s.progress} label="Course progress" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </div>
    </div>
  );
}

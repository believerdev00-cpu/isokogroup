import { Layers } from "lucide-react";
import { EmptyState, QueryView, Section, StatCard, StatusBadge, TableWrap } from "@/training/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentEnrollmentPage, type StudentEnrollment } from "@/training/features/student/useStudent";
import { TypeBadge } from "@/training/features/teaching/AssessmentsTab";
import { resultLabel } from "@/training/features/teaching/types";
import { formatPercent } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { StudentAssessment } from "./Assignments";

export default function StudentResults() {
  return <StudentEnrollmentPage title="Results">{(e) => <ResultsView e={e} />}</StudentEnrollmentPage>;
}

function ResultsView({ e }: { e: StudentEnrollment }) {
  const q = useApi<StudentAssessment[]>(`/student/enrollments/${e.id}/assessments`);
  const r = e.results;
  const outcome = resultLabel(r);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Average so far" value={formatPercent(r.percentage)} hint={`${r.assessments_completed} of ${r.assessments_total} marked`} />
        <StatCard label="Final mark" value={formatPercent(r.final_percentage)} hint="Unmarked work counts as 0" />
        <StatCard label="Grade" value={r.grade ?? "—"} tone="gold" />
        <StatCard label="Result" value={<StatusBadge status={outcome.status} label={outcome.label} className="text-sm" />} hint={r.passed === null ? "Known once everything is marked" : undefined} />
      </div>
      <Section title="Marks by assessment">
        <QueryView query={q}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon={Layers} title="No results yet" description="Marks appear here as your trainer records them." />
            ) : (
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessment</TableHead>
                      <TableHead className="text-right">Marks</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => {
                      const pct = a.marks === null ? null : (Number(a.marks) / Number(a.max_marks)) * 100;
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <p className="font-medium">{a.title}</p>
                            <TypeBadge type={a.type} />
                          </TableCell>
                          <TableCell className="tabular whitespace-nowrap text-right">
                            {a.marks === null ? <span className="text-muted-foreground">Not marked</span> : `${Number(a.marks)} / ${Number(a.max_marks)}`}
                          </TableCell>
                          <TableCell className="tabular text-right">{formatPercent(pct)}</TableCell>
                          <TableCell className="tabular text-right">{Number(a.weight)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableWrap>
            )
          }
        </QueryView>
      </Section>
    </div>
  );
}

import { Layers } from "lucide-react";
import { EmptyState, QueryView, StatusBadge } from "@/training/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import { resultLabel, type ClassDetail, type ClassResults } from "./types";

export default function ResultsTab({ klass }: { klass: ClassDetail }) {
  const q = useApi<ClassResults>(`/classes/${klass.id}/results`);
  return (
    <QueryView query={q}>
      {(data) =>
        data.assessments.length === 0 || data.students.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No results yet"
            description={data.students.length === 0 ? "This class has no students yet." : "Create assessments and enter marks to see results here."}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Average = weighted mark over the assessments marked so far. Final = weighted over all assessments (unmarked count as 0).
            </p>
            {/* Phones: one card per student */}
            <ul className="space-y-3 md:hidden">
              {data.students.map((s) => {
                const r = resultLabel(s.results);
                return (
                  <li key={s.enrollment_id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">{s.student_number}</p>
                      </div>
                      <StatusBadge status={r.status} label={r.label} />
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                      {data.assessments.map((a) => (
                        <div key={a.id} className="flex justify-between gap-2">
                          <dt className="truncate text-muted-foreground">{a.title}</dt>
                          <dd className="tabular font-medium">{s.marks[a.id] === undefined ? "—" : `${Number(s.marks[a.id])} / ${Number(a.max_marks)}`}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-sm">
                      <div><p className="text-xs text-muted-foreground">Average</p><p className="tabular font-semibold">{formatPercent(s.results.percentage)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Final</p><p className="tabular font-semibold">{formatPercent(s.results.final_percentage)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Grade</p><p className="font-bold">{s.results.grade ?? "—"}</p></div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* Larger screens: marks matrix */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">Student</TableHead>
                    {data.assessments.map((a) => (
                      <TableHead key={a.id} className="min-w-[7rem] text-right">
                        <span className="block truncate" title={a.title}>{a.title}</span>
                        <span className="text-xs font-normal">/{Number(a.max_marks)} · {Number(a.weight)}%</span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((s) => {
                    const r = resultLabel(s.results);
                    return (
                      <TableRow key={s.enrollment_id}>
                        <TableCell className="sticky left-0 bg-card">
                          <p className="font-medium">{s.full_name}</p>
                          <p className="text-xs text-muted-foreground">{s.student_number}</p>
                        </TableCell>
                        {data.assessments.map((a) => (
                          <TableCell key={a.id} className="tabular text-right">
                            {s.marks[a.id] === undefined ? <span className="text-muted-foreground">—</span> : Number(s.marks[a.id])}
                          </TableCell>
                        ))}
                        <TableCell className="tabular text-right">{formatPercent(s.results.percentage)}</TableCell>
                        <TableCell className="tabular text-right font-semibold">{formatPercent(s.results.final_percentage)}</TableCell>
                        <TableCell className="font-bold">{s.results.grade ?? "—"}</TableCell>
                        <TableCell><StatusBadge status={r.status} label={r.label} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      }
    </QueryView>
  );
}

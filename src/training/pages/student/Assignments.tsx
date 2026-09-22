import { FileText } from "lucide-react";
import { EmptyState, Pill, QueryView } from "@/training/components/common";
import { StudentEnrollmentPage, type StudentEnrollment } from "@/training/features/student/useStudent";
import { TypeBadge } from "@/training/features/teaching/AssessmentsTab";
import { formatDate } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { AssessmentType } from "@/training/lib/types";

export type StudentAssessment = {
  id: string;
  type: AssessmentType;
  title: string;
  description: string;
  due_date: string | null;
  max_marks: number;
  weight: number;
  marks: number | null;
  feedback: string | null;
  recorded_at: string | null;
};

export default function StudentAssignments() {
  return (
    <StudentEnrollmentPage title="Assignments">
      {(e) => <AssignmentList e={e} />}
    </StudentEnrollmentPage>
  );
}

function AssignmentList({ e }: { e: StudentEnrollment }) {
  const q = useApi<StudentAssessment[]>(`/student/enrollments/${e.id}/assessments`);
  return (
    <QueryView query={q}>
      {(items) =>
        items.length === 0 ? (
          <EmptyState icon={FileText} title="No assignments yet" description="Your trainer's assignments, tests and projects will appear here." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {items.map((a) => {
              const marked = a.marks !== null;
              return (
                <li key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <TypeBadge type={a.type} />
                    {marked ? (
                      <Pill tone="success">Marked: {Number(a.marks)} / {Number(a.max_marks)}</Pill>
                    ) : (
                      <Pill tone="neutral">Not marked yet</Pill>
                    )}
                  </div>
                  <p className="mt-2 font-semibold">{a.title}</p>
                  {a.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.description}</p>}
                  <p className="mt-3 text-sm text-muted-foreground">
                    {a.due_date ? `Due ${formatDate(a.due_date)}` : "No date set"} · Out of {Number(a.max_marks)} · Weight {Number(a.weight)}%
                  </p>
                  {a.feedback && (
                    <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                      <span className="font-semibold">Trainer feedback: </span>
                      {a.feedback}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )
      }
    </QueryView>
  );
}

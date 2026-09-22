import { CheckCircle2, Mail } from "lucide-react";
import { Facts, Section, StatusBadge } from "@/training/components/common";
import { StudentEnrollmentPage } from "@/training/features/student/useStudent";
import { formatDate, formatDays, formatDuration, formatTime } from "@/training/lib/format";

export default function StudentProgram() {
  return (
    <StudentEnrollmentPage title="My Program">
      {(e) => {
        const topics = e.course_content.split("\n").map((t) => t.trim()).filter(Boolean);
        return (
          <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
            <div className="space-y-6">
              <Section title={e.program_name} description={formatDuration(e.duration_value, e.duration_unit)}>
                <p className="text-sm leading-relaxed">{e.program_description || "No description yet."}</p>
                {topics.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-5 font-semibold">What you'll learn</h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {topics.map((t) => (
                        <li key={t} className="flex gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>
            </div>
            <div className="space-y-6">
              <Section title="Intake">
                <Facts
                  columns={1}
                  items={[
                    ["Intake", e.intake_name],
                    ["Training period", `${formatDate(e.training_starts_on)} – ${formatDate(e.training_ends_on)}`],
                    ["Location", e.location || "—"],
                    ["Enrolled on", formatDate(e.enrolled_on)],
                    ["Status", <StatusBadge key="s" status={e.status} />],
                  ]}
                />
              </Section>
              <Section title="Class & trainer">
                {e.class_code ? (
                  <Facts
                    columns={1}
                    items={[
                      ["Class", e.class_code],
                      ["Schedule", `${formatDays(e.meeting_days)}, ${formatTime(e.start_time)}–${formatTime(e.end_time)}`],
                      ["Room", e.room || "—"],
                      ["Trainer", e.trainer_name ?? "To be assigned"],
                      [
                        "Trainer email",
                        e.trainer_email ? (
                          <a key="m" href={`mailto:${e.trainer_email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Mail className="h-3.5 w-3.5" aria-hidden />{e.trainer_email}
                          </a>
                        ) : "—",
                      ],
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">You haven't been placed in a class yet. The office will let you know.</p>
                )}
              </Section>
            </div>
          </div>
        );
      }}
    </StudentEnrollmentPage>
  );
}

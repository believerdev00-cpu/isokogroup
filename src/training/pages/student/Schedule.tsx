import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/training/components/common";
import { StudentEnrollmentPage } from "@/training/features/student/useStudent";
import { Timetable } from "@/training/features/teaching/Timetable";
import { formatDate } from "@/training/lib/format";

export default function StudentSchedule() {
  return (
    <StudentEnrollmentPage title="My Schedule">
      {(e) =>
        !e.class_code || !e.meeting_days || !e.start_time || !e.end_time ? (
          <EmptyState icon={CalendarDays} title="No class schedule yet" description="Your timetable appears once you're placed in a class." />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Training runs from <strong className="text-foreground">{formatDate(e.training_starts_on)}</strong> to{" "}
              <strong className="text-foreground">{formatDate(e.training_ends_on)}</strong>. Today is highlighted.
            </p>
            <Timetable
              entries={[
                {
                  id: e.class_id!,
                  title: e.program_name,
                  subtitle: `${e.class_code}${e.trainer_name ? ` · ${e.trainer_name}` : ""}`,
                  room: e.room ?? undefined,
                  meeting_days: e.meeting_days,
                  start_time: e.start_time,
                  end_time: e.end_time,
                },
              ]}
            />
          </div>
        )
      }
    </StudentEnrollmentPage>
  );
}

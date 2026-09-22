import { CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, QueryView } from "@/training/components/common";
import { Timetable } from "@/training/features/teaching/Timetable";
import { useApi } from "@/training/lib/query";
import type { ClassSummary } from "@/training/lib/types";
import { plural } from "@/training/lib/format";

export default function TrainerSchedule() {
  const q = useApi<ClassSummary[]>("/trainer/schedule");
  return (
    <div>
      <PageHeader title="Today's Schedule" subtitle="Your weekly timetable. Today is highlighted." />
      <QueryView query={q}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No active classes" description="Your timetable will appear once a class is assigned to you." />
          ) : (
            <Timetable
              entries={list.map((c) => ({
                id: c.id,
                title: c.program_name,
                subtitle: `${c.code} · ${plural(c.student_count, "student")}`,
                room: c.room,
                meeting_days: c.meeting_days,
                start_time: c.start_time,
                end_time: c.end_time,
              }))}
              renderLink={(e, body) => (
                <Link to={`/training-center/trainer/classes/${e.id}`} className="block rounded-lg hover:ring-2 hover:ring-primary/30">
                  {body}
                </Link>
              )}
            />
          )
        }
      </QueryView>
    </div>
  );
}

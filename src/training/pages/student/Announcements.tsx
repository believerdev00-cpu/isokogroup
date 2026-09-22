import { PageHeader, QueryView } from "@/training/components/common";
import { AnnouncementList } from "@/training/features/teaching/Timetable";
import { useApi } from "@/training/lib/query";
import type { Announcement } from "@/training/lib/types";

export default function StudentAnnouncements() {
  const q = useApi<Announcement[]>("/student/announcements");
  return (
    <div>
      <PageHeader title="Announcements" subtitle="News from the training center, your intake and your class." />
      <QueryView query={q}>{(items) => <AnnouncementList items={items} />}</QueryView>
    </div>
  );
}

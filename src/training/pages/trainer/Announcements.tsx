import { PageHeader, QueryView } from "@/training/components/common";
import { AnnouncementList } from "@/training/features/teaching/Timetable";
import { useApi } from "@/training/lib/query";
import type { Announcement } from "@/training/lib/types";

export default function TrainerAnnouncements() {
  const q = useApi<Announcement[]>("/trainer/announcements");
  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="News from the training center, and what you've posted to your classes. To post to a class, open it and choose Post announcement."
      />
      <QueryView query={q}>{(items) => <AnnouncementList items={items} />}</QueryView>
    </div>
  );
}

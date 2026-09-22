import { PageHeader } from "@/training/components/common";
import ClassPicker from "@/training/features/teaching/ClassPicker";

export default function AdminAttendance() {
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Pick a class to take or correct attendance for any day, and see each student's attendance rate." />
      <ClassPicker role="admin" tab="attendance" />
    </div>
  );
}

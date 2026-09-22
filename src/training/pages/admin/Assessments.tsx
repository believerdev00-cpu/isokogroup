import { PageHeader } from "@/training/components/common";
import ClassPicker from "@/training/features/teaching/ClassPicker";

export default function AdminAssessments() {
  return (
    <div>
      <PageHeader title="Assessments" subtitle="Pick a class to create assignments, tests, exams and projects, and enter marks." />
      <ClassPicker role="admin" tab="assessments" />
    </div>
  );
}

import { PageHeader } from "@/training/components/common";
import ClassPicker from "@/training/features/teaching/ClassPicker";

export default function AdminResults() {
  return (
    <div>
      <PageHeader title="Results" subtitle="Pick a class to see every student's marks, final percentage, grade and pass or fail." />
      <ClassPicker role="admin" tab="results" />
    </div>
  );
}

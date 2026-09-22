import { CalendarCheck, ClipboardCheck, Layers, NotebookPen, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { QueryView } from "@/training/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/training/lib/query";
import AssessmentsTab from "./AssessmentsTab";
import AttendanceTab from "./AttendanceTab";
import LessonsTab from "./LessonsTab";
import ResultsTab from "./ResultsTab";
import StudentsTab from "./StudentsTab";
import type { ClassDetail } from "./types";

export type WorkspaceTab = "students" | "attendance" | "lessons" | "assessments" | "results";
const TABS: { key: WorkspaceTab; label: string; icon: typeof Users }[] = [
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "students", label: "Students", icon: Users },
  { key: "lessons", label: "Lessons", icon: NotebookPen },
  { key: "assessments", label: "Assessments", icon: ClipboardCheck },
  { key: "results", label: "Results", icon: Layers },
];

/**
 * Everything a trainer (or an admin) does with one class. The chosen tab is kept in
 * the URL (?tab=) so a reload or a shared link opens the same place.
 */
export default function ClassWorkspace({ classId, initialTab }: { classId: string; initialTab?: WorkspaceTab }) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tab") as WorkspaceTab | null;
  const tab: WorkspaceTab = fromUrl && TABS.some((t) => t.key === fromUrl) ? fromUrl : (initialTab ?? "attendance");
  const detail = useApi<ClassDetail>(`/classes/${classId}`);

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };

  return (
    <QueryView query={detail}>
      {(klass) => (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max gap-1 p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-3 py-2">
                  <t.icon className="h-4 w-4" aria-hidden />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="students" className="mt-4">
            <StudentsTab klass={klass} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-4">
            <AttendanceTab klass={klass} />
          </TabsContent>
          <TabsContent value="lessons" className="mt-4">
            <LessonsTab klass={klass} />
          </TabsContent>
          <TabsContent value="assessments" className="mt-4">
            <AssessmentsTab klass={klass} />
          </TabsContent>
          <TabsContent value="results" className="mt-4">
            <ResultsTab klass={klass} />
          </TabsContent>
        </Tabs>
      )}
    </QueryView>
  );
}

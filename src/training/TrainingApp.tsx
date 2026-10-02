import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes, useLocation } from "react-router-dom";
import { Loading } from "@/training/components/common";
import PortalLayout from "@/training/components/layout/PortalLayout";
import PublicLayout from "@/training/components/layout/PublicLayout";
import { ApiError } from "@/training/lib/api";
import { AuthProvider } from "@/training/lib/auth";

// The Isoko Training Center, mounted by the site at /training-center/*: its public
// pages (programs, intakes, applying, status, certificate checks) and the admin,
// trainer and student portals. Data comes from the "training" Edge Function.

// Each page is its own chunk. Lazy components are created once, here, so a
// re-render never remounts a page (which would drop its state).
const pages = import.meta.glob<{ default: React.ComponentType }>("./pages/**/*.tsx");
const lazyPages = new Map<string, React.LazyExoticComponent<React.ComponentType>>();
const page = (name: string) => {
  const key = `./pages/${name}.tsx`;
  if (!pages[key]) throw new Error(`Unknown page ${name}`);
  if (!lazyPages.has(key)) lazyPages.set(key, lazy(pages[key]));
  const C = lazyPages.get(key)!;
  return <C />;
};

function ScrollToTop() {
  const { pathname } = useLocation();
  // Braces matter: scrollTo returns a promise in newer browsers, and an effect must not return one
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry "not found" / "forbidden": they won't change on their own
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

export default function TrainingApp() {
  const [queryClient] = useState(newQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
          <ScrollToTop />
          <Routes>
            {/* Public pages */}
            <Route element={<PublicLayout />}>
              <Route index element={page("public/Home")} />
              <Route path="programs" element={page("public/Programs")} />
              <Route path="programs/:slug" element={page("public/ProgramDetail")} />
              <Route path="intakes" element={page("public/Intakes")} />
              <Route path="intakes/:slug" element={page("public/IntakeDetail")} />
              <Route path="about" element={page("public/About")} />
              <Route path="contact" element={page("public/Contact")} />
              <Route path="apply" element={page("public/Apply")} />
              <Route path="application-status" element={page("public/ApplicationStatus")} />
              <Route path="pay/:token" element={page("public/Pay")} />
              <Route path="verify" element={page("public/Verify")} />
              <Route path="verify/:code" element={page("public/Verify")} />
              <Route path="login" element={page("Login")} />
              <Route path="change-password" element={page("ChangePassword")} />
              <Route path="*" element={page("NotFound")} />
            </Route>

            {/* Administration */}
            <Route path="admin" element={<PortalLayout role="admin" />}>
              <Route index element={page("admin/Dashboard")} />
              <Route path="search" element={page("admin/Search")} />
              <Route path="intakes" element={page("admin/Intakes")} />
              <Route path="intakes/new" element={page("admin/IntakeForm")} />
              <Route path="intakes/:id" element={page("admin/IntakeDetail")} />
              <Route path="intakes/:id/edit" element={page("admin/IntakeForm")} />
              <Route path="programs" element={page("admin/Programs")} />
              <Route path="programs/new" element={page("admin/ProgramForm")} />
              <Route path="programs/:id" element={page("admin/ProgramForm")} />
              <Route path="applications" element={page("admin/Applications")} />
              <Route path="applications/:id" element={page("admin/ApplicationDetail")} />
              <Route path="students" element={page("admin/Students")} />
              <Route path="students/new" element={page("admin/AddStudent")} />
              <Route path="students/:id" element={page("admin/StudentProfile")} />
              <Route path="classes" element={page("admin/Classes")} />
              <Route path="classes/new" element={page("admin/ClassForm")} />
              <Route path="classes/:id" element={page("admin/ClassDetail")} />
              <Route path="trainers" element={page("admin/Trainers")} />
              <Route path="attendance" element={page("admin/Attendance")} />
              <Route path="payments" element={page("admin/Payments")} />
              <Route path="assessments" element={page("admin/Assessments")} />
              <Route path="results" element={page("admin/Results")} />
              <Route path="certificates" element={page("admin/Certificates")} />
              <Route path="reports" element={page("admin/Reports")} />
              <Route path="announcements" element={page("admin/Announcements")} />
              <Route path="settings" element={page("admin/Settings")} />
            </Route>

            {/* Trainers */}
            <Route path="trainer" element={<PortalLayout role="trainer" />}>
              <Route index element={page("trainer/Dashboard")} />
              <Route path="classes" element={page("trainer/Classes")} />
              <Route path="classes/:id" element={page("trainer/ClassPage")} />
              <Route path="schedule" element={page("trainer/Schedule")} />
              <Route path="attendance" element={page("trainer/Attendance")} />
              <Route path="assessments" element={page("trainer/Assessments")} />
              <Route path="results" element={page("trainer/Results")} />
              <Route path="announcements" element={page("trainer/Announcements")} />
            </Route>

            {/* Students */}
            <Route path="student" element={<PortalLayout role="student" />}>
              <Route index element={page("student/Dashboard")} />
              <Route path="program" element={page("student/Program")} />
              <Route path="schedule" element={page("student/Schedule")} />
              <Route path="attendance" element={page("student/Attendance")} />
              <Route path="assignments" element={page("student/Assignments")} />
              <Route path="results" element={page("student/Results")} />
              <Route path="payments" element={page("student/Payments")} />
              <Route path="certificate" element={page("student/Certificate")} />
              <Route path="announcements" element={page("student/Announcements")} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}

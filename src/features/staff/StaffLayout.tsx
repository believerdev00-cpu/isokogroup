import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, BarChart3, Briefcase, Clapperboard, Plane } from "lucide-react";
import logo from "@/assets/isoko-logo.jpeg";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/features/services/ui";
import { useStaffAccess, type StaffArea } from "./access";

export const SERVICE_NAV: Record<StaffArea, { label: string; to: string; icon: typeof Plane; active: string }> = {
  travel: { label: "Travel", to: "/staff/travel", icon: Plane, active: "bg-emerald-700 text-white" },
  consultancy: { label: "Consultancy", to: "/staff/consultancy", icon: Briefcase, active: "bg-blue-800 text-white" },
  data: { label: "Data Analysis", to: "/staff/data", icon: BarChart3, active: "bg-indigo-700 text-white" },
  entertainment: { label: "Media", to: "/staff/media", icon: Clapperboard, active: "bg-red-700 text-white" },
};

/**
 * Isoko staff workspace for the client services. Each person sees only the
 * services they work on; the database enforces the same boundary.
 */
export default function StaffLayout() {
  const access = useStaffAccess();
  const { pathname } = useLocation();

  if (access.loading) return <PageLoading />;
  if (!access.signedIn) return <Navigate to="/login" replace />;
  if (access.services.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">No workspace access</h1>
        <p className="mt-2 text-muted-foreground">Your account isn't staff of Travel, Consultancy, Data Analysis or Media. Ask an Isoko administrator.</p>
        <Link to="/" className="mt-6 inline-block text-primary underline">Back to Isoko</Link>
      </div>
    );
  }
  const current = access.services.find((s) => pathname.startsWith(SERVICE_NAV[s].to));
  if (!current) return <Navigate to={SERVICE_NAV[access.services[0]].to} replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Back to the Isoko site">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <img src={logo} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="hidden font-bold sm:inline">Isoko Workspace</span>
          </Link>
          <nav className="ml-auto flex gap-1 overflow-x-auto" aria-label="Services">
            {access.services.map((s) => {
              const n = SERVICE_NAV[s];
              return (
                <NavLink
                  key={s}
                  to={n.to}
                  className={({ isActive }) => cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", isActive ? n.active : "text-muted-foreground hover:bg-muted")}
                >
                  <n.icon className="h-4 w-4" />
                  <span className={cn(access.services.length > 2 && "hidden sm:inline")}>{n.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <Outlet />
    </div>
  );
}

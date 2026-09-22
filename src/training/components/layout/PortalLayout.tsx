import { useState, type FormEvent } from "react";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  School,
  Search,
  Settings,
  UserCog,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Brand, Loading } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/training/lib/api";
import { HOME_FOR, useAuth, type Role } from "@/training/lib/auth";
import { formatDateTime, initials } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Notification } from "@/training/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

// Each role sees only its own menu; the server enforces the same boundaries.
export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: "/training-center/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/training-center/admin/intakes", label: "Intakes", icon: CalendarDays },
    { to: "/training-center/admin/programs", label: "Programs", icon: BookOpen },
    { to: "/training-center/admin/applications", label: "Applications", icon: ClipboardList },
    { to: "/training-center/admin/students", label: "Students", icon: GraduationCap },
    { to: "/training-center/admin/classes", label: "Classes", icon: School },
    { to: "/training-center/admin/trainers", label: "Trainers", icon: UserCog },
    { to: "/training-center/admin/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/training-center/admin/payments", label: "Payments", icon: CreditCard },
    { to: "/training-center/admin/assessments", label: "Assessments", icon: ClipboardCheck },
    { to: "/training-center/admin/results", label: "Results", icon: Layers },
    { to: "/training-center/admin/certificates", label: "Certificates", icon: Award },
    { to: "/training-center/admin/reports", label: "Reports", icon: BarChart3 },
    { to: "/training-center/admin/announcements", label: "Announcements", icon: Megaphone },
    { to: "/training-center/admin/settings", label: "Settings", icon: Settings },
  ],
  trainer: [
    { to: "/training-center/trainer", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/training-center/trainer/classes", label: "My Classes", icon: School },
    { to: "/training-center/trainer/schedule", label: "Today's Schedule", icon: CalendarDays },
    { to: "/training-center/trainer/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/training-center/trainer/assessments", label: "Assessments", icon: ClipboardCheck },
    { to: "/training-center/trainer/results", label: "Results", icon: Layers },
    { to: "/training-center/trainer/announcements", label: "Announcements", icon: Megaphone },
  ],
  student: [
    { to: "/training-center/student", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/training-center/student/program", label: "My Program", icon: BookOpen },
    { to: "/training-center/student/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/training-center/student/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/training-center/student/assignments", label: "Assignments", icon: FileText },
    { to: "/training-center/student/results", label: "Results", icon: Layers },
    { to: "/training-center/student/payments", label: "Payments", icon: CreditCard },
    { to: "/training-center/student/certificate", label: "Certificate", icon: Award },
    { to: "/training-center/student/announcements", label: "Announcements", icon: Megaphone },
  ],
};

const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", trainer: "Trainer", student: "Student" };

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Portal">
      {NAV[role].map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white",
              isActive && "bg-white/10 text-white",
            )
          }
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function NotificationsBell() {
  const q = useApi<{ items: Notification[]; unread: number }>("/notifications", { refetchInterval: 60_000 });
  const navigate = useNavigate();
  const unread = q.data?.unread ?? 0;
  return (
    <Popover
      onOpenChange={(open) => {
        if (open && unread > 0) api.post("/notifications/read-all").then(() => q.refetch());
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,22rem)] p-0">
        <p className="border-b px-4 py-3 text-sm font-semibold">Notifications</p>
        <div className="max-h-96 overflow-y-auto">
          {(q.data?.items ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            q.data!.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => n.link && navigate(n.link.startsWith("/") ? `/training-center${n.link}` : n.link)}
                className={cn("block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-muted", !n.read_at && "bg-secondary/50")}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AdminSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 2) navigate(`/training-center/admin/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form onSubmit={submit} role="search" className={cn("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, student no., phone, application no."
        aria-label="Search students and applications"
        className="pl-9"
      />
    </form>
  );
}

/** Protects a portal: signed in, right role, password already changed. */
export default function PortalLayout({ role }: { role: Role }) {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/training-center/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.must_change_password) return <Navigate to="/training-center/change-password" replace />;
  if (user.role !== role) return <Navigate to={HOME_FOR[user.role]} replace />;

  const logout = async () => {
    await signOut();
    navigate("/training-center/login");
  };

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-zinc-950 text-zinc-100 lg:flex">
        <Link to={HOME_FOR[role]} className="flex h-16 items-center px-6">
          <Brand light />
        </Link>
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav role={role} />
        </div>
        <p className="px-6 py-4 text-xs text-zinc-400">{ROLE_LABEL[role]} portal</p>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-0 bg-zinc-950 p-0 text-zinc-100">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-16 items-center px-6">
              <Brand light />
            </div>
            <div className="h-[calc(100%-4rem)] overflow-y-auto pb-6">
              <SidebarNav role={role} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        {role === "admin" ? <AdminSearch className="hidden sm:block" /> : <span className="font-semibold lg:hidden">{ROLE_LABEL[role]} portal</span>}
        <div className="ml-auto flex items-center gap-1">
          {role === "admin" && (
            <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Search">
              <Link to="/training-center/admin/search"><Search className="h-5 w-5" /></Link>
            </Button>
          )}
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {initials(user.full_name)}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium md:inline">{user.full_name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate">{user.full_name}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{user.student_number ?? user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/training-center/change-password"><KeyRound className="mr-2 h-4 w-4" />Change password</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

// Shared by the Information Hub desk pages: the kinds of items, the section
// navigation and the page shell.
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { BookOpenCheck, ClipboardCheck, DownloadCloud, ExternalLink, Globe2, HelpCircle, Layers, MapPinned, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StaffPage } from "../common";

export const KINDS: [string, string][] = [
  ["statistic", "Statistic"], ["research", "Research"], ["study", "Study"], ["report", "Report"],
  ["finding", "Finding"], ["dataset", "Dataset"], ["survey", "Survey"],
];
export const KIND_LABEL = Object.fromEntries(KINDS) as Record<string, string>;

export const RESEARCH_BUCKET = "research";
export const MAX_DOC_MB = 25;

export const NAV = [
  { to: "/staff/research", label: "Overview", icon: BookOpenCheck, end: true },
  { to: "/staff/research/items", label: "Items", icon: Layers },
  { to: "/staff/research/review", label: "Review queue", icon: ClipboardCheck },
  { to: "/staff/research/imports", label: "Imports", icon: DownloadCloud },
  { to: "/staff/research/topics", label: "Topics", icon: Tags },
  { to: "/staff/research/countries", label: "Countries", icon: Globe2 },
  { to: "/staff/research/regions", label: "Regions", icon: MapPinned },
  { to: "/staff/research/questions", label: "Questions", icon: HelpCircle },
];

export function Shell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <StaffPage
      title={title}
      subtitle={subtitle}
      nav={
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Research sections">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to="/research" target="_blank"><ExternalLink className="h-4 w-4" /> View the hub</Link></Button>
        </div>
      }
    >
      {children}
    </StaffPage>
  );
}

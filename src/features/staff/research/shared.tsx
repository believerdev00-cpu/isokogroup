// Shared by the Information Hub desk pages: the kinds of items, the section
// navigation and the page shell.
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { BookOpenCheck, ClipboardCheck, DownloadCloud, ExternalLink, Globe2, HelpCircle, Layers, MapPinned, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEDIA_ACCEPT, isMediaFile } from "@/lib/mediaKind";
import { uploadLimitMb } from "@/lib/uploadLimits";
import { StaffPage } from "../common";

export const KINDS: [string, string][] = [
  ["statistic", "Statistic"], ["research", "Research"], ["study", "Study"], ["report", "Report"],
  ["finding", "Finding"], ["dataset", "Dataset"], ["survey", "Survey"],
];
export const KIND_LABEL = Object.fromEntries(KINDS) as Record<string, string>;

export const RESEARCH_BUCKET = "research";
export const MAX_DOC_MB = uploadLimitMb("research");

/**
 * What an item's supporting file may be.
 *
 * Evidence is not only paperwork. A survey has photographs of the site, an
 * interview exists as a recording and nothing else, and a field visit is a
 * video. Those were refused here while the rest of the site had already been
 * opened up to them -- and worse, the file picker offered them, so somebody
 * chose a photograph and was told to choose a PDF.
 *
 * The browser's type is a convenience, not the rule: the bucket's
 * allowed_mime_types decides on the server, and it does not trust a file name.
 * Windows reports no type at all for some files, which is why an empty type
 * falls through to the extension rather than being refused outright.
 */
export const DOC_MIMES = [
  "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/json", "text/plain",
];

export const DOC_ACCEPT = `.pdf,.csv,.xlsx,.xls,.docx,.zip,.json,.txt,${MEDIA_ACCEPT}`;

export const RESEARCH_FILE_HINT =
  `PDF, CSV, Excel, Word, ZIP, JSON or text · pictures, video and audio · up to ${MAX_DOC_MB} MB`;

/** The reason this file cannot be attached, or null when it can. */
export function researchFileError(file: { name: string; type: string; size: number }): string | null {
  if (!DOC_MIMES.includes(file.type) && !isMediaFile(file)) {
    return "Choose a PDF, CSV, Excel, Word, ZIP, JSON or text file, or a picture, video or audio file.";
  }
  if (file.size > MAX_DOC_MB * 1024 * 1024) return `Files must be under ${MAX_DOC_MB} MB.`;
  return null;
}

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

import { useState, type ReactNode } from "react";
import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import logo from "@/assets/isoko-logo.jpeg";
import { humanize } from "@/training/lib/format";

// ============== BRAND ==============
export function Brand({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-extrabold tracking-tight", className)}>
      <img src={logo} alt="" className="h-9 w-9 rounded-lg object-cover" />
      <span className="leading-tight">
        <span className={cn("block text-[15px]", light ? "text-white" : "text-primary")}>ISOKO</span>
        <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.14em]", light ? "text-white/70" : "text-muted-foreground")}>
          Training Center
        </span>
      </span>
    </span>
  );
}

// ============== STATUS BADGES ==============
type Tone = "success" | "warning" | "info" | "danger" | "neutral" | "gold" | "primary";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  info: "bg-info-soft text-info border-info/20",
  danger: "bg-danger-soft text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
  gold: "bg-gold-soft text-accent-foreground border-gold/30",
  primary: "bg-secondary text-primary border-primary/20",
};

// One colour language for every status in the system
const STATUS_TONE: Record<string, Tone> = {
  // intakes
  draft: "neutral", upcoming: "info", open: "success", full: "warning", closed: "neutral", completed: "primary", archived: "neutral",
  // applications
  pending: "warning", under_review: "info", approved: "success", rejected: "danger", waitlisted: "gold", withdrawn: "neutral",
  // enrollments & classes
  active: "success", cancelled: "neutral",
  // payments
  paid: "success", partially_paid: "warning", outstanding: "danger", void: "neutral",
  // attendance
  present: "success", late: "warning", absent: "danger", excused: "info",
  // results & certificates
  pass: "success", fail: "danger", in_progress: "info", valid: "success", revoked: "danger", eligible: "success", not_eligible: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  full: "Full",
  under_review: "Under review",
  partially_paid: "Partially paid",
  not_eligible: "Not yet eligible",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {label ?? STATUS_LABEL[status] ?? humanize(status)}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

// ============== PAGE STRUCTURE ==============
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex text-sm font-medium text-muted-foreground hover:text-primary">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 md:flex-1">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 md:justify-end xl:flex-nowrap">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Tells the user what to do next instead of showing an empty table. */
export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-danger-soft px-6 py-10 text-center" role="alert">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="font-medium text-destructive">{message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loading/error states for a query, then the children with its data. */
export function QueryView<T>({ query, children }: { query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (data: T) => ReactNode }) {
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

// ============== NUMBERS ==============
export function StatCard({ label, value, hint, icon: Icon, to, tone = "primary" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; to?: string; tone?: "primary" | "gold" | "danger" }) {
  const body = (
    <div className={cn("h-full rounded-xl border bg-card p-4 shadow-sm transition-colors", to && "hover:border-primary/40 hover:bg-secondary/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className={cn("h-5 w-5 shrink-0", tone === "gold" ? "text-gold" : tone === "danger" ? "text-destructive" : "text-primary")}
            aria-hidden
          />
        )}
      </div>
      <p className="tabular mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

/** "27 / 30 seats" with a bar; turns amber when nearly full and shows FULL at capacity. */
export function SeatsMeter({ enrolled, capacity, compact = false }: { enrolled: number; capacity: number; compact?: boolean }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  const full = enrolled >= capacity;
  const nearly = !full && pct >= 85;
  return (
    <div className={cn("w-full", compact ? "space-y-1" : "space-y-1.5")}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="tabular font-semibold">
          {enrolled} / {capacity}
          {!compact && <span className="font-normal text-muted-foreground"> enrolled</span>}
        </span>
        {full ? (
          <StatusBadge status="full" label="FULL" />
        ) : (
          <span className={cn("tabular text-xs font-medium", nearly ? "text-warning" : "text-muted-foreground")}>
            {capacity - enrolled} {capacity - enrolled === 1 ? "seat" : "seats"} left
          </span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={enrolled}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label="Seats taken"
      >
        <div className={cn("h-full rounded-full", full ? "bg-warning" : nearly ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="progress-fill h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </div>
      <span className="tabular w-11 text-right text-xs font-semibold">{value === null ? "—" : `${Math.round(v)}%`}</span>
    </div>
  );
}

/** Key facts in a definition list, two columns on wider screens. */
export function Facts({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal scroll wrapper so tables never break the page on phones. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto sm:mx-0">{children}</div>;
}

// ============== CONFIRMATION ==============
type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Ask for a note (e.g. a reason); required when noteRequired. */
  noteLabel?: string;
  noteRequired?: boolean;
  pending?: boolean;
  onConfirm: (note: string) => void;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, noteLabel, noteRequired, pending, onConfirm }: ConfirmProps) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNote("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        {noteLabel && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-note">{noteLabel}</Label>
            <Textarea id="confirm-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || (noteRequired && note.trim().length < 3)}
            onClick={() => onConfirm(note.trim())}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== FORMS ==============
export function Field({ label, htmlFor, hint, error, required, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        props.className,
      )}
    />
  );
}

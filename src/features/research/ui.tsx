import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, BadgeCheck, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { coverUrl, formatDate, HUB, kindOne, rememberSearch, searchPath, type SearchRow } from "./api";

// Shared pieces of the Information Hub: the search box, cards, chips,
// loading skeletons and the empty and error states.

export function HubSearchBox({ initial = "", size = "md", autoFocus, placeholder, className }: { initial?: string; size?: "md" | "lg"; autoFocus?: boolean; placeholder?: string; className?: string }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    rememberSearch(query);
    navigate(searchPath(query));
  };
  const big = size === "lg";
  return (
    <form onSubmit={submit} role="search" className={cn("flex w-full items-stretch gap-2", className)}>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search className={cn("pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground", big ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          maxLength={300}
          enterKeyHint="search"
          placeholder={placeholder ?? "Search Rwanda, research, statistics, reports, studies and more…"}
          className={cn(
            "w-full rounded-full border border-border bg-background text-foreground shadow-sm outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-4",
            big ? "h-14 pl-12 pr-4 text-base sm:text-lg" : "h-11 pl-10 pr-4 text-sm",
          )}
        />
      </label>
      <Button type="submit" size={big ? "lg" : "default"} className={cn("shrink-0 rounded-full", big ? "h-14 px-6 text-base" : "h-11 px-5")}>
        Search
      </Button>
    </form>
  );
}

export function Chip({ to, children, active, className }: { to: string; children: ReactNode; active?: boolean; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50 hover:text-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary", className)}>{kindOne(kind)}</span>;
}

/** Shown only when staff marked the item verified; nothing is claimed otherwise. */
export function VerifiedBadge({ verification, className }: { verification: string; className?: string }) {
  if (verification !== "verified") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400", className)}>
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
    </span>
  );
}

export function DemoBadge({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return <span className="inline-flex items-center rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-black">Demo</span>;
}

export function ItemCard({ item, className }: { item: Pick<SearchRow, "slug" | "kind" | "title" | "summary" | "country_name" | "topic_name" | "published_on" | "verification"> & Partial<SearchRow>; className?: string }) {
  const cover = coverUrl(item.cover_path);
  const meta = [item.country_name, item.topic_name, formatDate(item.published_on)].filter(Boolean).join(" · ");
  return (
    <Link to={`${HUB}/${item.slug}`} className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md", className)}>
      {cover && <img src={cover} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={item.kind} />
          <VerifiedBadge verification={item.verification} />
          <DemoBadge demo={!!item.is_demo} />
        </div>
        <h3 className="mt-2 font-display text-lg font-bold leading-snug group-hover:text-primary">{item.title}</h3>
        {item.summary && <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>}
        {meta && <p className="mt-auto pt-3 text-xs text-muted-foreground">{meta}</p>}
      </div>
    </Link>
  );
}

export function ItemRow({ item }: { item: Pick<SearchRow, "slug" | "kind" | "title" | "summary" | "country_name" | "topic_name" | "published_on" | "verification"> & Partial<SearchRow> }) {
  const meta = [item.country_name, item.topic_name, formatDate(item.published_on)].filter(Boolean).join(" · ");
  return (
    <Link to={`${HUB}/${item.slug}`} className="group block rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={item.kind} />
        <VerifiedBadge verification={item.verification} />
        <DemoBadge demo={!!item.is_demo} />
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      <h3 className="mt-1.5 font-display text-lg font-bold leading-snug group-hover:text-primary">{item.title}</h3>
      {item.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}
    </Link>
  );
}

export function SectionHeading({ title, text, to, toLabel = "See all", children }: { title: string; text?: string; to?: string; toLabel?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        {text && <p className="mt-1 text-muted-foreground">{text}</p>}
      </div>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {toLabel} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
      {children}
    </div>
  );
}

export function CardSkeletons({ n = 3, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-6 w-4/5" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function RowSkeletons({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-6 w-3/4" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", text, children, icon: Icon = SearchX }: { title?: string; text?: string; children?: ReactNode; icon?: typeof SearchX }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <Icon className="h-9 w-9 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center" role="alert">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="mt-3 font-semibold">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message ?? "We could not load this right now."}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pages">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

/** A small crumb row inside the hub (the site header has the service-level trail). */
export function HubCrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Where you are" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          {c.to ? <Link to={c.to} className="hover:text-primary">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Plain text as paragraphs; "## " lines become headings, "- " lines become bullets. No HTML is ever interpreted. */
export function TextBody({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={cn("space-y-4 leading-relaxed", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^- /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^- /, "")}</li>)}
            </ul>
          );
        }
        if (lines.length === 1 && /^## /.test(block)) {
          return <h2 key={i} className="font-display text-xl font-bold">{block.replace(/^## /, "")}</h2>;
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {l}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLiteMotion } from "@/lib/motion";

// Small, purposeful animation building blocks shared across the platform.

/** A number that counts up once when it first appears (dashboard figures). */
export function CountUp({ value, duration = 900, format = (n: number) => n.toLocaleString("en-US") }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(isLiteMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (isLiteMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

/** Placeholder blocks shown while a page or list loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-lg", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="container max-w-5xl py-12" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}
      </div>
    </div>
  );
}

/**
 * A short workflow whose steps light up one after another, e.g.
 * Product → Packed → Branded → Delivered. Shows how a service works at a glance.
 */
export function FlowSteps({ steps, className, activeClass = "bg-primary text-primary-foreground" }: { steps: { icon: LucideIcon; label: string }[]; className?: string; activeClass?: string }) {
  const cycle = 4.8;
  return (
    <ol className={cn("flex flex-wrap items-center justify-center gap-2 sm:gap-3", className)}>
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2 sm:gap-3">
          <div className="flow-step flex flex-col items-center gap-1.5" style={{ animationDelay: `${(i * cycle) / steps.length}s` }}>
            <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm", activeClass)}>
              <s.icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-xs font-semibold">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="mb-5 h-4 w-4 text-muted-foreground" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** A bar that fills to its value when shown (learning, reading, journey progress). */
export function ProgressFill({ value, className, barClass = "bg-primary", label }: { value: number; className?: string; barClass?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("progress-fill h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Adds a small bump each time `value` changes (cart counts, badges). */
export function Bump({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const [key, setKey] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setKey((k) => k + 1);
  }, [value]);
  return <span key={key} className={cn(key > 0 && "bump", "inline-flex", className)}>{children}</span>;
}

/** A live list where new entries slide in at the top. */
export function ActivityFeed({ items, empty = "Nothing yet." }: { items: { id: string; icon?: LucideIcon; text: ReactNode; time: string; tone?: string }[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative space-y-3 border-l pl-5">
      {items.map((it) => (
        <li key={it.id} className="feed-in relative">
          <span className={cn("absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-card", it.tone ?? "bg-primary")} aria-hidden />
          <p className="text-sm">{it.text}</p>
          <p className="text-xs text-muted-foreground">{it.time}</p>
        </li>
      ))}
    </ol>
  );
}

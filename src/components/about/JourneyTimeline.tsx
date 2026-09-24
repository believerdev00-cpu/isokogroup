import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Flag,
  GraduationCap,
  Layers,
  MonitorSmartphone,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Milestone = { year: string; title: string; icon: LucideIcon; text: string; focus: string[] };

const MILESTONES: Milestone[] = [
  {
    year: "2017",
    title: "Foundation",
    icon: Flag,
    text: "ISOKO started as a small business in Kigali, learning how the local market works.",
    focus: ["Business establishment", "Market understanding", "Entrepreneurship"],
  },
  {
    year: "2018–2019",
    title: "Market Experience",
    icon: Store,
    text: "Years of trading built our product knowledge and a loyal customer base.",
    focus: ["Trading", "Products", "Customers", "Market research"],
  },
  {
    year: "2021",
    title: "Logistics & Supply Chain",
    icon: Truck,
    text: "We began moving goods for others: pickups, deliveries, sourcing and packaging.",
    focus: ["Deliveries", "Sourcing", "Packaging"],
  },
  {
    year: "2023",
    title: "Business Integration",
    icon: Layers,
    text: "Our services came together as ISOKO GROUP, with one team and one standard.",
    focus: ["One brand", "Shared operations", "Online marketplace"],
  },
  {
    year: "2024",
    title: "Media & Creative",
    icon: Clapperboard,
    text: "Isoko Studioz began producing films, shorts and podcasts.",
    focus: ["Film & video", "Podcasts", "Creative content"],
  },
  {
    year: "2025",
    title: "Training & Knowledge",
    icon: GraduationCap,
    text: "We opened learning to everyone with the E-Library and hands-on training.",
    focus: ["Isoko Training Center", "E-Library", "Practical skills"],
  },
  {
    year: "2026",
    title: "Digital Transformation",
    icon: MonitorSmartphone,
    text: "Every ISOKO service now runs on one digital platform, from ordering to tracking.",
    focus: ["One online platform", "Software & apps", "Online tracking"],
  },
];

const LAST = MILESTONES.length - 1;

/**
 * ISOKO GROUP's journey from 2017 to 2026: a track of milestones that draws
 * itself in when it scrolls into view. Choosing a year opens its card.
 */
export default function JourneyTimeline() {
  const [active, setActive] = useState<number | null>(0);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the chosen year visible on small screens, where the track scrolls
  const select = (i: number) => {
    setActive(i);
    tabRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? Math.min(LAST, i + 1) : e.key === "ArrowLeft" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? LAST : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const current = active === null ? null : MILESTONES[active];
  // How far the red line has travelled along the track
  const progress = inView ? ((active ?? 0) / LAST) * 100 : 0;

  return (
    <section ref={sectionRef} className="py-16 md:py-20" aria-labelledby="journey-title">
      <div className="container max-w-5xl">
        <div className="mb-10 space-y-3 text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">ISOKO GROUP LTD</span>
          <h2 id="journey-title" className="text-3xl font-display font-bold md:text-4xl">Our Journey: <span className="whitespace-nowrap">2017–2026</span></h2>
          <p className="mx-auto max-w-xl text-muted-foreground">From Vision to an Integrated Business Platform</p>
        </div>

        {/* The track: scrolls sideways on small screens */}
        <div className="-mx-4 snap-x overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0">
          <div className="relative min-w-[680px] md:min-w-0">
            {/* Base line and the red progress line, both behind the year markers */}
            <div aria-hidden className="absolute left-[7%] right-[7%] top-6 h-1 rounded-full bg-border" />
            <div aria-hidden className="absolute left-[7%] right-[7%] top-6 h-1">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div role="tablist" aria-label="Milestones from 2017 to 2026" className="relative grid grid-cols-7">
              {MILESTONES.map((m, i) => {
                const selected = active === i;
                const reached = active !== null && i <= active;
                return (
                  <button
                    key={m.year}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`journey-tab-${i}`}
                    aria-selected={selected}
                    aria-controls="journey-panel"
                    tabIndex={selected || (active === null && i === 0) ? 0 : -1}
                    onClick={() => (selected ? setActive(null) : select(i))}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={cn(
                      "group flex snap-center flex-col items-center gap-2 rounded-xl px-1 pb-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      inView ? "fade-in-up" : "opacity-0",
                    )}
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300",
                        selected
                          ? "scale-110 border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                          : reached
                            ? "border-primary bg-card text-primary"
                            : "border-border bg-card text-muted-foreground group-hover:border-primary/60 group-hover:text-primary",
                      )}
                    >
                      <m.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className={cn("font-display text-sm font-bold md:text-base", selected ? "text-primary" : "text-foreground")}>{m.year}</span>
                    <span className="max-w-[8rem] text-xs leading-snug text-muted-foreground">{m.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* The chosen milestone */}
        <div id="journey-panel" role="tabpanel" aria-labelledby={active === null ? undefined : `journey-tab-${active}`} className="mt-6">
          {current && active !== null ? (
            <article key={active} className="fade-in-up mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <current.icon className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold text-primary">{current.year}</p>
                  <h3 className="text-lg font-semibold">{current.title}</h3>
                </div>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {active + 1} / {MILESTONES.length}
                </span>
              </div>
              <p className="mt-4 leading-relaxed text-muted-foreground">{current.text}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key focus areas</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {current.focus.map((f) => (
                  <li key={f} className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="ghost" size="sm" className="gap-1.5" disabled={active === 0} onClick={() => select(active - 1)}>
                  <ArrowLeft className="h-4 w-4" /> {active > 0 ? MILESTONES[active - 1].year : "Previous"}
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5" disabled={active === LAST} onClick={() => select(active + 1)}>
                  {active < LAST ? MILESTONES[active + 1].year : "Next"} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Choose a year to see what happened.</p>
          )}
        </div>
      </div>
    </section>
  );
}

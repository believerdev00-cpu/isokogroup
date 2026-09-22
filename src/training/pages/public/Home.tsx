import { ArrowRight, BadgeCheck, CalendarDays, ClipboardList, GraduationCap, Hammer, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useCenter } from "@/training/components/layout/PublicLayout";
import { StatusBadge } from "@/training/components/common";
import { Button } from "@/components/ui/button";
import { goldButton, ProgramCard } from "@/training/features/public/shared";
import { formatLongDate } from "@/training/lib/format";
import { useApi } from "@/training/lib/query";
import type { Program, PublicIntake } from "@/training/lib/types";

const STEPS = [
  { icon: CalendarDays, title: "Choose an intake", text: "See which intakes are open and pick the program that fits you." },
  { icon: ClipboardList, title: "Apply online", text: "Fill in one short form. No account needed. You get an application number." },
  { icon: BadgeCheck, title: "Get approved", text: "We review your application and send your student number and portal login." },
];

export default function Home() {
  const currency = useCenter().data?.currency ?? "RWF";
  const intakes = useApi<PublicIntake[]>("/public/intakes");
  const programs = useApi<Program[]>("/public/programs");
  const open = intakes.data?.[0];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-primary/60 blur-3xl" />
          <div className="absolute -right-10 -top-16 h-80 w-80 rounded-full bg-gold/25 blur-3xl" />
          <svg className="absolute bottom-0 right-0 h-full w-1/2 opacity-10" viewBox="0 0 200 200" preserveAspectRatio="xMaxYMax slice">
            <defs>
              <pattern id="kitenge" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M12 0 24 12 12 24 0 12Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="200" height="200" fill="url(#kitenge)" />
          </svg>
        </div>
        <div className="container relative py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Kigali · Rwanda</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">ISOKO TRAINING CENTER</h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-100/85 sm:text-xl">Practical skills. Real opportunities.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className={goldButton}>
              <Link to="/training-center/apply">Apply Now</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/training-center/intakes">See available intakes</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Open intake teaser */}
      <section className="container -mt-8 relative">
        <div className="rounded-2xl border bg-card p-5 shadow-md sm:p-6">
          {intakes.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking open intakes…</p>
          ) : open ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{open.name}</h2>
                  <StatusBadge status="open" label="Applications Open" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {open.programs.length} {open.programs.length === 1 ? "program" : "programs"} · Apply by{" "}
                  <span className="font-semibold text-foreground">{formatLongDate(open.application_closes_on)}</span> · Training starts{" "}
                  {formatLongDate(open.training_starts_on)}
                  {intakes.data!.length > 1 && ` · ${intakes.data!.length - 1} more open`}
                </p>
              </div>
              <Button asChild>
                <Link to="/training-center/intakes">
                  View programs <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No intake is open for applications right now. Check back soon, or{" "}
              <Link to="/training-center/contact" className="font-semibold text-primary hover:underline">contact us</Link> to hear about the next one.
            </p>
          )}
        </div>
      </section>

      {/* Why Isoko */}
      <section className="container py-14">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Hammer, title: "Hands-on", text: "You learn by doing: real projects from the first week." },
            { icon: Users, title: "Small classes", text: "Trainers know every student and follow your progress." },
            { icon: GraduationCap, title: "Recognised certificate", text: "Every certificate can be verified online by employers." },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <f.icon className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Programs */}
      {programs.data && programs.data.length > 0 && (
        <section className="border-y bg-secondary/40 py-14">
          <div className="container">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Our programs</h2>
                <p className="mt-1 text-muted-foreground">Short, focused training for skills employers need.</p>
              </div>
              <Link to="/training-center/programs" className="hidden shrink-0 text-sm font-semibold text-primary hover:underline sm:inline">
                All programs →
              </Link>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {programs.data.slice(0, 3).map((p) => (
                <ProgramCard key={p.id} program={p} currency={currency} />
              ))}
            </div>
            <Link to="/training-center/programs" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline sm:hidden">
              All programs →
            </Link>
          </div>
        </section>
      )}

      {/* How to join */}
      <section className="container py-14">
        <h2 className="text-2xl font-bold">How to join</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <s.icon className="h-5 w-5 text-gold" aria-hidden />
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Button asChild size="lg" className={goldButton}>
            <Link to="/training-center/apply">Start your application</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

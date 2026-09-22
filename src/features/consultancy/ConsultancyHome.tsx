import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, ClipboardCheck, FileSignature, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOfferings } from "@/features/services/api";
import { ServiceLayout, THEME } from "@/features/services/ui";

const STEPS = [
  { icon: Briefcase, title: "Tell us your need", text: "A short request: what you need help with, in your own words." },
  { icon: ClipboardCheck, title: "We assess", text: "A consultant contacts you and understands your situation." },
  { icon: FileSignature, title: "You get a proposal", text: "Clear scope, timeline and fee. You accept when it's right." },
  { icon: Rocket, title: "We deliver", text: "Analysis, recommendations and support to put them into action." },
];

const PACKAGES = [
  { name: "Basic", who: "New and small businesses", gets: "Business assessment and practical recommendations" },
  { name: "Standard", who: "Growing businesses", gets: "Assessment, market and performance analysis" },
  { name: "Professional", who: "Established businesses", gets: "Full analysis, strategy and action plan" },
  { name: "Enterprise", who: "Larger organizations", gets: "Continuous consulting, dashboards and KPI follow-up" },
];

function RequestButton({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <Button asChild size="lg" className={cn("h-14 px-8 text-base font-bold tracking-wide", light ? "bg-white text-slate-900 hover:bg-slate-100" : THEME.consultancy.button, className)}>
      <Link to="/consultancy/request">REQUEST CONSULTANCY</Link>
    </Button>
  );
}

export default function ConsultancyHome() {
  const offerings = useOfferings("consultancy");
  return (
    <ServiceLayout>
      <section className={cn("relative overflow-hidden text-white", THEME.consultancy.hero)}>
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px]" aria-hidden />
        <div className="container relative max-w-5xl py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Isoko Consultancy</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
            Clear advice. Practical results.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-200 sm:text-xl">
            We help businesses and organizations understand their challenges, find opportunities and put workable plans into action.
          </p>
          <RequestButton light className="mt-9" />
        </div>
      </section>

      <section className="container max-w-5xl py-16 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">What we help with</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(offerings.data ?? []).filter((o) => o.key !== "other").map((o) => (
            <Link
              key={o.key}
              to="/consultancy/request"
              className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <h3 className="font-semibold">{o.name}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{o.description}</p>
              <span className={cn("mt-4 inline-flex items-center gap-1 text-sm font-medium", THEME.consultancy.text)}>
                Request <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border bg-card p-6">
                <span className="text-xs font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <s.icon className={cn("mt-3 h-7 w-7", THEME.consultancy.text)} aria-hidden />
                <p className="mt-3 font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container max-w-5xl py-16 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">Support at every size</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground sm:text-lg">Every engagement starts with a conversation. You receive a scope and quote before anything begins.</p>
        <div className="mt-10 overflow-hidden rounded-2xl border">
          {PACKAGES.map((p, i) => (
            <div key={p.name} className={cn("grid gap-1 p-5 sm:grid-cols-[10rem_14rem_1fr] sm:gap-4", i > 0 && "border-t")}>
              <p className="font-display text-lg font-bold">{p.name}</p>
              <p className="text-sm text-muted-foreground">{p.who}</p>
              <p className="text-sm">{p.gets}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <RequestButton />
        </div>
      </section>
    </ServiceLayout>
  );
}

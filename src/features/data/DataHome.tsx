import { Link } from "react-router-dom";
import { ArrowRight, Database, FileBarChart2, LineChart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOfferings } from "@/features/services/api";
import { ServiceLayout, THEME } from "@/features/services/ui";

const FLOW = [
  { icon: Database, title: "Your data", text: "Send spreadsheets, survey exports or reports, or tell us where the data is." },
  { icon: Sparkles, title: "Cleaned & checked", text: "We fix errors, gaps and duplicates so the numbers can be trusted." },
  { icon: LineChart, title: "Analysed", text: "Trends, comparisons and the answers to your questions." },
  { icon: FileBarChart2, title: "Clear results", text: "Charts, dashboards and a report with practical recommendations." },
];

// A decorative bar chart for the hero
function Bars() {
  const heights = [38, 52, 46, 64, 58, 76, 70, 88];
  return (
    <div className="flex h-40 items-end gap-2 sm:h-52" aria-hidden>
      {heights.map((h, i) => (
        <span key={i} className="w-6 rounded-t-md bg-gradient-to-t from-indigo-500/30 to-cyan-300/80 sm:w-8" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function RequestButton({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <Button asChild size="lg" className={cn("h-14 px-8 text-base font-bold tracking-wide", light ? "bg-cyan-300 text-indigo-950 hover:bg-cyan-200" : THEME.data.button, className)}>
      <Link to="/data-analysis/request">REQUEST DATA ANALYSIS</Link>
    </Button>
  );
}

export default function DataHome() {
  const offerings = useOfferings("data");
  return (
    <ServiceLayout>
      <section className={cn("relative overflow-hidden text-white", THEME.data.hero)}>
        <div className="container relative grid max-w-5xl items-end gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Isoko Data Analysis</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
              Turn your data into decisions.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-indigo-100/85 sm:text-xl">
              Send us your data and your question. We clean it, analyse it and give you results you can act on.
            </p>
            <RequestButton light className="mt-9" />
          </div>
          <div className="hidden lg:block"><Bars /></div>
        </div>
      </section>

      <section className="container max-w-5xl py-16 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">From raw data to useful answers</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((s, i) => (
            <li key={s.title} className="rounded-2xl border bg-card p-6">
              <span className="text-xs font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <s.icon className={cn("mt-3 h-7 w-7", THEME.data.text)} aria-hidden />
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">What we can do for you</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(offerings.data ?? []).filter((o) => o.key !== "other").map((o) => (
              <Link key={o.key} to="/data-analysis/request" className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md">
                <h3 className="font-semibold">{o.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{o.description}</p>
                <span className={cn("mt-4 inline-flex items-center gap-1 text-sm font-medium", THEME.data.text)}>
                  Request <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            We work with Excel, CSV, survey exports, PDFs and more, for businesses, NGOs, researchers and students. Your files stay private.
          </p>
          <div className="mt-10 text-center">
            <RequestButton />
          </div>
        </div>
      </section>
    </ServiceLayout>
  );
}

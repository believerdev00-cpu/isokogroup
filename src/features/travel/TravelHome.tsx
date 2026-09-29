import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db, formatMoney, unwrap } from "@/features/services/api";
import { ServiceLayout, THEME } from "@/features/services/ui";
import RouteMap, { PinMarker } from "@/components/motion/RouteMap";
import { DESTINATIONS, SECTIONS, type Package } from "./data";

// Rolling hills of the "land of a thousand hills", drawn as layered silhouettes.
function Hills({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
      <path fill="rgba(255,255,255,0.05)" d="M0 190 C 160 120 280 150 420 180 S 700 110 860 150 S 1160 210 1300 160 S 1440 140 1440 140 V320 H0Z" />
      <path fill="rgba(255,255,255,0.08)" d="M0 240 C 180 190 320 220 470 235 S 760 180 930 215 S 1210 260 1440 205 V320 H0Z" />
      <path fill="rgba(0,0,0,0.18)" d="M0 285 C 220 250 380 275 560 280 S 900 245 1080 270 S 1320 295 1440 270 V320 H0Z" />
    </svg>
  );
}

function PlanButton({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Button
      asChild
      size="lg"
      className={cn(
        "h-14 px-8 text-base font-bold tracking-wide shadow-lg",
        light ? "bg-amber-400 text-emerald-950 hover:bg-amber-300" : THEME.travel.button,
        className,
      )}
    >
      <Link to="/travel/plan">PLAN MY TRIP</Link>
    </Button>
  );
}

export default function TravelHome() {
  const packages = useQuery({
    queryKey: ["travel_packages", "public"],
    queryFn: async () => unwrap<Package[]>(await db.from("travel_packages").select("*").eq("is_active", true).order("sort")),
  });

  return (
    <ServiceLayout>
      {/* Hero */}
      <section className={cn("relative overflow-hidden text-white", THEME.travel.hero)}>
        <Hills className="absolute inset-x-0 bottom-0 h-40 w-full sm:h-56" />
        <div className="container relative grid max-w-6xl items-center gap-10 py-20 sm:py-28 lg:grid-cols-[1.15fr_1fr]">
          <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Isoko Travel Agency</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
            Your journey. <span className="text-amber-300">Our responsibility.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-emerald-50/85 sm:text-xl">
            From airport pickup to your return flight, Isoko takes care of your trip in Rwanda.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PlanButton light />
            <Button asChild size="lg" variant="ghost" className="h-14 text-base text-white hover:bg-white/10 hover:text-white">
              <a href="#rwanda">EXPLORE RWANDA</a>
            </Button>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-emerald-50/80">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-300" /> One team for your whole trip</li>
            <li className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-300" /> Local specialists in Rwanda</li>
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-300" /> No account needed to ask</li>
          </ul>
          </div>
          {/* A week in Rwanda, from the airport and back */}
          <div className="hidden rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur lg:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70">A week in Rwanda</p>
            <RouteMap
              className="mt-2"
              duration={9}
              lineClass="text-amber-300"
              dotClass="fill-amber-300"
              labelClass="fill-white"
              stops={[
                { label: "Kigali Airport", x: 40, y: 120 },
                { label: "Akagera", x: 140, y: 40 },
                { label: "Musanze", x: 250, y: 135 },
                { label: "Lake Kivu", x: 362, y: 60 },
              ]}
              marker={<PinMarker />}
            />
            <p className="mt-2 text-sm text-emerald-50/80">Pickup, hotels, transport and tours along the way, arranged by one team.</p>
          </div>
        </div>
      </section>

      {/* How it works: the whole journey, taken care of */}
      <section className="container max-w-5xl py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Tell us your trip. We take care of the rest.</h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Say where, when, how many people and what help you need. Our travel specialist plans everything and sends you one simple quote.
          </p>
        </div>
        <ol className="mt-10 grid gap-3 sm:grid-cols-5">
          {SECTIONS.map((s, i) => (
            <li key={s.key} className="relative rounded-2xl border bg-card p-5">
              <span className="text-xs font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <s.icon className={cn("mt-3 h-7 w-7", THEME.travel.text)} aria-hidden />
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.included}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">Plus support throughout your stay: one WhatsApp message away.</p>
      </section>

      {/* Destinations */}
      <section id="rwanda" className="scroll-mt-20 bg-muted/40 py-16 sm:py-20">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Explore Rwanda</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground sm:text-lg">Six places our guests love. Mention any of them when you plan your trip.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map((d, i) => (
              <article
                key={d.name}
                className={cn(
                  "group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl text-white shadow-lg ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl",
                  i === 0 && "lg:col-span-2",
                  i === DESTINATIONS.length - 1 && "sm:col-span-2 lg:col-span-3",
                )}
              >
                <img src={d.image} alt={`${d.name}, Rwanda`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/0" aria-hidden />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-900 backdrop-blur">{d.tag}</span>
                <div className="relative p-6">
                  <h3 className="font-display text-3xl font-bold drop-shadow">{d.name}</h3>
                  <p className="mt-1 max-w-md text-sm text-white/90">{d.text}</p>
                  <Link
                    to={`/travel/plan?place=${encodeURIComponent(d.name)}`}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition group-hover:gap-2.5"
                  >
                    Plan a trip here <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <a href={d.credit.url} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-3 text-[10px] text-white/55 hover:text-white">
                  Photo: {d.credit.by} · {d.credit.license}
                </a>
              </article>
            ))}
          </div>
          <div className="mt-10 text-center">
            <PlanButton />
          </div>
        </div>
      </section>

      {/* Packages: optional shortcuts into the same request */}
      {(packages.data?.length ?? 0) > 0 && (
        <section className="container max-w-5xl py-16 sm:py-20">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Ready-made trips</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground sm:text-lg">Prefer a starting point? Choose one and we'll shape it around your dates.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {packages.data!.map((p) => (
              <article key={p.id} className="card-interactive flex flex-col rounded-2xl border bg-card p-6">
                <p className={cn("text-sm font-semibold", THEME.travel.text)}>{p.days} days</p>
                <h3 className="mt-1 font-display text-2xl font-bold">{p.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.summary}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {p.includes.map((inc) => (
                    <li key={inc} className="flex items-start gap-2">
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", THEME.travel.text)} /> {inc}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm">
                  {p.from_price != null ? (
                    <>From <span className="text-lg font-bold">{formatMoney(p.from_price, p.currency)}</span> per person</>
                  ) : (
                    <span className="text-muted-foreground">Price depends on your dates and hotel</span>
                  )}
                </p>
                <Button asChild variant="outline" size="lg" className="mt-4 h-12 w-full justify-between">
                  <Link to={`/travel/plan?package=${p.id}`}>
                    Request This Trip <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Closing call to action */}
      <section className={cn("relative overflow-hidden text-white", THEME.travel.hero)}>
        <Hills className="absolute inset-x-0 bottom-0 h-32 w-full" />
        <div className="container relative max-w-3xl py-16 text-center sm:py-20">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Coming to Rwanda?</h2>
          <p className="mt-3 text-emerald-50/85 sm:text-lg">Four short questions. Our specialist does the planning.</p>
          <PlanButton light className="mt-8" />
        </div>
      </section>
    </ServiceLayout>
  );
}

import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, MapPin, PackageCheck, PlayCircle, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import RouteMap, { TruckMarker } from "@/components/motion/RouteMap";
import { SearchTrigger } from "@/components/ServiceSearch";

// The homepage leads with Isoko's main service, Logistics: one clear action
// (request a delivery), one secondary (track), and a search for everything else.
const STOPS = [
  { label: "Pickup", x: 36, y: 128 },
  { label: "Isoko hub", x: 150, y: 58 },
  { label: "Kimironko", x: 262, y: 118 },
  { label: "Delivered", x: 366, y: 48 },
];

const HeroSection = () => {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-primary blur-3xl animate-float-soft" />
        <div className="absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-primary/60 blur-3xl animate-float-soft" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* One column on phones; min-w-0 lets it shrink to the screen (a grid column
          otherwise grows to its widest content and the text gets cut off). */}
      <div className="container relative grid grid-cols-1 items-center gap-10 py-10 sm:py-16 md:gap-12 md:py-24 lg:grid-cols-[1.05fr_1fr] [&>*]:min-w-0">
        <div className="space-y-6 sm:space-y-7">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground fade-in-up">
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> <span className="truncate">{t("hero.badge")}</span>
          </div>
          <h1
            className="font-display text-[2rem] font-bold leading-[1.15] [text-wrap:balance] sm:text-4xl md:text-5xl md:leading-tight lg:text-6xl fade-in-up"
            style={{ animationDelay: "80ms" }}
          >
            {t("home.title")}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg md:text-xl fade-in-up" style={{ animationDelay: "160ms" }}>
            {t("home.subtitle")}
          </p>
          {/* Full-width, stacked buttons on phones; side by side from sm up */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap fade-in-up" style={{ animationDelay: "240ms" }}>
            <Button asChild size="lg" className="press h-12 w-full gap-2 rounded-full px-7 text-base sm:w-auto">
              <Link to="/logistics/delivery">
                <Truck className="h-5 w-5" /> {t("home.requestDelivery")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full gap-2 rounded-full px-7 text-base sm:w-auto">
              <Link to="/track">
                <MapPin className="h-5 w-5" /> {t("home.track")}
              </Link>
            </Button>
          </div>
          <div className="max-w-xl fade-in-up" style={{ animationDelay: "320ms" }}>
            <SearchTrigger large />
          </div>
          <a href="#what-we-do" className="inline-flex items-center gap-2 font-semibold text-primary fade-in-up" style={{ animationDelay: "400ms" }}>
            <PlayCircle className="h-6 w-6" /> {t("story.watch")}
          </a>
        </div>

        {/* A delivery on its way: shows what Isoko Logistics does at a glance */}
        <div className="fade-in-up rounded-3xl border bg-card/80 p-4 shadow-xl backdrop-blur sm:p-6" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live delivery</p>
              <p className="font-mono text-sm font-semibold">TRK-2604-8811</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              In transit
            </span>
          </div>
          <RouteMap stops={STOPS} marker={<TruckMarker />} road className="mt-4" />
          <ol className="mt-4 grid grid-cols-3 gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
            {[
              { icon: PackageCheck, label: "Picked up", done: true },
              { icon: Truck, label: "On the way", done: true },
              { icon: CheckCircle2, label: "Delivered", done: false },
            ].map((s) => (
              <li
                key={s.label}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center sm:flex-row sm:gap-1.5 sm:px-2 sm:text-left ${s.done ? "border-primary/30 bg-primary/5 text-foreground" : "text-muted-foreground"}`}
              >
                <s.icon className={`h-4 w-4 shrink-0 ${s.done ? "text-primary" : ""}`} /> <span className="leading-tight">{s.label}</span>
              </li>
            ))}
          </ol>
          <Link to="/logistics" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            How Isoko Logistics works <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

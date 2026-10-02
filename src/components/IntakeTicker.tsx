// The live intake band: a moving line of the Training Center intakes that are
// open, about to close, or about to open. Everything it says comes from the
// intakes an admin published (the Training Center API decides which ones and
// what state each is in); nothing here is written by hand.
//
// It is one band for all of them: the announcements move past in turn, each one
// is a link to its own intake, and the visitor can stop the movement. Devices
// that asked for less motion get the same announcements as a row they can swipe.
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/training/lib/api";
import { useI18n, type TranslateVars } from "@/lib/i18n";
import { isLiteMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type IntakeAnnouncement = {
  id: string;
  name: string;
  slug: string;
  location: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  is_featured: boolean;
  ticker_priority: number;
  state: "closing_soon" | "open" | "coming_soon";
  days_left: number | null;
  program_count: number;
  programs: string[];
};

type Translate = (key: string, vars?: TranslateVars) => string;

/** The intake page an announcement opens. */
export const intakePath = (slug: string) => `/training-center/intakes/${encodeURIComponent(slug)}`;

/** The day an intake opens, short enough for one line. */
export const shortDate = (iso: string, lang: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short" });
};

/** What the band says about one intake: the state, and why it is worth reading now. */
export function announcementText(a: IntakeAnnouncement, t: Translate, lang = "en") {
  const state =
    a.state === "closing_soon"
      ? a.days_left === 0
        ? t("ticker.lastDay")
        : t("ticker.closingSoon", { days: a.days_left ?? 0 })
      : a.state === "coming_soon"
        ? t("ticker.comingSoon", { date: shortDate(a.application_opens_on, lang) })
        : t("ticker.open");
  const programs = a.programs.join(" · ");
  const more = a.program_count > a.programs.length ? t("ticker.andMore", { n: a.program_count - a.programs.length }) : "";
  return { state, programs: programs + (more ? ` ${more}` : ""), title: a.name };
}

/**
 * How long one pass of the band takes. It follows the amount of text, so the
 * words always move at the same comfortable reading speed however many intakes
 * there are: fast enough to notice, slow enough to read.
 */
export function tickerSeconds(items: IntakeAnnouncement[]): number {
  const characters = items.reduce((n, a) => n + a.name.length + a.programs.join("").length + 24, 0);
  return Math.min(140, Math.max(22, Math.round(characters * 0.14)));
}

function Announcement({ a, t, lang }: { a: IntakeAnnouncement; t: Translate; lang: string }) {
  const { state, programs, title } = announcementText(a, t, lang);
  return (
    <Link
      to={intakePath(a.slug)}
      className="group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap px-5 py-2.5 text-sm transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none sm:gap-3"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
      {a.is_featured && (
        <span className="rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
          {t("ticker.new")}
        </span>
      )}
      <span className="font-bold uppercase tracking-wide">{title}</span>
      {programs && <span className="text-white/75">{programs}</span>}
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
          a.state === "closing_soon" ? "bg-gold/20 text-gold" : "bg-white/15 text-white",
        )}
      >
        {state}
      </span>
      <span className="inline-flex items-center gap-1 font-semibold text-gold group-hover:underline">
        {t("ticker.apply")}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export default function IntakeTicker({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const [paused, setPaused] = useState(false);
  // A finger on the band holds it still, so a moving announcement is easy to tap and read
  const [held, setHeld] = useState(false);
  // Decided once: a device that asked for less motion never starts the movement
  const lite = useRef<boolean | null>(null);
  if (lite.current === null) lite.current = typeof window === "undefined" ? true : isLiteMotion();

  const { data } = useQuery({
    queryKey: ["/public/announcements"],
    queryFn: () => api.get<IntakeAnnouncement[]>("/public/announcements"),
    staleTime: 120_000,
    refetchInterval: 300_000,
    retry: 1,
  });

  const items = useMemo(() => (data ?? []).slice(0, 12), [data]);
  const seconds = useMemo(() => tickerSeconds(items), [items]);

  // Nothing to announce (or the Training Center is unreachable): the band stays away
  if (items.length === 0) return null;

  const row = (copy = false) => (
    <div className="flex items-center" aria-hidden={copy || undefined}>
      {items.map((a) => (
        <Announcement key={copy ? `${a.id}-copy` : a.id} a={a} t={t} lang={lang} />
      ))}
    </div>
  );

  return (
    <section
      aria-label={t("ticker.label")}
      className={cn("intake-ticker relative border-b border-white/10 bg-[#0b1530] text-white", className)}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
    >
      <div className="flex items-stretch">
        {/* On the narrowest phones the bell alone, so the announcements keep the room */}
        <p className="flex shrink-0 items-center gap-2 bg-gold px-2.5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-gold-foreground sm:px-4">
          <Bell className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t("ticker.center")}</span>
          <span aria-hidden className="hidden min-[420px]:inline sm:hidden">{t("ticker.centerShort")}</span>
          <span aria-hidden className="hidden sm:inline">{t("ticker.center")}</span>
        </p>
        {lite.current ? (
          // No movement: the same announcements, swipeable
          <div className="flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&>div>a]:snap-start [&::-webkit-scrollbar]:hidden">
            {row()}
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <div
              className="intake-ticker-track flex w-max"
              style={{ animationDuration: `${seconds}s` }}
              data-paused={paused || held ? "true" : undefined}
            >
              {row()}
              {row(true)}
            </div>
          </div>
        )}
        {!lite.current && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="shrink-0 px-2.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset sm:px-3"
            title={paused ? t("ticker.resume") : t("ticker.pause")}
          >
            {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            <span className="sr-only">{paused ? t("ticker.resume") : t("ticker.pause")}</span>
          </button>
        )}
      </div>
    </section>
  );
}

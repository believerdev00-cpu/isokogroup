import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EASE, isLiteMotion } from "@/lib/motion";
import { CATEGORIES, FEATURED_SERVICE_ID, SERVICES } from "@/lib/services";
import { SearchTrigger } from "@/components/ServiceSearch";
import { heroPhotos } from "@/assets/hero";
import logo from "@/assets/isoko-logo.jpeg";

// The hero is a slider with one slide per Isoko service, each over a real photo
// of that service (some show a few photos in turn), all carrying the ISOKO GROUP brand. Shortcuts (track, sell, book) are actions, not services, and stay out.
const SHORTCUTS = new Set(["track", "sell", "software-booking"]);
const SLIDES = [...SERVICES.filter((s) => !SHORTCUTS.has(s.id) && heroPhotos(s.id).length)].sort(
  (a, b) => Number(b.id === FEATURED_SERVICE_ID) - Number(a.id === FEATURED_SERVICE_ID),
);
const categoryOf = (key: string) => CATEGORIES.find((c) => c.key === key)?.title ?? "";

const INTERVAL_MS = 5500;
const SWIPE_PX = 60;

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60 }),
};

type Props = {
  /** The small label above the title, e.g. "About ISOKO GROUPS". Defaults to the welcome badge. */
  badge?: string;
  /** Show the service search under the slider (the homepage does). */
  search?: boolean;
};

const HeroSection = ({ badge, search = true }: Props) => {
  const { t } = useI18n();
  const [[index, dir], setSlide] = useState<[number, number]>([0, 1]);
  // Autoplay stays off for reduced-motion visitors; they can still step through.
  const [lite] = useState(isLiteMotion);
  const [playing, setPlaying] = useState(!lite);
  const [hovered, setHovered] = useState(false);

  const go = useCallback((step: number) => {
    setSlide(([i]) => [(i + step + SLIDES.length) % SLIDES.length, step]);
  }, []);
  const jump = (to: number) => setSlide(([i]) => [to, to >= i ? 1 : -1]);

  const s = SLIDES[index];
  const photos = heroPhotos(s.id);
  // A slide with several photos stays up longer so each one gets its full turn.
  const slideMs = INTERVAL_MS * photos.length;
  // Which of the slide's photos is showing; tied to the slide so a new slide starts at its first
  const [[shotSlide, shotAt], setShot] = useState<[number, number]>([0, 0]);
  const shot = shotSlide === index ? shotAt : 0;
  const photo = photos[shot];

  const running = playing && !hovered;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => go(1), slideMs);
    return () => window.clearTimeout(id);
  }, [running, index, go, slideMs]);

  useEffect(() => {
    if (!running || shot >= photos.length - 1) return;
    const id = window.setTimeout(() => setShot([index, shot + 1]), INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [running, index, shot, photos.length]);

  // Fetch the coming photos ahead of time so the cross-fade never shows a blank.
  useEffect(() => {
    [...photos.slice(1), ...heroPhotos(SLIDES[(index + 1) % SLIDES.length].id)].forEach((ph) => (new Image().src = ph.src));
  }, [index, photos]);

  return (
    <section
      className="relative overflow-hidden border-b border-border bg-neutral-900 text-white"
      aria-roledescription="carousel"
      aria-label="ISOKO GROUPS services"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHovered(false)}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea")) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      {/* Each service's photo cross-fades in and slowly zooms out while it shows (or its clip plays) */}
      <AnimatePresence initial={false}>
        {photo.video && !lite ? (
          <motion.video
            key={photo.src}
            src={photo.video}
            poster={photo.src}
            autoPlay
            muted
            loop
            playsInline
            aria-label={photo.alt}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          />
        ) : (
          <motion.img
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.9 }, scale: { duration: INTERVAL_MS / 1000 + 1, ease: "linear" } }}
          />
        )}
      </AnimatePresence>
      {/* Darkened towards the text so it stays readable on any photo */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />

      {/* ISOKO GROUP brand mark on every slide */}
      <div className="pointer-events-none absolute right-4 top-4 hidden items-center gap-2 rounded-full bg-black/40 py-1.5 pl-1.5 pr-4 backdrop-blur sm:flex md:right-8 md:top-6" aria-hidden>
        <img src={logo} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span className="font-display text-sm font-bold tracking-wide">
          ISOKO <span className="text-primary">GROUP</span>
        </span>
      </div>

      <div className="container relative py-10 sm:py-14 md:py-20">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs backdrop-blur sm:px-4 sm:text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-white" /> <span className="truncate">{badge ?? t("hero.badge")}</span>
        </div>

        {/* Fixed height so the page below doesn't jump as slides change */}
        <div className="relative mt-6 min-h-[340px] sm:min-h-[320px] md:min-h-[360px]" aria-live={running ? "off" : "polite"}>
          <AnimatePresence initial={false} custom={dir} mode="wait">
            <motion.div
              key={s.id}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: EASE }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE_PX) go(1);
                else if (info.offset.x > SWIPE_PX) go(-1);
              }}
              className="max-w-2xl cursor-grab active:cursor-grabbing"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${SLIDES.length}: Isoko ${s.name}`}
            >
              <div className="space-y-5">
                <motion.p
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80 sm:text-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4, ease: EASE }}
                >
                  ISOKO GROUP · {categoryOf(s.category)}
                </motion.p>
                <motion.h1
                  className="font-display text-[2rem] font-bold uppercase leading-[1.1] [text-wrap:balance] sm:text-5xl lg:text-6xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
                >
                  <span className="text-primary">Isoko</span> {s.name}
                </motion.h1>
                <motion.p
                  className="max-w-xl text-base text-white/85 sm:text-lg md:text-xl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28, duration: 0.5, ease: EASE }}
                >
                  {s.description}
                </motion.p>
                <motion.div
                  className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38, duration: 0.45, ease: EASE }}
                >
                  <Button asChild size="lg" className="press h-12 w-full gap-2 rounded-full bg-white px-7 text-base text-neutral-900 hover:bg-white/90 sm:w-auto">
                    <Link to={s.action.path} draggable={false}>
                      {s.action.label} <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 w-full gap-2 rounded-full border-white/60 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    <Link to={s.path} draggable={false}>{t("hero.discover")}</Link>
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls: arrows, one dot per service (the active one fills while it plays), pause */}
        <div className="mt-6 flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => go(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 hover:bg-white/10" aria-label="Previous service">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <ol className="flex min-w-0 items-center gap-1.5">
            {SLIDES.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  className={cn("relative block h-2 overflow-hidden rounded-full bg-white/35 transition-all duration-300", i === index ? "w-8" : "w-2 hover:bg-white/60")}
                  aria-label={`Show ${o.name}`}
                  aria-current={i === index}
                >
                  {i === index && (
                    <span
                      key={`${index}-${running}`}
                      className={cn("absolute inset-0 bg-white", running && "story-progress")}
                      style={running ? { animationDuration: `${slideMs}ms` } : undefined}
                    />
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => go(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 hover:bg-white/10" aria-label="Next service">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 hover:bg-white/10"
            aria-label={playing ? "Pause the slideshow" : "Play the slideshow"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>

        {search && (
          <div className="mt-8 max-w-xl text-foreground">
            <SearchTrigger large />
          </div>
        )}
      </div>

      <a
        href={photo.source}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-3 max-w-[60%] truncate text-[10px] text-white/55 hover:text-white/90 sm:text-xs"
      >
        {photo.video ? "Video" : "Photo"}: {photo.credit} · {photo.license}
      </a>
    </section>
  );
};

export default HeroSection;

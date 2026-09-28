import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, Briefcase, ChevronLeft, ChevronRight, Film, Package, Pause, Play, Plane, ShoppingBag,
  Smartphone, Sparkles, Truck, Volume2, VolumeX, type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isLiteMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import logo from "@/assets/isoko-logo.jpeg";

// Homepage: what ISOKO GROUP does, told in moving pictures so a visitor who
// can't read (or doesn't read English) still understands it. Each scene is one
// service; a voice can read it aloud where the browser has a voice for the
// visitor's language. The scenes play while the section is on screen.

const SCENE_MS = 6500;

// Each scene is a short real clip (Mixkit, free licence) from public/videos; its
// first frame is the poster, shown while it loads and to reduced-motion visitors.
type Scene = { id: string; icon: LucideIcon; tint: string; path: string };
const media = (id: string) => ({ video: `/videos/story-${id}.mp4`, poster: `/videos/story-${id}.jpg` });

const SCENES: Scene[] = [
  { id: "intro", icon: Sparkles, tint: "bg-primary", path: "/services" },
  { id: "delivery", icon: Truck, tint: "bg-red-600", path: "/logistics/delivery" },
  { id: "packaging", icon: Package, tint: "bg-amber-600", path: "/logistics/packaging" },
  { id: "market", icon: ShoppingBag, tint: "bg-orange-500", path: "/marketplace" },
  { id: "learning", icon: BookOpen, tint: "bg-indigo-600", path: "/training-center" },
  { id: "fun", icon: Film, tint: "bg-violet-700", path: "/entertainment" },
  { id: "business", icon: Briefcase, tint: "bg-slate-700", path: "/software" },
  { id: "travel", icon: Plane, tint: "bg-emerald-700", path: "/travel" },
  { id: "pay", icon: Smartphone, tint: "bg-green-600", path: "/login" },
];

/** A browser voice for the visitor's language, if this device has one */
function useVoice(lang: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => setVoice(window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null);
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [lang]);
  return voice;
}

const CompanyStory = () => {
  const { t, lang } = useI18n();
  const [lite] = useState(isLiteMotion);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!lite);
  const [sound, setSound] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const voice = useVoice(lang);
  const scene = SCENES[index];
  const caption = t(`story.${scene.id}`);
  const running = playing && inView;
  const speaking = sound && voice !== null;

  // Play only while the story is on screen
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Next scene: after the voice finishes reading it, or after a few seconds
  useEffect(() => {
    if (!running) return;
    let done = false;
    const timers: number[] = [];
    const next = () => {
      if (done) return;
      done = true;
      setIndex((i) => (i + 1) % SCENES.length);
    };
    if (speaking) {
      const u = new SpeechSynthesisUtterance(caption);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.92;
      u.onend = () => timers.push(window.setTimeout(next, 1200));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      timers.push(window.setTimeout(next, 20000)); // in case the voice never says it's done
    } else {
      timers.push(window.setTimeout(next, SCENE_MS));
    }
    return () => {
      done = true;
      timers.forEach((id) => window.clearTimeout(id));
      if (speaking) window.speechSynthesis.cancel();
    };
  }, [running, index, speaking, caption, voice]);

  const go = (i: number) => setIndex((i + SCENES.length) % SCENES.length);
  const toggleSound = () => {
    setSound((s) => !s);
    setPlaying(true);
  };

  // The clip plays only while the story does
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (running) v.play().catch(() => {});
    else v.pause();
  }, [running, index]);

  const { video, poster } = media(scene.id);
  return (
    <section ref={ref} id="what-we-do" className="scroll-mt-20 border-b border-border py-12 md:py-20" aria-roledescription="carousel" aria-label={t("story.title")}>
      <div className="container max-w-4xl">
        <div className="mb-6 text-center" data-aos="fade-up">
          <h2 className="font-display text-3xl font-bold md:text-4xl">{t("story.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("story.sub")}</p>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-xl">
          <div className="relative aspect-[5/3] bg-neutral-900">
            {lite ? (
              <img key={index} src={poster} alt={caption} className="story-enter h-full w-full object-cover" />
            ) : (
              <video
                key={index}
                ref={videoRef}
                src={video}
                poster={poster}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={caption}
                className="story-enter h-full w-full object-cover"
              />
            )}
            {/* ISOKO GROUP brand mark on every scene */}
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 text-white backdrop-blur" aria-hidden>
              <img src={logo} alt="" className="h-7 w-7 rounded-full object-cover" />
              <span className="font-display text-xs font-bold tracking-wide sm:text-sm">
                ISOKO <span className="text-primary">GROUP</span>
              </span>
            </div>
            {!speaking && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                <div
                  key={`${index}-${running}`}
                  className="story-progress h-full bg-primary"
                  style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                />
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start gap-3" aria-live={running ? "off" : "polite"}>
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white", scene.tint)}>
                <scene.icon className="h-5 w-5" />
              </span>
              <p className="min-h-[6.75rem] pt-1.5 sm:min-h-[3.5rem] text-lg font-medium leading-snug sm:text-xl">{caption}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => go(index - 1)} className="story-btn" aria-label={t("story.prev")}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setPlaying((p) => !p)} className="story-btn" aria-label={playing ? t("story.pause") : t("story.play")}>
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => go(index + 1)} className="story-btn" aria-label={t("story.next")}>
                <ChevronRight className="h-5 w-5" />
              </button>
              {voice && (
                <button type="button" onClick={toggleSound} className={cn("story-btn", sound && "border-primary bg-primary text-primary-foreground")} aria-pressed={sound} aria-label={t("story.listen")}>
                  {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              )}
              <Link to={scene.path} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground press">
                {t("story.open")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* One picture button per scene: no reading needed to jump around */}
            <div className="flex justify-between gap-1" role="tablist">
              {SCENES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={t(`story.${s.id}`)}
                  onClick={() => go(i)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                    i === index ? cn(s.tint, "border-transparent text-white") : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <s.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyStory;

import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, Lock, MessageCircle, Play, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/features/services/api";
import { mediaUrl, playbackUrl, youtubeEmbed, type WatchSource } from "./api";
import { DemoBadge } from "./ui";

// duration_minutes is here so the signed link can be made to last the film
// and no longer. Every caller passes a whole title or episode, which carries it.
type Playable = {
  watch_source: WatchSource | null;
  watch_ref: string | null;
  is_free: boolean;
  duration_minutes?: number | null;
};

/**
 * Plays a film or episode. YouTube items play for everyone; files kept by
 * Isoko play for subscribers (the link is signed only for them), others get
 * the way in. Nothing loads until they press play.
 */
export function Player({ item, audio, poster, label = "Play" }: { item: Playable; audio?: boolean; poster?: string | null; label?: string }) {
  const { user } = useAuth();
  const { isActive } = useSubscription();
  const location = useLocation();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "denied">("idle");

  if (!item.watch_source || !item.watch_ref) {
    return <p className="rounded-xl bg-white/5 p-4 text-sm text-neutral-400">Not available to play yet.</p>;
  }
  const needsAccess = item.watch_source === "storage" && !item.is_free;

  const start = async () => {
    setState("loading");
    const link = await playbackUrl(item);
    if (!link) return setState("denied");
    setUrl(link);
    setState("idle");
  };

  if (url) {
    if (item.watch_source === "youtube") {
      return (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe src={url} title="Player" className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      );
    }
    // controlsList="nodownload" removes the Download item Chrome and Edge put
    // in the player menu by default -- without it the site offers subscribers a
    // one-click copy of the film. It is a closed door, not a locked one: the
    // signed link is still in the page and can be fetched by hand. Only a video
    // platform with segmented, encrypted delivery changes that.
    return audio ? (
      <audio src={url} controls controlsList="nodownload" autoPlay className="w-full" />
    ) : (
      <video
        src={url}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        autoPlay
        playsInline
        poster={poster ?? undefined}
        className="aspect-video w-full rounded-xl bg-black"
      />
    );
  }

  if (needsAccess && (!user || !isActive || state === "denied")) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <Lock className="h-5 w-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm text-neutral-300">{user ? "Subscribe to watch the full content." : "Sign in and subscribe to watch the full content."}</p>
        <Link
          to={user ? "/subscription" : "/login"}
          state={{ from: location.pathname }}
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          {user ? "Subscribe" : "Sign in"}
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={state === "loading"}
      className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black transition hover:bg-white/85"
    >
      {state === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-black" />} {label}
    </button>
  );
}

/** A YouTube trailer or video that opens in place. */
export function YouTubeButton({ video, label }: { video: string; label: string }) {
  const [open, setOpen] = useState(false);
  const embed = youtubeEmbed(video, true);
  if (!embed) return null;
  if (open) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-label={label}>
        <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
        <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black">
          <iframe src={embed} title={label} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white/15 px-6 font-semibold text-white backdrop-blur hover:bg-white/25">
      <Play className="h-5 w-5" /> {label}
    </button>
  );
}

/** Big cinematic header: artwork behind, text and actions over it. */
export function Hero({ image, video, eyebrow, title, text, meta, demo, children, tall }: {
  image?: string | null; video?: string; eyebrow?: ReactNode; title: string; text?: string | null; meta?: ReactNode; demo?: boolean;
  children?: ReactNode; tall?: boolean;
}) {
  return (
    <section className={cn("relative -mt-[104px] flex items-end overflow-hidden xl:-mt-16", tall ? "min-h-[82vh]" : "min-h-[62vh]")}>
      {video ? (
        <video src={video} poster={image ?? undefined} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : image ? (
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-neutral-950 to-neutral-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/70 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-neutral-950/40" aria-hidden />
      <div className="relative w-full px-4 pb-10 pt-40 md:px-10 md:pb-16">
        <div className="max-w-2xl space-y-4">
          {(eyebrow || demo) && (
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
              {demo && <DemoBadge />}
            </div>
          )}
          <h1 className="font-display text-4xl font-bold leading-[1.05] [text-wrap:balance] md:text-6xl">{title}</h1>
          {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-300">{meta}</div>}
          {text && <p className="line-clamp-4 text-base text-neutral-200 md:text-lg">{text}</p>}
          {children && <div className="flex flex-wrap gap-3 pt-2">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export const heroImage = (path: string | null | undefined) => mediaUrl(path, "lg");

/**
 * Asking Isoko Entertainment for a shoot, a model, event coverage or a
 * production. Until the booking forms arrive this opens a WhatsApp chat with
 * the request written out, so it reaches a person today.
 */
export function BookButton({ what, className, children }: { what: string; className?: string; children?: ReactNode }) {
  return (
    <a
      href={whatsappLink(`Hello Isoko Entertainment, I'd like to ${what}.`)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-white hover:bg-primary/90", className)}
    >
      <MessageCircle className="h-5 w-5" /> {children ?? "Book now"}
    </a>
  );
}

export function FinalCta() {
  return (
    <section className="mx-4 mt-16 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-red-700 to-red-950 px-6 py-12 text-center md:mx-10 md:py-16">
      <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold md:text-5xl">Have a story, event or creative project?</h2>
      <p className="mx-auto mt-3 max-w-xl text-white/85">Films, podcasts, photo shoots, fashion campaigns and event coverage, produced by Isoko Entertainment.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <BookButton what="book Isoko Entertainment for a project" className="bg-white text-black hover:bg-white/90">Book Isoko Entertainment</BookButton>
      </div>
    </section>
  );
}

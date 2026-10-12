import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, Lock, MessageCircle, Play, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/features/services/api";
import { mediaKindOf } from "@/lib/mediaKind";
import { isAudioRef, mediaUrl, playbackUrl, youtubeEmbed, type WatchSource } from "./api";
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
 * Why playback stopped, as precisely as the browser is willing to say.
 *
 * There are four MediaError codes and they mean genuinely different things,
 * but this used to be one sentence that blamed Matroska for all of them and
 * ended "Nothing is wrong with the file." That sentence was shown for a film
 * stored as 24 bytes by an upload that never finished -- where something was
 * very much wrong with the file, and no browser on earth would have played
 * it. Guessing one cause and stating it as fact costs more than saying less.
 *
 * `code` is null when no link could be made at all, which is a different
 * failure again: the file is not in storage, so playback never started.
 */
function PlaybackProblem({ code, path, onRetry }: { code: number | null; path: string | null; onRetry: () => void }) {
  const matroska = (path ?? "").toLowerCase().endsWith(".mkv");
  const { title, detail, retry } =
    code === null
      ? {
          title: "This video could not be loaded.",
          detail: "The file is not in storage. It may never have finished uploading, in which case it has to be uploaded again.",
          retry: true,
        }
      : code === 2 // MEDIA_ERR_NETWORK
      ? {
          title: "The connection to the video was lost.",
          detail: "The link may have expired while this page was open. Try again for a fresh one.",
          retry: true,
        }
      : code === 3 // MEDIA_ERR_DECODE
      ? {
          title: "This video is damaged.",
          detail: "The file was reached but could not be decoded, which usually means it did not upload completely.",
          retry: false,
        }
      : code === 4 // MEDIA_ERR_SRC_NOT_SUPPORTED
      ? {
          title: matroska ? "This browser cannot play this video." : "This video could not be read.",
          detail: matroska
            ? "It is a Matroska (.mkv) file, and browsers disagree about those. Google Chrome or Microsoft Edge will often play it; nothing is wrong with the file."
            : "The browser could not read it. Either it is in a format this browser lacks, or the file is incomplete -- an upload that stopped partway leaves a file that opens nowhere.",
          retry: false,
        }
      : { title: "This video stopped.", detail: "Playback was interrupted before it finished.", retry: true };

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-black p-6 text-center">
      <p className="font-semibold text-white">{title}</p>
      <p className="max-w-md text-sm text-neutral-400">{detail}</p>
      {retry && (
        <button type="button" onClick={onRetry} className="mt-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20">
          Try again
        </button>
      )}
    </div>
  );
}

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
  const [state, setState] = useState<"idle" | "loading" | "denied" | "missing">("idle");
  // Which MediaError the browser raised, or null while nothing has failed.
  //
  // This was a single flag that always blamed Matroska. It was wrong in the
  // case that actually happened: a film whose upload had left 24 bytes in
  // storage failed in every browser, and the page said the format was
  // unsupported and "nothing is wrong with the file" -- so the next person
  // went looking at their browser instead of at the file. The element knows
  // more than one thing went wrong, so the page should say which.
  const [failed, setFailed] = useState<number | null>(null);

  if (!item.watch_source || !item.watch_ref) {
    return <p className="rounded-xl bg-white/5 p-4 text-sm text-neutral-400">Not available to play yet.</p>;
  }
  const needsAccess = item.watch_source === "storage" && !item.is_free;

  const start = async () => {
    setState("loading");
    const link = await playbackUrl(item);
    // Storage refuses to sign both when the person may not watch and when
    // there is nothing at that path, and it answers "not found" either way.
    // Only the first is about them, so only the first asks them to subscribe:
    // telling a paying subscriber to subscribe because a file is missing
    // sends them to the one page that cannot help.
    if (!link) return setState(needsAccess && (!user || !isActive) ? "denied" : "missing");
    setFailed(null);
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
    if (failed !== null) return <PlaybackProblem code={failed} path={item.watch_ref} onRetry={start} />;
    return audio ? (
      <audio
        src={url}
        controls
        controlsList="nodownload"
        onError={(e) => setFailed(e.currentTarget.error?.code ?? 0)}
        autoPlay
        className="w-full"
      />
    ) : (
      <video
        src={url}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onError={(e) => setFailed(e.currentTarget.error?.code ?? 0)}
        autoPlay
        playsInline
        poster={poster ?? undefined}
        className="aspect-video w-full rounded-xl bg-black"
      />
    );
  }

  if (state === "missing") return <PlaybackProblem code={null} path={item.watch_ref} onRetry={start} />;

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
/**
 * The video or audio a person, a work, a collection or an event carries, with
 * a heading, or nothing at all when it has none. Audio is played as audio: a
 * black rectangle for a voice clip helps nobody.
 */
export function SectorMedia({ item, poster, heading }: { item: Playable; poster?: string | null; heading?: string }) {
  if (!item.watch_source || !item.watch_ref) return null;
  const audio = item.watch_source === "storage" && isAudioRef(item.watch_ref);
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-6">
      <h2 className="mb-3 font-display text-2xl font-bold">{heading ?? (audio ? "Listen" : "Watch")}</h2>
      <Player item={item} audio={audio} poster={poster} />
    </section>
  );
}

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
 * What a banner should show for a picture that may not be a picture.
 *
 * A poster, a backdrop or a cover can now be a video or a sound, because the
 * same single upload control takes all three. A banner cannot treat them
 * alike: a video belongs in <video>, where Hero already plays it muted and
 * looping, and an <img> pointed at an MP4 is a broken icon.
 *
 * A sound is not a backdrop at all. There is nothing to look at, so it falls
 * back to the still passed as `also` -- normally the poster when the backdrop
 * is the sound -- and to Hero's gradient when there is no still either.
 *
 * Returns Hero's own props, so a caller spreads it: <Hero {...heroMedia(a, b)} />
 */
export function heroMedia(path: string | null | undefined, also?: string | null) {
  const still = mediaKindOf(also) === "image" ? heroImage(also) : null;
  switch (mediaKindOf(path)) {
    case "video":
      return { video: mediaUrl(path) ?? undefined, image: still };
    case "audio":
      return { image: still };
    default:
      // "other" lands here too: an unrecognised extension is shown as a
      // picture, exactly as it was before any of this.
      return { image: heroImage(path) };
  }
}

/**
 * A cover that may not be a picture, filling whatever box the caller gives it.
 *
 * Img (ui.tsx) answers the same question for cards, but it owns its box and
 * its aspect ratio. These banners size themselves with their own classes, so
 * this keeps the class list and changes only the tag.
 */
export function Cover({ path, alt = "", className }: { path: string | null | undefined; alt?: string; className?: string }) {
  switch (mediaKindOf(path)) {
    case "video":
      // Muted and looping: a banner that demanded a click to start, or made
      // noise on arrival, would be worse than the still it replaced.
      return <video src={mediaUrl(path) ?? undefined} className={className} muted loop autoPlay playsInline preload="metadata" aria-label={alt || undefined} />;
    case "audio":
      return (
        <div className={cn(className, "flex items-center justify-center bg-neutral-900")}>
          <audio src={mediaUrl(path) ?? undefined} controls preload="metadata" className="w-full max-w-md px-4" />
        </div>
      );
    default:
      return <img src={heroImage(path) ?? undefined} alt={alt} loading="lazy" className={className} />;
  }
}

/** The same path, but only when it is a still: for a poster= attribute. */
export const heroStill = (path: string | null | undefined) =>
  mediaKindOf(path) === "image" ? heroImage(path) : null;

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

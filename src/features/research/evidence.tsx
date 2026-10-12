// What a finding is based on, shown rather than described.
//
// A number on its own asks to be taken on trust. The photograph of the site,
// the recording of the interview and the video of the field visit are what
// make it checkable, and until now they sat in a private bucket where only
// staff could reach them. An analyst marks a file as evidence per file, so
// what appears here is a deliberate choice and not everything that happens to
// be attached -- the questionnaire with somebody's answers in it stays shut.
import { useState } from "react";
import { Download, FileText, Music, Video as VideoIcon } from "lucide-react";
import { mediaKindOf } from "@/lib/mediaKind";
import { cn } from "@/lib/utils";
import { useEvidenceLinks, type Evidence } from "./api";

const sizeLabel = (bytes: number | null) => {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
};

/** What to call the thing when nobody wrote a caption. */
const fallbackLabel = (e: Evidence) => {
  switch (mediaKindOf(e.name)) {
    case "image": return "Photograph";
    case "video": return "Video";
    case "audio": return "Recording";
    default: return e.name;
  }
};

function Caption({ e }: { e: Evidence }) {
  const size = sizeLabel(e.size);
  return (
    <figcaption className="mt-1.5 text-xs text-muted-foreground">
      {e.caption || fallbackLabel(e)}
      {size && <span className="opacity-70"> · {size}</span>}
    </figcaption>
  );
}

/** A still, opened full size in its own tab for anyone who wants a closer look. */
function Photograph({ e, url }: { e: Evidence; url: string }) {
  const [broken, setBroken] = useState(false);
  // HEIC is kept because that is how a phone photograph arrives, but browsers
  // mostly will not draw it. Offering the file beats an empty frame.
  if (broken) return <Paper e={e} url={url} />;
  return (
    <figure>
      <a href={url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl border bg-muted">
        <img
          src={url}
          alt={e.caption || fallbackLabel(e)}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </a>
      <Caption e={e} />
    </figure>
  );
}

function Film({ e, url }: { e: Evidence; url: string }) {
  return (
    <figure>
      {/* Never autoplay: a visitor reading a report did not ask for sound. */}
      <video src={url} controls preload="metadata" playsInline className="h-48 w-full rounded-xl border bg-black object-contain" />
      <Caption e={e} />
    </figure>
  );
}

function Recording({ e, url }: { e: Evidence; url: string }) {
  return (
    <figure className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Music className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{e.caption || "Recording"}</span>
      </div>
      <audio src={url} controls preload="metadata" className="mt-2 w-full" />
      {e.size != null && <figcaption className="mt-1 text-xs text-muted-foreground">{sizeLabel(e.size)}</figcaption>}
    </figure>
  );
}

/** A report, dataset or questionnaire: a row that downloads. */
function Paper({ e, url }: { e: Evidence; url: string }) {
  const Icon = { image: FileText, video: VideoIcon, audio: Music, other: FileText }[mediaKindOf(e.name)];
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:border-primary/40 hover:bg-accent"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.caption || e.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{[e.caption ? e.name : null, sizeLabel(e.size)].filter(Boolean).join(" · ")}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

/**
 * The evidence behind one item.
 *
 * Renders nothing at all when there is none, so an item whose analyst
 * published no files reads exactly as it did before.
 */
export function EvidenceBlock({ evidence, className }: { evidence: Evidence[] | undefined; className?: string }) {
  // Undefined, not empty, when the page is talking to a database where the
  // evidence migration has not run: the key is simply absent from the item.
  const files = evidence ?? [];
  const links = useEvidenceLinks(files);
  if (!files.length) return null;

  // Every link is signed in one request, so they arrive together.
  const ready = files.map((e) => ({ e, url: links.data?.get(e.path) })).filter((x): x is { e: Evidence; url: string } => !!x.url);
  const watchable = ready.filter(({ e }) => mediaKindOf(e.name) !== "other");
  const papers = ready.filter(({ e }) => mediaKindOf(e.name) === "other");

  return (
    <section className={className}>
      <h2 className="mb-1 font-display text-2xl font-bold">Evidence</h2>
      <p className="mb-3 text-sm text-muted-foreground">What this is based on, as it was gathered.</p>

      {links.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {files.slice(0, 2).map((e) => <div key={e.id} className="h-48 animate-pulse rounded-xl bg-muted" />)}
        </div>
      )}

      {links.isError && <p className="text-sm text-muted-foreground">The evidence could not be loaded. Please reload the page.</p>}

      {watchable.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {watchable.map(({ e, url }) => {
            switch (mediaKindOf(e.name)) {
              case "image": return <Photograph key={e.id} e={e} url={url} />;
              case "video": return <Film key={e.id} e={e} url={url} />;
              default: return <Recording key={e.id} e={e} url={url} />;
            }
          })}
        </div>
      )}

      {papers.length > 0 && (
        <div className={cn("grid gap-2 sm:grid-cols-2", watchable.length > 0 && "mt-4")}>
          {papers.map(({ e, url }) => <Paper key={e.id} e={e} url={url} />)}
        </div>
      )}
    </section>
  );
}

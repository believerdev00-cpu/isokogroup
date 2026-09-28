// Building blocks of Isoko Entertainment: content rows that scroll sideways,
// poster and wide cards, a masonry gallery, save buttons and badges.
import { useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Film, ImageIcon, Mic, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { db, unwrap } from "@/features/services/api";
import { mediaUrl, type Status } from "./api";

// ============== IMAGES ==============
/** A lazy-loaded display image with a dark placeholder of the right shape. */
export function Img({ path, src, alt, size = "lg", className, ratio }: {
  path?: string | null; src?: string | null; alt: string; size?: "sm" | "lg"; className?: string; ratio?: string;
}) {
  const url = src ?? mediaUrl(path, size);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-neutral-800", className)} style={ratio ? { aspectRatio: ratio } : undefined}>
      {url && !failed ? (
        <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-600" aria-hidden>
          <ImageIcon className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}

// ============== BADGES ==============
export function DemoBadge({ className }: { className?: string }) {
  return <span className={cn("rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black", className)}>Demo</span>;
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white", className)}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
      </span>
      Live
    </span>
  );
}

/** Shown to staff on something the public can't see yet. */
export function StaffOnlyBanner({ status }: { status: Status }) {
  if (status === "published") return null;
  return (
    <div className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black">
      {status === "draft" ? "Draft" : status === "archived" ? "Archived" : "Scheduled"} — only media staff can see this page.
    </div>
  );
}

// ============== ROWS ==============
/** A titled row of cards that scrolls sideways (touch on phones, arrows on larger screens). */
export function Row({ title, to, children, className }: { title: string; to?: string; children: ReactNode; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className={cn("group/row relative", className)}>
      <div className="mb-3 flex items-end justify-between gap-4 px-4 md:px-10">
        <h2 className="font-display text-xl font-bold md:text-2xl">{title}</h2>
        {to && (
          <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-neutral-400 hover:text-white">
            See all <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="relative">
        <div ref={scroller} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 md:gap-4 md:scroll-px-10 md:px-10">
          {children}
        </div>
        {[-1, 1].map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => scroll(dir)}
            aria-label={dir < 0 ? "Scroll back" : "Scroll forward"}
            className={cn(
              "absolute top-0 hidden h-full w-10 items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/row:opacity-100 md:flex",
              dir < 0 ? "left-0" : "right-0",
            )}
          >
            {dir < 0 ? <ChevronLeft className="h-7 w-7" /> : <ChevronRight className="h-7 w-7" />}
          </button>
        ))}
      </div>
    </section>
  );
}

// ============== CARDS ==============
/** Tall poster card: films. */
export function PosterCard({ to, title, path, rank, demo, meta }: { to: string; title: string; path: string | null; rank?: number; demo?: boolean; meta?: string }) {
  return (
    <Link to={to} className="group w-[38vw] max-w-[190px] shrink-0 snap-start sm:w-[28vw] md:w-[180px]">
      <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:ring-white/40">
        <Img path={path} alt={title} size="sm" ratio="2 / 3" className="transition-transform duration-500 group-hover:scale-105" />
        {rank != null && (
          <span className="absolute left-0 top-3 rounded-r-md bg-primary px-2 py-0.5 font-display text-lg font-bold leading-tight text-white shadow-lg">
            {String(rank).padStart(2, "0")}
          </span>
        )}
        {demo && <DemoBadge className="absolute right-2 top-2" />}
        {!path && <span className="absolute inset-x-3 bottom-3 line-clamp-3 font-display text-lg font-bold">{title}</span>}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold">{title}</p>
      {meta && <p className="line-clamp-1 text-xs text-neutral-400">{meta}</p>}
    </Link>
  );
}

/** Wide 16:9 card: podcasts, live streams, events. */
export function WideCard({ to, title, path, src, subtitle, badge, demo, icon: Icon = Film, width = "wide" }: {
  to: string; title: string; path?: string | null; src?: string | null; subtitle?: string | null; badge?: ReactNode; demo?: boolean;
  icon?: typeof Film; width?: "wide" | "large";
}) {
  return (
    <Link
      to={to}
      className={cn("group shrink-0 snap-start", width === "large" ? "w-[80vw] max-w-[440px] md:w-[400px]" : "w-[64vw] max-w-[320px] md:w-[300px]")}
    >
      <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10 transition duration-300 group-hover:ring-white/40">
        <Img path={path} src={src} alt={title} size="sm" ratio="16 / 9" className="transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" aria-hidden />
        <div className="absolute left-2 top-2 flex gap-1.5">{badge}{demo && <DemoBadge />}</div>
        <Icon className="absolute bottom-3 right-3 h-5 w-5 text-white/80" aria-hidden />
      </div>
      <p className="mt-2 line-clamp-1 font-semibold">{title}</p>
      {subtitle && <p className="line-clamp-1 text-sm text-neutral-400">{subtitle}</p>}
    </Link>
  );
}

// ============== MASONRY ==============
/** Pinterest-style columns; each image keeps its own shape (from the stored size). */
export function Masonry({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("columns-2 gap-3 sm:columns-3 md:gap-4 lg:columns-4 2xl:columns-5 [&>*]:mb-3 md:[&>*]:mb-4", className)}>{children}</div>;
}

export function PinCard({ to, title, path, w, h, subtitle, demo, save }: {
  to: string; title: string; path: string | null; w?: number | null; h?: number | null; subtitle?: string | null; demo?: boolean;
  save?: { type: SaveType; id: string };
}) {
  const ratio = w && h ? `${w} / ${h}` : "4 / 5";
  return (
    <div className="group relative break-inside-avoid">
      <Link to={to} className="block overflow-hidden rounded-2xl">
        <Img path={path} alt={title} size="sm" ratio={ratio} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" aria-hidden />
        <div className="absolute inset-x-3 bottom-3 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <p className="line-clamp-2 text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="line-clamp-1 text-xs text-white/75">{subtitle}</p>}
        </div>
      </Link>
      {demo && <DemoBadge className="absolute left-2 top-2" />}
      {save && <SaveButton type={save.type} id={save.id} compact className="absolute right-2 top-2 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" />}
    </div>
  );
}

// ============== SAVES ==============
export type SaveType = "title" | "work" | "collection" | "event" | "creator";

function useMySaves() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ent", "saves", user?.id],
    enabled: !!user,
    queryFn: async () => new Set((unwrap(await db.from("ent_saves").select("item_type,item_id")) as { item_type: string; item_id: string }[]).map((s) => `${s.item_type}:${s.item_id}`)),
  });
}

export function SaveButton({ type, id, compact, className }: { type: SaveType; id: string; compact?: boolean; className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const saves = useMySaves();
  const saved = saves.data?.has(`${type}:${id}`) ?? false;
  const toggle = useMutation({
    mutationFn: async () => {
      if (saved) unwrap(await db.from("ent_saves").delete().eq("item_type", type).eq("item_id", id));
      else unwrap(await db.from("ent_saves").insert({ item_type: type, item_id: id }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ent", "saves"] }),
  });
  const onClick = () => {
    if (!user) return navigate("/login", { state: { from: location.pathname } });
    toggle.mutate();
  };
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={saved}
      aria-label={saved ? "Saved" : "Save"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors",
        compact ? "h-9 w-9 justify-center shadow-lg md:w-auto md:px-3 md:text-xs" : "h-11 px-5 text-sm",
        saved ? "bg-white text-black" : "bg-primary text-white hover:bg-primary/90",
        className,
      )}
    >
      <Icon className="h-4 w-4" /> <span className={cn(compact && "hidden md:inline")}>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

// ============== SECTIONS ==============
export function SectionIntro({ eyebrow, title, text, children }: { eyebrow: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <header className="px-4 pb-6 pt-8 md:px-10 md:pt-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-bold md:text-5xl">{title}</h1>
      {text && <p className="mt-3 max-w-2xl text-neutral-400 md:text-lg">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

/** What a section shows before its first item is published. */
export function ComingSoon({ what, icon: Icon = Film }: { what: string; icon?: typeof Film }) {
  return (
    <div className="mx-4 flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center md:mx-10">
      <Icon className="h-9 w-9 text-neutral-500" />
      <p className="mt-3 font-semibold">{what} are coming soon</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-400">Isoko Entertainment is getting ready. Check back soon, or book us for your own project.</p>
    </div>
  );
}

export function CategoryChips({ items, value, onChange }: { items: { slug: string; name: string }[]; value: string | null; onChange: (slug: string | null) => void }) {
  if (!items.length) return null;
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {[{ slug: null as string | null, name: "All" }, ...items].map((c) => (
        <button
          key={c.slug ?? "all"}
          type="button"
          onClick={() => onChange(c.slug)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            value === c.slug ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

export const SECTION_ICON = { film: Film, podcast: Mic, live: Radio, photo: ImageIcon };

/** An address that isn't (or isn't yet) on Isoko Entertainment. */
export function EntNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <p className="mt-3 text-lg font-semibold">This isn't on Isoko Entertainment</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-400">It may have been moved or taken down.</p>
      <Link to="/entertainment" className="mt-6 rounded-full bg-white px-6 py-3 font-semibold text-black hover:bg-white/85">Back to Entertainment</Link>
    </div>
  );
}

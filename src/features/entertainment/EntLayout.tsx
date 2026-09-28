import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, LayoutDashboard, Search, UserRound, X } from "lucide-react";
import logo from "@/assets/isoko-logo.jpeg";
import Footer from "@/components/Footer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useStaffAccess } from "@/features/staff/access";
import { ENT, linkFor, mediaUrl, useEntSearch } from "./api";

export const ENT_NAV = [
  { to: ENT, label: "Home", end: true },
  { to: `${ENT}/films`, label: "Films" },
  { to: `${ENT}/podcasts`, label: "Podcasts" },
  { to: `${ENT}/photo-studio`, label: "Photo Studio" },
  { to: `${ENT}/art-design`, label: "Art & Design" },
  { to: `${ENT}/fashion`, label: "Fashion" },
  { to: `${ENT}/live`, label: "Live" },
  { to: `${ENT}/events`, label: "Events" },
];

const KIND_LABEL: Record<string, string> = {
  film: "Film", podcast: "Podcast", creator: "Person", "work:photo": "Photo Studio", "work:art": "Art & Design",
  "work:fashion": "Fashion", collection: "Collection", event: "Event", live: "Live",
};

/**
 * Isoko Entertainment has its own dark, media-first shell: its own header,
 * section navigation and search, while staying part of the Isoko site.
 */
export default function EntLayout() {
  const { user } = useAuth();
  const staff = useStaffAccess();
  const [searching, setSearching] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  // "/" opens search, like most media sites
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement).closest("input, textarea")) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // The whole section uses the dark theme, whatever the site's setting
    <div className="dark min-h-screen overflow-x-clip bg-neutral-950 text-white [color-scheme:dark]">
      <header className={cn("sticky top-0 z-40 transition-colors duration-300", scrolled ? "bg-neutral-950/95 shadow-lg backdrop-blur" : "bg-gradient-to-b from-black/80 to-transparent")}>
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 md:h-16 md:px-10">
          <Link to="/" aria-label="Back to ISOKO GROUP" className="hidden rounded-full p-1 text-neutral-400 hover:text-white sm:block">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link to={ENT} className="flex min-w-0 items-center gap-2" aria-label="Isoko Entertainment home">
            <img src={logo} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="truncate font-display text-base font-bold leading-none tracking-wide md:text-lg">
              ISOKO <span className="text-primary"><span className="sm:hidden">ENT.</span><span className="hidden sm:inline">ENTERTAINMENT</span></span>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 xl:flex" aria-label="Entertainment">
            {ENT_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors", isActive ? "text-white" : "text-neutral-400 hover:text-white")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="flex h-10 items-center gap-2 rounded-full px-3 text-neutral-300 hover:bg-white/10 hover:text-white md:bg-white/10 md:pr-4"
              aria-label="Search Isoko Entertainment"
            >
              <Search className="h-5 w-5" /> <span className="hidden text-sm md:inline">Search</span>
            </button>
            {staff.isAdmin || staff.services.includes("entertainment") ? (
              <Link to="/staff/media" className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm text-neutral-300 hover:bg-white/10 hover:text-white sm:flex">
                <LayoutDashboard className="h-4 w-4" /> Manage
              </Link>
            ) : null}
            {user ? (
              <Link to={`${ENT}/saved`} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white" aria-label="Your saved items">
                <Bookmark className="h-5 w-5" />
              </Link>
            ) : (
              <Link to="/login" state={{ from: pathname }} className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 sm:px-4" aria-label="Sign in">
                <UserRound className="h-4 w-4" /> <span className="hidden sm:inline">Sign in</span>
              </Link>
            )}
          </div>
        </div>
        {/* Phones and tablets: the sections scroll sideways under the header */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 xl:hidden" aria-label="Entertainment sections">
          {ENT_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium", isActive ? "bg-white text-black" : "bg-white/10 text-neutral-200")}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="pb-16">
        <Outlet />
      </main>
      <Footer />
      <SearchDialog open={searching} onOpenChange={setSearching} />
    </div>
  );
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const hits = useEntSearch(q);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark top-4 max-w-2xl translate-y-0 gap-0 border-white/10 bg-neutral-900 p-0 text-white sm:top-20 [&>button]:hidden">
        <DialogTitle className="sr-only">Search Isoko Entertainment</DialogTitle>
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-5 w-5 shrink-0 text-neutral-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Films, podcasts, photographers, designers, models, events, live…"
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-neutral-500"
            aria-label="Search"
          />
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full p-2 text-neutral-400 hover:bg-white/10" aria-label="Close search">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-400">Type at least two letters.</p>
          ) : hits.isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-400">Searching…</p>
          ) : !hits.data?.length ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-400">Nothing found for “{q.trim()}”.</p>
          ) : (
            <ul>
              {hits.data.map((h) => (
                <li key={`${h.kind}:${h.id}`}>
                  <button type="button" onClick={() => go(linkFor(h.kind, h.slug))} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10">
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                      {h.image_path && <img src={mediaUrl(h.image_path, "sm") ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{h.title}</span>
                      <span className="block truncate text-xs text-neutral-400">
                        {KIND_LABEL[h.kind] ?? h.kind}
                        {h.subtitle ? ` · ${h.subtitle}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CATEGORIES, QUICK_ACCESS, SERVICES, searchServices, serviceById, type Service } from "@/lib/services";
import { formatDate, rpc } from "@/features/services/api";
import { ServiceLayout } from "@/features/services/ui";

// The Service Hub: every Isoko service, grouped by category, with search.
// Any service is two clicks away: find it here, then its main action.

type MyRequest = { service: "travel" | "consultancy" | "data"; reference: string; token: string; title: string; status: string; created_at: string };
const REQUEST_LINK: Record<MyRequest["service"], string> = { travel: "/travel/trip/", consultancy: "/consultancy/r/", data: "/data-analysis/r/" };

function MyRequests() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["my_service_requests", user?.id], queryFn: () => rpc<MyRequest[]>("my_service_requests"), enabled: !!user });
  if (!user || !q.data?.length) return null;
  return (
    <section className="container max-w-6xl pb-2" data-aos="fade-up">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your requests</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {q.data.slice(0, 6).map((r) => (
          <li key={r.reference}>
            <Link to={REQUEST_LINK[r.service] + r.token} className="card-interactive flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.reference} · {formatDate(r.created_at)}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ServiceCard({ s, style }: { s: Service; style?: React.CSSProperties }) {
  return (
    <article className="card-interactive group flex h-full flex-col rounded-2xl border bg-card p-5" style={style}>
      <Link to={s.path} className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
          <s.icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{s.name}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{s.description}</span>
        </span>
      </Link>
      <Link to={s.action.path} className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary">
        {s.action.label} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </article>
  );
}

export default function Services() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchServices(query), [query]);
  const searching = query.trim().length > 0;
  const input = useRef<HTMLInputElement>(null);
  const { hash } = useLocation();
  const [activeCat, setActiveCat] = useState<string>(CATEGORIES[0].key);

  // Jump to a category from the breadcrumb or menu (#logistics)
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [hash]);

  // Highlight the category you're looking at
  useEffect(() => {
    if (searching) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActiveCat(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    CATEGORIES.forEach((c) => {
      const el = document.getElementById(c.key);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [searching]);

  return (
    <ServiceLayout>
      {/* Hub header + search */}
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="container relative max-w-6xl py-12 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Service Hub</p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">Everything Isoko does, in one place</h1>
          <p className="mt-3 max-w-xl text-muted-foreground sm:text-lg">Find a service by name or by what you need to get done.</p>
          <div className="relative mt-8 max-w-2xl">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" aria-hidden />
            <Input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “send a parcel”, “hotel”, “course” or “survey”"
              className="h-14 rounded-full pl-14 pr-12 text-base shadow-sm"
              aria-label="Search services"
            />
            {searching && (
              <button type="button" onClick={() => { setQuery(""); input.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {searching ? (
        <section className="container max-w-6xl py-10" aria-live="polite">
          <p className="mb-4 text-sm text-muted-foreground">
            {results.length ? `${results.length} ${results.length === 1 ? "service" : "services"} for “${query.trim()}”` : `Nothing matches “${query.trim()}”. Try another word, or browse the categories.`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((s, i) => <ServiceCard key={s.id} s={s} style={{ animation: `fade-in-up 0.4s var(--ease-out) ${i * 40}ms both` }} />)}
          </div>
          {!results.length && (
            <button type="button" onClick={() => setQuery("")} className="mt-2 text-sm font-semibold text-primary">Show all services</button>
          )}
        </section>
      ) : (
        <>
          {/* Quick access */}
          <section className="container max-w-6xl py-10">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick access</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {QUICK_ACCESS.map((id) => serviceById(id)!).map((s, i) => (
                <Link
                  key={s.id}
                  to={s.action.path}
                  data-aos="fade-up"
                  data-aos-delay={i * 50}
                  className="card-interactive group flex flex-col items-start gap-3 rounded-2xl border bg-card p-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-110">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold leading-tight">{s.action.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <MyRequests />

          {/* Category jump bar */}
          <div className="sticky top-[5.75rem] z-30 border-y bg-background/90 backdrop-blur">
            <nav className="container flex max-w-6xl gap-1 overflow-x-auto py-2" aria-label="Categories">
              {CATEGORIES.map((c) => (
                <a
                  key={c.key}
                  href={`#${c.key}`}
                  onClick={(e) => { e.preventDefault(); document.getElementById(c.key)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  aria-current={activeCat === c.key ? "true" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-300",
                    activeCat === c.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <c.icon className="h-4 w-4" /> {c.title}
                </a>
              ))}
            </nav>
          </div>

          {/* Categories */}
          <div className="container max-w-6xl space-y-14 py-12 pb-20">
            {CATEGORIES.map((c) => (
              <section key={c.key} id={c.key} className="scroll-mt-40">
                <div className="mb-5 flex items-center gap-3" data-aos="fade-up">
                  <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", c.tint)}>
                    <c.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-bold">{c.title}</h2>
                    <p className="text-sm text-muted-foreground">{c.blurb}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {SERVICES.filter((s) => s.category === c.key).map((s, i) => (
                    <div key={s.id} data-aos="fade-up" data-aos-delay={i * 60}>
                      <ServiceCard s={s} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </ServiceLayout>
  );
}

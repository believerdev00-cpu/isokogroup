import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, BookOpenCheck, Compass, FileText, FlaskConical, Lightbulb, MapPinned, MessageCircleQuestion, Table2 } from "lucide-react";
import { ServiceLayout } from "@/features/services/ui";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  HUB, HUB_NAME, KIND_LABEL, KINDS, TAGLINE, kindLabel, searchPath, useCountries, useRegionCounts, useResearchCounts, useResearchSearch,
  useTopics, useTrendingQuestions, type Kind,
} from "../api";
import { CardSkeletons, Chip, EmptyState, HubSearchBox, ItemCard, SectionHeading } from "../ui";

const KIND_ICON: Record<Kind, typeof BarChart3> = {
  statistic: BarChart3, research: FlaskConical, report: FileText, study: BookOpenCheck, finding: Lightbulb, dataset: Table2, survey: Compass,
};

const SUGGESTIONS = [
  "What is the population of Rwanda?",
  "What are the main economic activities in Rwanda?",
  "What does research say about youth employment?",
  "What are the latest tourism statistics?",
];

/** The Information Hub front page: search first, then ways in. */
export default function HubHome() {
  useSeo({
    title: `${HUB_NAME}: research, statistics and reports about Rwanda`,
    description: "Find information, explore research, statistics, reports, studies, findings and datasets about Rwanda and beyond, in one place.",
    canonical: HUB,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: HUB_NAME,
      url: `https://www.isokogroups.com${HUB}`,
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `https://www.isokogroups.com${HUB}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  });
  const topics = useTopics();
  const featured = useResearchSearch({ limit: 6 });
  const counts = useResearchCounts();
  const trending = useTrendingQuestions(8);
  const countries = useCountries();
  const active = (countries.data ?? []).filter((c) => c.is_active);
  const lead = active[0];
  const regions = useRegionCounts(lead?.slug);
  const topLevel = (topics.data ?? []).filter((t) => !t.parent_id).slice(0, 10);
  const featuredItems = (featured.data ?? []).filter((i) => i.featured).slice(0, 6);
  const latest = (featured.data ?? []).slice(0, 6);
  const countOf = (k: Kind) => counts.data?.find((c) => c.kind === k)?.n ?? 0;
  const total = (counts.data ?? []).reduce((n, c) => n + Number(c.n), 0);

  return (
    <ServiceLayout>
      <section className="relative overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-red-950 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden>
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-red-500 blur-3xl" />
        </div>
        <div className="container relative max-w-6xl py-16 text-center sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">{HUB_NAME}</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">{TAGLINE}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
            Research, statistics, reports, studies and findings about Rwanda, and more countries to come. Ask a question in your own words.
          </p>
          <div className="mx-auto mt-8 max-w-3xl">
            <HubSearchBox size="lg" className="[&_input]:border-white/15 [&_input]:bg-white [&_input]:text-neutral-900" />
          </div>
          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
            {topLevel.map((t) => (
              <Link key={t.id} to={`${HUB}/topics/${t.slug}`} className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/20">
                {t.name}
              </Link>
            ))}
            {lead && (
              <Link to={`${HUB}/countries/${lead.slug}`} className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/20">
                {lead.name}
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="container max-w-6xl space-y-16 py-12 sm:py-16">
        <section>
          <SectionHeading title="Featured research" text="Picked by the Isoko research team." to={searchPath("")} toLabel="Browse everything" />
          {featured.isLoading ? (
            <CardSkeletons n={3} />
          ) : featuredItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredItems.map((i) => <ItemCard key={i.id} item={i} />)}
            </div>
          ) : latest.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((i) => <ItemCard key={i.id} item={i} />)}
            </div>
          ) : (
            <EmptyState title="Research is being added" text="The Isoko team is building the knowledge base. Ask a question above, or come back soon." />
          )}
        </section>

        <section>
          <SectionHeading title="Explore data" text={total > 0 ? `${total.toLocaleString("en-US")} items so far, by type.` : "Statistics, research, reports, studies, findings, datasets and surveys."} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const n = countOf(k);
              return (
                <Link key={k} to={searchPath("", { kind: k })} className="group rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md sm:p-5">
                  <Icon className="h-6 w-6 text-primary" aria-hidden />
                  <p className="mt-3 font-display text-lg font-bold">{KIND_LABEL[k]}</p>
                  <p className="text-sm text-muted-foreground">{counts.isLoading ? "…" : `${Number(n).toLocaleString("en-US")} ${Number(n) === 1 ? "item" : "items"}`}</p>
                </Link>
              );
            })}
            <Link to={searchPath("")} className="group flex flex-col justify-between rounded-2xl bg-primary p-4 text-primary-foreground transition hover:bg-primary/90 sm:p-5">
              <ArrowRight className="h-6 w-6" aria-hidden />
              <p className="mt-3 font-display text-lg font-bold">All information</p>
            </Link>
          </div>
        </section>

        <section>
          <SectionHeading title="Trending questions" text="What people are asking the hub." />
          {(trending.data?.length ?? 0) > 0 || trending.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {(trending.data ?? []).map((q) => (
                <Link key={q.question} to={searchPath(q.question)} className="flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50">
                  <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium">{q.question}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((q) => (
                <Link key={q} to={searchPath(q)} className="flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50">
                  <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium">{q}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {lead && (
          <section>
            <SectionHeading title={`Explore ${lead.name}`} text="Information by province and district." to={`${HUB}/countries/${lead.slug}`} toLabel={`All about ${lead.name}`} />
            {regions.isLoading ? (
              <CardSkeletons n={3} />
            ) : (regions.data?.length ?? 0) > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {regions.data!.map((r) => (
                  <Link key={r.region_id} to={`${HUB}/countries/${lead.slug}#${r.slug}`} className={cn("rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md", Number(r.n) === 0 && "opacity-70")}>
                    <MapPinned className="h-5 w-5 text-primary" aria-hidden />
                    <p className="mt-2 font-semibold leading-tight">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.level} · {Number(r.n).toLocaleString("en-US")} {Number(r.n) === 1 ? "item" : "items"}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title={`${lead.name} regions are being set up`} text="Province and district information will appear here." />
            )}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Browse by type</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {KINDS.map((k) => <Chip key={k} to={searchPath("", { kind: k })}>{kindLabel(k)}</Chip>)}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Need analysis of your own data?</p>
            <p className="mt-2 font-display text-xl font-bold">Isoko Data Analysis works on your files</p>
            <p className="mt-1 text-sm text-white/75">Surveys, spreadsheets and reports, cleaned and analysed by our team.</p>
            <Link to="/data-analysis" className="mt-4 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90">
              Request Data Analysis <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}

import { Link, useParams } from "react-router-dom";
import { MapPinned } from "lucide-react";
import { ServiceLayout } from "@/features/services/ui";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { HUB, HUB_NAME, searchPath, useCountries, useRegionCounts, useResearchSearch, useTopics } from "../api";
import { CardSkeletons, Chip, EmptyState, ErrorState, HubCrumbs, HubSearchBox, ItemCard, SectionHeading } from "../ui";

/** Everything the hub has about one country, by region and topic. */
export default function HubCountry() {
  const { slug } = useParams();
  const countries = useCountries();
  const country = (countries.data ?? []).find((c) => c.slug === slug) ?? null;
  const regions = useRegionCounts(country?.slug);
  const latest = useResearchSearch({ country: slug, limit: 9 }, !!slug);
  const topics = useTopics();
  const topLevel = (topics.data ?? []).filter((t) => !t.parent_id);
  useSeo({
    title: country ? `${country.name}: research, statistics and reports · ${HUB_NAME}` : HUB_NAME,
    description: country ? `Research, statistics, reports and findings about ${country.name}, by province, district and topic.` : "Country information from the ISOKO Information Hub.",
    canonical: `${HUB}/countries/${slug ?? ""}`,
    jsonLd: country ? { "@context": "https://schema.org", "@type": "CollectionPage", name: `${country.name} information`, about: { "@type": "Country", name: country.name }, url: `https://www.isokogroups.com${HUB}/countries/${country.slug}` } : undefined,
    noindex: !country,
  });
  const total = latest.data?.[0]?.total ?? 0;

  return (
    <ServiceLayout>
      <div className="container max-w-6xl py-8 sm:py-10">
        <HubCrumbs items={[{ label: HUB_NAME, to: HUB }, { label: country?.name ?? "Country" }]} />
        {countries.isLoading ? (
          <CardSkeletons n={3} />
        ) : countries.isError ? (
          <ErrorState onRetry={() => countries.refetch()} />
        ) : !country ? (
          <EmptyState title="We don't cover this country yet" text="Rwanda is where the hub starts; more countries are on the way.">
            <Chip to={HUB}>Information Hub</Chip>
          </EmptyState>
        ) : (
          <>
            <header className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Country</p>
              <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{country.name}</h1>
              <p className="mt-3 text-muted-foreground">{total > 0 ? `${total.toLocaleString("en-US")} ${total === 1 ? "item" : "items"} of research, statistics and reports.` : "Research and statistics are being added."}</p>
              <HubSearchBox className="mt-5" placeholder={`Ask about ${country.name}…`} />
            </header>

            <section className="mt-12">
              <SectionHeading title="By region" text="Provinces, districts and cities." />
              {regions.isLoading ? (
                <CardSkeletons n={3} />
              ) : (regions.data?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {regions.data!.map((r) => (
                    <div key={r.region_id} id={r.slug} className={cn("scroll-mt-24 rounded-2xl border bg-card p-4", Number(r.n) === 0 && "opacity-70")}>
                      <MapPinned className="h-5 w-5 text-primary" aria-hidden />
                      <p className="mt-2 font-semibold leading-tight">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.level} · {Number(r.n).toLocaleString("en-US")} {Number(r.n) === 1 ? "item" : "items"}</p>
                      {Number(r.n) > 0 && <Link to={searchPath(r.name, { country: country.slug })} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">See information</Link>}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Regions are being set up" />
              )}
            </section>

            <section className="mt-12">
              <SectionHeading title="By topic" />
              <div className="flex flex-wrap gap-2">
                {topLevel.map((t) => <Chip key={t.id} to={searchPath("", { country: country.slug, topic: t.slug })}>{t.name}</Chip>)}
              </div>
            </section>

            <section className="mt-12">
              <SectionHeading title={`Latest about ${country.name}`} to={searchPath("", { country: country.slug })} toLabel="See all" />
              {latest.isLoading ? (
                <CardSkeletons n={3} />
              ) : latest.isError ? (
                <ErrorState onRetry={() => latest.refetch()} />
              ) : (latest.data?.length ?? 0) > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {latest.data!.map((i) => <ItemCard key={i.id} item={i} />)}
                </div>
              ) : (
                <EmptyState title="Nothing published yet" text="Ask a question above; the hub answers from what is known so far." />
              )}
            </section>
          </>
        )}
      </div>
    </ServiceLayout>
  );
}

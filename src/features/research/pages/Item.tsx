import { Link, useParams } from "react-router-dom";
import { ServiceLayout } from "@/features/services/ui";
import { useSeo } from "@/lib/seo";
import { HUB, HUB_NAME, coverUrl, formatDate, kindOne, periodLabel, searchPath, useResearchItem, type ItemDetail } from "../api";
import { StatsBlock } from "../charts";
import { Chip, DemoBadge, EmptyState, ErrorState, HubCrumbs, KindBadge, RowSkeletons, TextBody, VerifiedBadge } from "../ui";
import Comments from "@/features/comments/Comments";

const SCHEMA_TYPE: Record<string, string> = {
  statistic: "Dataset", dataset: "Dataset", survey: "Dataset", research: "ScholarlyArticle", study: "ScholarlyArticle", report: "Report", finding: "Article",
};

function jsonLd(item: ItemDetail) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[item.kind] ?? "Article",
    name: item.title,
    headline: item.title,
    description: item.summary ?? undefined,
    url: `https://www.isokogroups.com${HUB}/${item.slug}`,
    datePublished: item.published_on ?? undefined,
    dateModified: item.updated_at,
    keywords: [...item.keywords, ...item.tags].join(", ") || undefined,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: "ISOKO GROUPS COMPANY LTD" },
    author: item.author ? { "@type": "Person", name: item.author } : item.organization ? { "@type": "Organization", name: item.organization } : undefined,
    spatialCoverage: item.country ? { "@type": "Place", name: item.region ? `${item.region.name}, ${item.country.name}` : item.country.name } : undefined,
    temporalCoverage: item.period_start ? `${item.period_start}${item.period_end ? `/${item.period_end}` : ""}` : undefined,
    image: coverUrl(item.cover_path) ?? undefined,
  };
  if (item.sources.length) base.citation = item.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url ?? undefined, publisher: s.publisher ?? undefined }));
  return base;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** One piece of information: what it says, the numbers behind it, where it comes from. */
export default function HubItem() {
  const { slug } = useParams();
  const item = useResearchItem(slug);
  const d = item.data ?? null;
  useSeo({
    title: d ? `${d.title} · ${HUB_NAME}` : HUB_NAME,
    description: d?.summary ?? (d ? `${kindOne(d.kind)}${d.country ? ` about ${d.country.name}` : ""} from the ${HUB_NAME}.` : "Information from the ISOKO Information Hub."),
    canonical: `${HUB}/${slug ?? ""}`,
    type: "article",
    image: coverUrl(d?.cover_path) ?? undefined,
    jsonLd: d ? jsonLd(d) : undefined,
    noindex: !d,
  });

  if (item.isLoading) {
    return (
      <ServiceLayout>
        <div className="container max-w-6xl py-10"><RowSkeletons n={3} /></div>
      </ServiceLayout>
    );
  }
  if (item.isError) {
    return (
      <ServiceLayout>
        <div className="container max-w-6xl py-10"><ErrorState message="This page could not be loaded." onRetry={() => item.refetch()} /></div>
      </ServiceLayout>
    );
  }
  if (!d) {
    return (
      <ServiceLayout>
        <div className="container max-w-6xl py-10">
          <EmptyState title="We don't have this page" text="It may have been moved or unpublished.">
            <Chip to={HUB}>Information Hub</Chip>
            <Chip to={searchPath("")}>Browse everything</Chip>
          </EmptyState>
        </div>
      </ServiceLayout>
    );
  }

  const cover = coverUrl(d.cover_path);
  const period = periodLabel(d.period_start, d.period_end);
  return (
    <ServiceLayout>
      <article className="container max-w-6xl py-8 sm:py-10">
        <HubCrumbs items={[
          { label: HUB_NAME, to: HUB },
          ...(d.country ? [{ label: d.country.name, to: `${HUB}/countries/${d.country.slug}` }] : []),
          ...(d.topic ? [{ label: d.topic.name, to: `${HUB}/topics/${d.topic.slug}` }] : []),
          { label: kindOne(d.kind) },
        ]} />
        <header className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={d.kind} />
            <VerifiedBadge verification={d.verification} />
            <DemoBadge demo={d.is_demo} />
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-5xl">{d.title}</h1>
          {d.summary && <p className="mt-4 text-lg text-muted-foreground">{d.summary}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            {[d.country?.name && (d.region ? `${d.region.name}, ${d.country.name}` : d.country.name), period, d.published_on && `Published ${formatDate(d.published_on)}`].filter(Boolean).join(" · ")}
          </p>
        </header>
        {cover && <img src={cover} alt="" className="mt-6 max-h-[28rem] w-full rounded-2xl object-cover" />}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-8">
            {d.stats.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-2xl font-bold">Key figures</h2>
                <StatsBlock stats={d.stats} />
              </section>
            )}
            {d.body && (
              <section>
                <h2 className="mb-3 font-display text-2xl font-bold">Findings</h2>
                <TextBody text={d.body} className="text-base" />
              </section>
            )}
            {d.methodology && (
              <section>
                <h2 className="mb-3 font-display text-2xl font-bold">Methodology</h2>
                <TextBody text={d.methodology} className="text-sm text-muted-foreground" />
              </section>
            )}
            {(d.sources.length > 0 || d.source_name) && (
              <section>
                <h2 className="mb-3 font-display text-2xl font-bold">Sources</h2>
                <ul className="space-y-2 text-sm">
                  {d.source_name && (
                    <li>
                      {d.source_url ? <a href={d.source_url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline">{d.source_name}</a> : <span className="font-medium">{d.source_name}</span>}
                    </li>
                  )}
                  {d.sources.map((s) => (
                    <li key={s.id}>
                      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline">{s.title}</a> : <span className="font-medium">{s.title}</span>}
                      {s.publisher && <span className="text-muted-foreground"> · {s.publisher}</span>}
                      {s.published_on && <span className="text-muted-foreground"> · {formatDate(s.published_on)}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <dl className="rounded-2xl border bg-card p-5">
              <Fact label="Type">{kindOne(d.kind)}</Fact>
              <Fact label="Country">{d.country ? <Link to={`${HUB}/countries/${d.country.slug}`} className="text-primary hover:underline">{d.country.name}</Link> : null}</Fact>
              <Fact label={d.region?.level ? d.region.level[0].toUpperCase() + d.region.level.slice(1) : "Region"}>{d.region?.name}</Fact>
              <Fact label="Topic">{d.topic ? <Link to={`${HUB}/topics/${d.topic.slug}`} className="text-primary hover:underline">{d.topic.name}</Link> : null}</Fact>
              <Fact label="Subtopic">{d.subtopic ? <Link to={`${HUB}/topics/${d.subtopic.slug}`} className="text-primary hover:underline">{d.subtopic.name}</Link> : null}</Fact>
              <Fact label="Period">{period}</Fact>
              <Fact label="Published">{formatDate(d.published_on)}</Fact>
              <Fact label="Author">{d.author}</Fact>
              <Fact label="Organization">{d.organization}</Fact>
              <Fact label="Verification">{d.verification === "verified" ? `Verified by Isoko${d.verified_at ? ` on ${formatDate(d.verified_at)}` : ""}` : "Not yet verified"}</Fact>
              <Fact label="Last updated">{formatDate(d.updated_at)}</Fact>
            </dl>
            {(d.tags.length > 0 || d.keywords.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {[...new Set([...d.tags, ...d.keywords])].slice(0, 12).map((t) => <Chip key={t} to={searchPath(t)}>{t}</Chip>)}
              </div>
            )}
            {d.related.length > 0 && (
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Related</h2>
                <ul className="mt-2 space-y-2">
                  {d.related.map((r) => (
                    <li key={r.id}>
                      <Link to={`${HUB}/${r.slug}`} className="font-medium hover:text-primary">{r.title}</Link>
                      <span className="ml-2 text-xs text-muted-foreground">{kindOne(r.kind)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </article>

        {/* Readers talk back. Nothing appears until it has been approved. */}
        {d && (
          <div className="container max-w-3xl pb-12">
            <Comments subjectType="research_item" subjectId={d.id} title="Comments on this" />
          </div>
        )}
    </ServiceLayout>
  );
}

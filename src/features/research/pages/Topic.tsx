import { useParams, useSearchParams } from "react-router-dom";
import { ServiceLayout } from "@/features/services/ui";
import { useSeo } from "@/lib/seo";
import { HUB, HUB_NAME, PAGE_SIZE, searchPath, useResearchSearch, useTopics } from "../api";
import { Chip, EmptyState, ErrorState, HubCrumbs, HubSearchBox, ItemRow, Pagination, RowSkeletons, SectionHeading } from "../ui";

/** One topic (or subtopic): what it covers, its subtopics, and its information. */
export default function HubTopic() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const topics = useTopics();
  const topic = (topics.data ?? []).find((t) => t.slug === slug) ?? null;
  const parent = topic?.parent_id ? (topics.data ?? []).find((t) => t.id === topic.parent_id) ?? null : null;
  const children = topic ? (topics.data ?? []).filter((t) => t.parent_id === topic.id) : [];
  const items = useResearchSearch({ topic: slug, page }, !!slug);
  const total = items.data?.[0]?.total ?? 0;
  useSeo({
    title: topic ? `${topic.name}: research, statistics and reports · ${HUB_NAME}` : HUB_NAME,
    description: topic?.description ?? (topic ? `Research, statistics, reports, studies and findings about ${topic.name.toLowerCase()}.` : "Topic information from the ISOKO Information Hub."),
    canonical: `${HUB}/topics/${slug ?? ""}`,
    jsonLd: topic ? { "@context": "https://schema.org", "@type": "CollectionPage", name: topic.name, url: `https://www.isokogroups.com${HUB}/topics/${topic.slug}` } : undefined,
    noindex: !topic || page > 1,
  });
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p)); else next.delete("page");
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <ServiceLayout>
      <div className="container max-w-6xl py-8 sm:py-10">
        <HubCrumbs items={[{ label: HUB_NAME, to: HUB }, ...(parent ? [{ label: parent.name, to: `${HUB}/topics/${parent.slug}` }] : []), { label: topic?.name ?? "Topic" }]} />
        {topics.isLoading ? (
          <RowSkeletons n={3} />
        ) : topics.isError ? (
          <ErrorState onRetry={() => topics.refetch()} />
        ) : !topic ? (
          <EmptyState title="We don't have this topic" text="It may have been renamed.">
            <Chip to={HUB}>Information Hub</Chip>
          </EmptyState>
        ) : (
          <>
            <header className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{parent ? "Subtopic" : "Topic"}</p>
              <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{topic.name}</h1>
              {topic.description && <p className="mt-3 text-lg text-muted-foreground">{topic.description}</p>}
              <HubSearchBox className="mt-5" placeholder={`Ask about ${topic.name.toLowerCase()}…`} />
            </header>
            {children.length > 0 && (
              <section className="mt-10">
                <SectionHeading title="Subtopics" />
                <div className="flex flex-wrap gap-2">
                  {children.map((c) => <Chip key={c.id} to={`${HUB}/topics/${c.slug}`}>{c.name}</Chip>)}
                </div>
              </section>
            )}
            <section className="mt-10">
              <SectionHeading title="Information" text={total > 0 ? `${total.toLocaleString("en-US")} ${total === 1 ? "item" : "items"}` : undefined} to={searchPath("", { topic: topic.slug })} toLabel="Search within" />
              {items.isLoading ? (
                <RowSkeletons />
              ) : items.isError ? (
                <ErrorState onRetry={() => items.refetch()} />
              ) : (items.data?.length ?? 0) > 0 ? (
                <div className="space-y-3">{items.data!.map((i) => <ItemRow key={i.id} item={i} />)}</div>
              ) : (
                <EmptyState title="Nothing published on this topic yet" text="Ask a question above, or browse other topics.">
                  <Chip to={HUB}>All topics</Chip>
                </EmptyState>
              )}
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
            </section>
          </>
        )}
      </div>
    </ServiceLayout>
  );
}

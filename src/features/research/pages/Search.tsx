import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceLayout } from "@/features/services/ui";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  AskError, HUB, HUB_NAME, KINDS, PAGE_SIZE, askResearch, forgetSearches, kindLabel, recentSearches, rememberSearch, searchPath,
  useCountries, useResearchSearch, useTopics,
} from "../api";
import { Chip, EmptyState, ErrorState, HubCrumbs, HubSearchBox, ItemRow, Pagination, RowSkeletons, TextBody } from "../ui";

/** One search: the engine's answer first (when there is a question), then everything that matches. */
export default function HubSearch() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const country = params.get("country") || null;
  const kind = params.get("kind") || null;
  const topic = params.get("topic") || null;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const filtered = !!(country || kind || topic);

  useSeo({
    title: q ? `${q} · ${HUB_NAME}` : `Browse the ${HUB_NAME}`,
    description: q ? `Information, research and statistics about: ${q}.` : "Browse research, statistics, reports, studies, findings and datasets.",
    canonical: searchPath(q, { country, kind, topic }),
    noindex: !!q || page > 1,
    jsonLd: { "@context": "https://schema.org", "@type": "SearchResultsPage", name: q || "Browse" },
  });

  useEffect(() => { if (q) rememberSearch(q); }, [q]);
  const [recent, setRecent] = useState<string[]>(() => recentSearches());
  useEffect(() => { setRecent(recentSearches()); }, [q]);

  const results = useResearchSearch({ q, country, kind, topic, page });
  const ask = useQuery({
    queryKey: ["research", "ask", q, country],
    enabled: q.length >= 3 && page === 1,
    staleTime: 10 * 60_000,
    retry: (count, err) => !(err instanceof AskError && err.status === 429) && count < 1,
    queryFn: () => askResearch(q, country),
  });
  const countries = useCountries();
  const topics = useTopics();
  const topLevel = useMemo(() => (topics.data ?? []).filter((t) => !t.parent_id), [topics.data]);
  const total = results.data?.[0]?.total ?? 0;

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p)); else next.delete("page");
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <ServiceLayout>
      <div className="container max-w-6xl py-8 sm:py-10">
        <HubCrumbs items={[{ label: HUB_NAME, to: HUB }, { label: q ? "Search" : "Browse" }]} />
        <HubSearchBox key={q} initial={q} autoFocus={!q} />

        {!q && recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground"><History className="h-4 w-4" aria-hidden /> Recent:</span>
            {recent.map((r) => <Chip key={r} to={searchPath(r)}>{r}</Chip>)}
            <button type="button" onClick={() => { forgetSearches(); setRecent([]); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Clear recent searches">
              <X className="h-3.5 w-3.5" aria-hidden /> Clear
            </button>
          </div>
        )}

        {q && page === 1 && (
          <section className="mt-6" aria-live="polite">
            {ask.isLoading ? (
              <div className="rounded-2xl border bg-card p-5 sm:p-6">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-11/12" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            ) : ask.isError ? (
              ask.error instanceof AskError && ask.error.status === 429 ? (
                <div className="rounded-2xl border bg-muted/40 p-5 text-sm" role="status">{ask.error.message}</div>
              ) : (
                <ErrorState message="We could not answer right now; the results below are still available." onRetry={() => ask.refetch()} />
              )
            ) : ask.data ? (
              <AnswerCard q={q} data={ask.data} />
            ) : null}
          </section>
        )}

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip to={searchPath(q, { country, topic })} active={!kind}>All types</Chip>
            {KINDS.map((k) => <Chip key={k} to={searchPath(q, { country, topic, kind: k })} active={kind === k}>{kindLabel(k)}</Chip>)}
          </div>
          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
            <label className="text-sm">
              <span className="sr-only">Country</span>
              <select value={country ?? ""} onChange={(e) => setFilter("country", e.target.value || null)} className="h-10 w-full rounded-full border bg-background px-3 text-sm">
                <option value="">All countries</option>
                {(countries.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="sr-only">Topic</span>
              <select value={topic ?? ""} onChange={(e) => setFilter("topic", e.target.value || null)} className="h-10 w-full rounded-full border bg-background px-3 text-sm">
                <option value="">All topics</option>
                {topLevel.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <p className="mb-3 text-sm text-muted-foreground" role="status">
            {results.isLoading ? "Searching…" : total > 0 ? `${total.toLocaleString("en-US")} ${total === 1 ? "result" : "results"}${q ? ` for “${q}”` : ""}` : ""}
          </p>
          {results.isLoading ? (
            <RowSkeletons />
          ) : results.isError ? (
            <ErrorState message="The results could not be loaded." onRetry={() => results.refetch()} />
          ) : (results.data?.length ?? 0) === 0 ? (
            <EmptyState title={q ? "No matching information yet" : "Nothing published yet"} text={q ? "Try other words, a broader topic, or remove a filter." : "The Isoko team is adding research. Come back soon."}>
              {filtered && <Chip to={searchPath(q)}>Remove filters</Chip>}
              {q && <Chip to={searchPath("")}>Browse everything</Chip>}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {results.data!.map((r) => <ItemRow key={r.id} item={r} />)}
            </div>
          )}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </section>
      </div>
    </ServiceLayout>
  );
}

function AnswerCard({ q, data }: { q: string; data: NonNullable<Awaited<ReturnType<typeof askResearch>>> }) {
  const none = data.mode === "none" && !data.answer;
  return (
    <div className={cn("rounded-2xl border bg-card p-5 sm:p-6", !none && "border-primary/30 shadow-sm")}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
        <Sparkles className="h-4 w-4" aria-hidden /> {none ? "Not enough information yet" : data.ai ? "Answer" : "What we have"}
      </p>
      {data.answer ? (
        <TextBody text={data.answer} className="mt-3 text-base" />
      ) : none ? (
        <div className="mt-3 text-muted-foreground">
          <p>We could not find enough reliable information about “{q}” yet.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Try a shorter question or a different wording.</li>
            <li>Browse a topic: <Link to={`${HUB}`} className="text-primary hover:underline">see all topics</Link>.</li>
            <li>Need custom analysis? <Link to="/data-analysis" className="text-primary hover:underline">Ask Isoko Data Analysis</Link>.</li>
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground">An AI summary is not available yet; here is what we have on this.</p>
      )}
      {data.conflicts?.length > 0 && (
        <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
          <p className="font-semibold">Figures differ between studies</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {data.conflicts.map((c, i) => <li key={i}><span className="font-medium text-foreground">{c.topic}:</span> {c.note}</li>)}
          </ul>
        </div>
      )}
      {data.items?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Read more</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.items.slice(0, 6).map((i) => (
              <li key={i.id}><Chip to={`${HUB}/${i.slug}`}>{i.title}</Chip></li>
            ))}
          </ul>
        </div>
      )}
      {data.sources?.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Sources</summary>
          <ul className="mt-2 space-y-1">
            {data.sources.map((s, i) => (
              <li key={i}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">{s.title}</a>
                ) : (
                  <span>{s.title}</span>
                )}
                {s.publisher && <span className="text-muted-foreground"> · {s.publisher}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!none && !data.ai && (
        <p className="mt-3 text-xs text-muted-foreground">Figures and findings are as recorded by their sources; dates and methods can differ between studies.</p>
      )}
      <div className="mt-4">
        <Button asChild variant="outline" size="sm"><Link to={HUB}>Ask another question</Link></Button>
      </div>
    </div>
  );
}

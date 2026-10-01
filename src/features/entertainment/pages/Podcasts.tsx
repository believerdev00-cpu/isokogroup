import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Headphones, Mic, Video } from "lucide-react";
import { db, unwrap } from "@/features/services/api";
import { PageLoading } from "@/features/services/ui";
import {
  ENT, linkFor, mediaUrl, onlyPublic, trending, useBySlug, useCategories, useChildren, useCreators, useTitles,
  type Credit, type Episode, type Title,
} from "../api";
import { CategoryChips, ComingSoon, EntNotFound, Img, Row, SaveButton, SectionIntro, StaffOnlyBanner, WideCard } from "../ui";
import { FinalCta, Hero, heroImage, Player } from "../parts";
import { Fact, PersonName } from "./Films";

type EpisodeWithShow = Episode & { show: Pick<Title, "slug" | "title" | "poster_path" | "status" | "publish_at" | "kind"> | null };

const epDate = (e: Episode) => new Date(e.publish_at ?? e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const epPath = (showSlug: string, e: Episode) => `${ENT}/podcasts/${showSlug}/episodes/${e.id}`;

function useLatestEpisodes(limit = 20) {
  return useQuery({
    queryKey: ["ent", "episodes", "latest", limit],
    queryFn: async () =>
      unwrap(await db.from("ent_episodes").select("*, show:ent_titles(slug,title,poster_path,status,publish_at,kind)").order("created_at", { ascending: false }).limit(limit)) as EpisodeWithShow[],
  });
}

export function PodcastsPage() {
  const shows = useTitles("podcast", 200);
  const cats = useCategories("podcast");
  const hosts = useCreators("host", 20);
  const latest = useLatestEpisodes();
  const [cat, setCat] = useState<string | null>(null);
  const list = onlyPublic(shows.data);
  if (shows.isLoading) return <PageLoading />;

  const lead = list.find((t) => t.featured) ?? list[0];
  // TV series share the episodes table: only podcast episodes belong here
  const episodes = onlyPublic(latest.data).filter((e) => e.show?.kind === "podcast");
  const filtered = cat ? list.filter((t) => t.category_id === (cats.data ?? []).find((c) => c.slug === cat)?.id) : null;

  return (
    <>
      {lead ? (
        <Hero image={heroImage(lead.backdrop_path ?? lead.poster_path)} eyebrow="Featured podcast" title={lead.title} text={lead.tagline ?? lead.description} demo={lead.is_demo}>
          <Link to={linkFor("podcast", lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            <Headphones className="h-5 w-5" /> Listen
          </Link>
        </Hero>
      ) : (
        <SectionIntro eyebrow="Isoko Podcasts" title="Podcasts" text="Conversations on business, culture, tech and life in Rwanda and beyond. Audio and video." />
      )}

      <div className="relative z-10 space-y-10 pt-4">
        {list.length === 0 ? (
          <ComingSoon what="Podcasts" icon={Mic} />
        ) : (
          <>
            <div className="px-4 md:px-10"><CategoryChips items={cats.data ?? []} value={cat} onChange={setCat} /></div>
            {filtered ? (
              <ShowGrid shows={filtered} />
            ) : (
              <>
                {trending(list).length > 0 && (
                  <Row title="Trending podcasts">
                    {trending(list).map((t) => <ShowCard key={t.id} show={t} />)}
                  </Row>
                )}
                {episodes.length > 0 && (
                  <Row title="Latest episodes">
                    {episodes.map((e) => (
                      <WideCard
                        key={e.id}
                        to={epPath(e.show!.slug, e)}
                        title={e.name}
                        path={e.thumb_path ?? e.show!.poster_path}
                        subtitle={`${e.show!.title} · ${epDate(e)}${e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}`}
                        icon={e.format === "video" ? Video : Headphones}
                        demo={e.is_demo}
                      />
                    ))}
                  </Row>
                )}
                <Row title="Popular shows">
                  {[...list].sort((a, b) => Number(b.featured) - Number(a.featured)).map((t) => <ShowCard key={t.id} show={t} />)}
                </Row>
              </>
            )}
            {onlyPublic(hosts.data).length > 0 && (
              <Row title="Hosts">
                {onlyPublic(hosts.data).map((h) => (
                  <Link key={h.id} to={linkFor("creator", h.slug)} className="w-28 shrink-0 snap-start text-center">
                    <Img path={h.avatar_path} alt={h.display_name} size="sm" ratio="1 / 1" className="rounded-full ring-1 ring-white/10" />
                    <p className="mt-2 line-clamp-2 text-sm font-semibold">{h.display_name}</p>
                  </Link>
                ))}
              </Row>
            )}
          </>
        )}
      </div>
      <FinalCta />
    </>
  );
}

function ShowCard({ show }: { show: Title }) {
  return (
    <Link to={linkFor("podcast", show.slug)} className="group w-[40vw] max-w-[200px] shrink-0 snap-start md:w-[190px]">
      <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10 transition group-hover:ring-white/40">
        <Img path={show.poster_path} alt={show.title} size="sm" ratio="1 / 1" className="transition-transform duration-500 group-hover:scale-105" />
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold">{show.title}</p>
      {show.tagline && <p className="line-clamp-1 text-xs text-neutral-400">{show.tagline}</p>}
    </Link>
  );
}

function ShowGrid({ shows }: { shows: Title[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-3 md:grid-cols-5 md:px-10 [&>a]:w-full [&>a]:max-w-none">
      {shows.map((s) => <ShowCard key={s.id} show={s} />)}
    </div>
  );
}

export function ShowDetail() {
  const { slug } = useParams();
  const show = useBySlug<Title>("ent_titles", slug);
  const credits = useChildren<Credit>("ent_credits", "title_id", show.data?.id);
  const episodes = useChildren<Episode>("ent_episodes", "title_id", show.data?.id, "number");
  if (show.isLoading) return <PageLoading />;
  const s = show.data;
  if (!s || s.kind !== "podcast") return <EntNotFound />;
  const eps = onlyPublic(episodes.data).sort((a, b) => b.season - a.season || b.number - a.number);
  const hosts = (credits.data ?? []).filter((c) => c.role === "host");

  return (
    <>
      <StaffOnlyBanner status={s.status} />
      <section className="px-4 pb-8 pt-6 md:px-10 md:pt-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end">
          <Img path={s.poster_path} alt={s.title} ratio="1 / 1" className="w-48 shrink-0 rounded-2xl shadow-2xl ring-1 ring-white/10 md:w-64" />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Podcast</p>
            <h1 className="font-display text-4xl font-bold md:text-6xl">{s.title}</h1>
            {hosts.length > 0 && <p className="text-neutral-300">Hosted by {hosts.map((h, i) => <span key={h.id}>{i > 0 && ", "}<PersonName credit={h} /></span>)}</p>}
            {s.tagline && <p className="text-lg text-neutral-300">{s.tagline}</p>}
            <div className="flex flex-wrap gap-3 pt-1">
              {eps[0] && (
                <Link to={epPath(s.slug, eps[0])} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
                  <Headphones className="h-5 w-5" /> Latest episode
                </Link>
              )}
              <SaveButton type="title" id={s.id} />
            </div>
          </div>
        </div>
        {s.description && <p className="mt-8 max-w-3xl whitespace-pre-line leading-relaxed text-neutral-300">{s.description}</p>}
      </section>

      <section className="px-4 md:px-10">
        <h2 className="mb-3 font-display text-2xl font-bold">Episodes</h2>
        {eps.length === 0 ? (
          <p className="text-neutral-400">The first episode is coming soon.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-2xl bg-white/[0.03]">
            {eps.map((e) => (
              <li key={e.id}>
                <Link to={epPath(s.slug, e)} className="flex gap-4 p-4 hover:bg-white/5">
                  <Img path={e.thumb_path ?? s.poster_path} alt="" size="sm" ratio="1 / 1" className="w-16 shrink-0 rounded-lg md:w-24" />
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-400">S{e.season} · E{e.number} · {epDate(e)}{e.duration_minutes ? ` · ${e.duration_minutes} min` : ""} · {e.format === "video" ? "Video" : "Audio"}</p>
                    <p className="font-semibold">{e.name}</p>
                    {e.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{e.description}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function EpisodeDetail() {
  const { slug, episodeId } = useParams();
  const show = useBySlug<Title>("ent_titles", slug);
  const episodes = useChildren<Episode>("ent_episodes", "title_id", show.data?.id, "number");
  if (show.isLoading || episodes.isLoading) return <PageLoading />;
  const s = show.data;
  const e = episodes.data?.find((x) => x.id === episodeId);
  if (!s || !e) return <EntNotFound />;
  const others = onlyPublic(episodes.data).filter((x) => x.id !== e.id).sort((a, b) => b.number - a.number).slice(0, 12);

  return (
    <>
      <StaffOnlyBanner status={e.status} />
      <div className="mx-auto max-w-4xl space-y-6 px-4 pt-6 md:pt-10">
        <Link to={linkFor("podcast", s.slug)} className="text-sm font-semibold text-neutral-400 hover:text-white">← {s.title}</Link>
        <div className="flex gap-4">
          <img src={mediaUrl(e.thumb_path ?? s.poster_path, "sm") ?? undefined} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-neutral-800 object-cover md:h-28 md:w-28" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Season {e.season} · Episode {e.number}</p>
            <h1 className="font-display text-3xl font-bold md:text-4xl">{e.name}</h1>
          </div>
        </div>
        <Player item={e} audio={e.format === "audio"} poster={mediaUrl(e.thumb_path ?? s.poster_path)} label={e.format === "audio" ? "Listen" : "Watch"} />
        <div className="flex flex-wrap gap-6 text-sm">
          <Fact label="Published" value={epDate(e)} />
          <Fact label="Duration" value={e.duration_minutes ? `${e.duration_minutes} min` : null} />
          <Fact label="Format" value={e.format === "video" ? "Video" : "Audio"} />
        </div>
        {e.description && <p className="whitespace-pre-line leading-relaxed text-neutral-300">{e.description}</p>}
      </div>
      {others.length > 0 && (
        <Row title="More episodes" className="mt-12">
          {others.map((o) => (
            <WideCard key={o.id} to={epPath(s.slug, o)} title={o.name} path={o.thumb_path ?? s.poster_path} subtitle={`E${o.number} · ${epDate(o)}`} icon={o.format === "video" ? Video : Headphones} demo={o.is_demo} />
          ))}
        </Row>
      )}
      <div className="mt-10 px-4 md:px-10">
        <Link to={`${ENT}/podcasts`} className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-400 hover:text-white">All podcasts <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </>
  );
}

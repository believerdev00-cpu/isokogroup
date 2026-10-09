import { Link } from "react-router-dom";
import { ArrowRight, Brush, CalendarDays, Camera, Film, Info, Mic, Radio, Shirt } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  ENT, linkFor, onlyPublic, trending, useCollections, useEvents, useLiveStreams, useTitles, useWorks, youtubeThumb,
  type Work,
} from "../api";
import { Masonry, PinCard, PosterCard, Row, WideCard, LiveBadge } from "../ui";
import { FinalCta, Hero, heroImage, YouTubeButton } from "../parts";
import PartnersStrip from "@/components/PartnersStrip";

/** The Isoko Entertainment front page: what's featured, then a row or wall per section. */
export default function EntHome() {
  const { t } = useI18n();
  const SECTIONS = [
    { to: `${ENT}/film`, label: t("ent.film"), icon: Film, tint: "from-red-700 to-red-950" },
    { to: `${ENT}/podcasts`, label: t("ent.podcasts"), icon: Mic, tint: "from-violet-700 to-violet-950" },
    { to: `${ENT}/photo-studio`, label: t("ent.photoStudio"), icon: Camera, tint: "from-amber-600 to-amber-950" },
    { to: `${ENT}/art-design`, label: t("ent.artDesign"), icon: Brush, tint: "from-emerald-700 to-emerald-950" },
    { to: `${ENT}/fashion`, label: t("ent.fashion"), icon: Shirt, tint: "from-pink-700 to-pink-950" },
    { to: `${ENT}/fashion/hub`, label: t("ent.fashionHub"), icon: Shirt, tint: "from-fuchsia-700 to-fuchsia-950" },
    { to: `${ENT}/live`, label: t("ent.live"), icon: Radio, tint: "from-rose-600 to-rose-950" },
    { to: `${ENT}/events`, label: t("ent.events"), icon: CalendarDays, tint: "from-sky-700 to-sky-950" },
  ];
  const films = useTitles("film");
  const series = useTitles("series");
  const podcasts = useTitles("podcast");
  const photo = useWorks("photo", 20);
  const art = useWorks("art", 20);
  const fashion = useWorks("fashion", 12);
  const collections = useCollections(8);
  const live = useLiveStreams();
  const events = useEvents(12);

  const filmList = onlyPublic(films.data);
  const seriesList = onlyPublic(series.data);
  const podcastList = onlyPublic(podcasts.data);
  const photoList = onlyPublic(photo.data);
  const artList = onlyPublic(art.data);
  const fashionList = onlyPublic(fashion.data);
  const collectionList = onlyPublic(collections.data);
  const liveList = onlyPublic(live.data);
  const eventList = onlyPublic(events.data);

  const lead = [...filmList, ...seriesList, ...podcastList].find((x) => x.featured) ?? filmList[0] ?? seriesList[0] ?? podcastList[0];
  const trendingNow = trending([...filmList, ...seriesList, ...podcastList]).slice(0, 10);
  const kindLabel = (kind: string) => (kind === "film" ? t("ent.movies") : kind === "series" ? t("ent.tvSeries") : t("ent.podcasts"));
  const liveNow = liveList.filter((l) => l.live_state === "live");
  const upcoming = liveList.filter((l) => l.live_state === "upcoming");

  return (
    <>
      {lead ? (
        <Hero
          tall
          image={heroImage(lead.backdrop_path ?? lead.poster_path)}
          eyebrow={kindLabel(lead.kind)}
          title={lead.title}
          text={lead.tagline ?? lead.description}
          demo={lead.is_demo}
          meta={[lead.release_date?.slice(0, 4), lead.genres.slice(0, 3).join(" · ")].filter(Boolean).map((m) => <span key={m}>{m}</span>)}
        >
          <Link to={linkFor(lead.kind, lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            {lead.kind === "podcast" ? "Listen" : t("ent.watch")} <ArrowRight className="h-5 w-5" />
          </Link>
          {lead.trailer_youtube && <YouTubeButton video={lead.trailer_youtube} label={t("ent.trailer")} />}
          <Link to={linkFor(lead.kind, lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white/15 px-6 font-semibold backdrop-blur hover:bg-white/25">
            <Info className="h-5 w-5" /> More info
          </Link>
        </Hero>
      ) : (
        <Hero
          tall
          video="/videos/entertainment-podcast.mp4"
          image="/videos/entertainment-podcast.jpg"
          eyebrow="Isoko Studioz"
          title="Stories from around the world"
          text="Films, podcasts, photography, art, fashion, live streams and event coverage from Isoko Entertainment."
        >
          <Link to={`${ENT}/film`} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            Explore <ArrowRight className="h-5 w-5" />
          </Link>
        </Hero>
      )}

      <div className="relative z-10 -mt-6 space-y-12 md:space-y-14">
        {/* Every section, one tap away */}
        <nav className="no-scrollbar flex gap-3 overflow-x-auto px-4 md:grid md:grid-cols-8 md:px-10" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Link key={s.to} to={s.to} className={`group flex h-24 w-32 shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-br p-3 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-white/30 md:w-auto ${s.tint}`}>
              <s.icon className="h-6 w-6" />
              <span className="font-semibold">{s.label}</span>
            </Link>
          ))}
        </nav>

        {trendingNow.length > 0 && (
          <Row title="Trending now">
            {trendingNow.map((x, i) => (
              <PosterCard key={x.id} to={linkFor(x.kind, x.slug)} title={x.title} path={x.poster_path} rank={i + 1} demo={x.is_demo} meta={kindLabel(x.kind)} />
            ))}
          </Row>
        )}

        {filmList.length > 0 && (
          <Row title={t("ent.movies")} to={`${ENT}/film/movies`}>
            {filmList.slice(0, 16).map((x) => (
              <PosterCard key={x.id} to={linkFor("film", x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={x.release_date?.slice(0, 4)} />
            ))}
          </Row>
        )}

        {seriesList.length > 0 && (
          <Row title={t("ent.tvSeries")} to={`${ENT}/film/tv-series`}>
            {seriesList.slice(0, 16).map((x) => (
              <PosterCard key={x.id} to={linkFor("series", x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={x.release_date?.slice(0, 4)} />
            ))}
          </Row>
        )}

        {podcastList.length > 0 && (
          <Row title={t("ent.podcasts")} to={`${ENT}/podcasts`}>
            {podcastList.slice(0, 12).map((x) => (
              <WideCard key={x.id} to={linkFor("podcast", x.slug)} title={x.title} path={x.backdrop_path ?? x.poster_path} subtitle={x.tagline} demo={x.is_demo} icon={Mic} />
            ))}
          </Row>
        )}

        {(liveNow.length > 0 || upcoming.length > 0) && (
          <Row title={liveNow.length ? "Live now" : "Coming up live"} to={`${ENT}/live`}>
            {[...liveNow, ...upcoming].slice(0, 8).map((l) => (
              <WideCard
                key={l.id}
                width="large"
                to={linkFor("live", l.slug)}
                title={l.title}
                path={l.thumb_path}
                src={l.thumb_path ? null : youtubeThumb(l.stream_ref)}
                subtitle={l.live_state === "live" ? "Streaming now" : l.scheduled_at ? new Date(l.scheduled_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Coming soon"}
                badge={l.live_state === "live" ? <LiveBadge /> : undefined}
                demo={l.is_demo}
                icon={Radio}
              />
            ))}
          </Row>
        )}

        {photoList.length > 0 && (
          <Wall title="Photo Studio" to={`${ENT}/photo-studio`} items={photoList.slice(0, 10)} />
        )}

        {artList.length > 0 && (
          <Wall title="Art & Design" to={`${ENT}/art-design`} items={artList.slice(0, 10)} />
        )}

        {(fashionList.length > 0 || collectionList.length > 0) && (
          <section className="px-4 md:px-10">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-xl font-bold md:text-2xl">Fashion</h2>
              <Link to={`${ENT}/fashion`} className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-400 hover:text-white">See all <ArrowRight className="h-4 w-4" /></Link>
            </div>
            {/* Editorial layout: one large look beside two smaller ones */}
            <div className="grid gap-3 md:grid-cols-3 md:grid-rows-2">
              {[...collectionList.map((c) => ({ id: c.id, to: linkFor("collection", c.slug), title: c.title, path: c.cover_path, sub: c.kind })),
                ...fashionList.map((w) => ({ id: w.id, to: linkFor("work:fashion", w.slug), title: w.title, path: w.cover_path, sub: w.tags[0] ?? "Editorial" }))]
                .slice(0, 3)
                .map((f, i) => (
                  <Link key={f.id} to={f.to} className={`group relative overflow-hidden rounded-2xl ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}>
                    <img src={heroImage(f.path) ?? undefined} alt={f.title} loading="lazy" className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${i === 0 ? "aspect-[4/5] md:aspect-auto md:h-full" : "aspect-[4/3]"}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" aria-hidden />
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/70">{f.sub}</p>
                      <p className="font-display text-xl font-bold md:text-2xl">{f.title}</p>
                    </div>
                  </Link>
                ))}
            </div>
          </section>
        )}

        {eventList.length > 0 && (
          <Row title="Event coverage" to={`${ENT}/events`}>
            {eventList.slice(0, 10).map((e) => (
              <WideCard key={e.id} width="large" to={linkFor("event", e.slug)} title={e.title} path={e.cover_path} subtitle={[e.held_on, e.location].filter(Boolean).join(" · ")} demo={e.is_demo} icon={CalendarDays} />
            ))}
          </Row>
        )}
      </div>

      <PartnersStrip dark className="pb-0" />
      <FinalCta />
    </>
  );
}

function Wall({ title, to, items }: { title: string; to: string; items: Work[] }) {
  return (
    <section className="px-4 md:px-10">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display text-xl font-bold md:text-2xl">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-400 hover:text-white">See all <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <Masonry className="lg:columns-5">
        {items.map((w) => (
          <PinCard key={w.id} to={linkFor(`work:${w.section}`, w.slug)} title={w.title} path={w.cover_path} w={w.cover_w} h={w.cover_h} subtitle={w.tags.slice(0, 2).join(" · ")} demo={w.is_demo} save={{ type: "work", id: w.id }} />
        ))}
      </Masonry>
    </section>
  );
}

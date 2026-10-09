import { useMemo, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clapperboard, Play, Tags, Tv } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PageLoading } from "@/features/services/ui";
import { cn } from "@/lib/utils";
import {
  ENT, inGenre, linkFor, mediaUrl, onlyPublic, useBySlug, useCategories, useChildren, useTitles,
  type Credit, type Episode, type Title,
} from "../api";
import { CategoryChips, ComingSoon, EntNotFound, Img, PosterCard, Row, SaveButton, SectionIntro, StaffOnlyBanner } from "../ui";
import { FinalCta, Hero, heroImage, Player, YouTubeButton } from "../parts";
import { Fact, FilmsPage, PersonName } from "./Films";

// Entertainment → Film → Genre | Movies | TV Series. Movies are titles of kind
// 'film', series are titles of kind 'series' with their episodes; a genre is a
// category of section 'film'. Everything shown comes from what media staff
// published: nothing here is made up to fill a page.

const FILM = `${ENT}/film`;

const year = (t: Title) => t.release_date?.slice(0, 4);

/** The Film sub-navigation, shown above every Film page. */
export function FilmLayout() {
  const { t } = useI18n();
  const items = [
    { to: `${FILM}/genre`, label: t("ent.genre"), icon: Tags },
    { to: `${FILM}/movies`, label: t("ent.movies"), icon: Clapperboard },
    { to: `${FILM}/tv-series`, label: t("ent.tvSeries"), icon: Tv },
  ];
  return (
    <>
      {/* Above the hero that follows (it is pulled up under the header), so the pills stay clickable */}
      <div className="relative z-20 flex items-center gap-3 px-4 pt-4 md:px-10" aria-label="Film sections">
        <NavLink
          to={FILM}
          end
          className={({ isActive }) => cn("shrink-0 text-xs font-bold uppercase tracking-[0.2em]", isActive ? "text-white" : "text-primary hover:text-white")}
        >
          {t("ent.film")}
        </NavLink>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn("flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", isActive ? "bg-white text-black" : "bg-white/10 text-neutral-200 hover:bg-white/20")
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  );
}

/** /entertainment/film: what's featured, the three sections, and a row of each. */
export function FilmHub() {
  const { t } = useI18n();
  const films = useTitles("film", 200);
  const series = useTitles("series", 200);
  const genres = useCategories("film");
  if (films.isLoading || series.isLoading) return <PageLoading />;
  const movies = onlyPublic(films.data);
  const shows = onlyPublic(series.data);
  const all = [...movies, ...shows];
  const lead = all.find((x) => x.featured) ?? movies[0] ?? shows[0];
  const genreCount = (genres.data ?? []).filter((g) => all.some((x) => inGenre(x, g))).length;

  const tiles = [
    { to: `${FILM}/genre`, label: t("ent.genre"), icon: Tags, tint: "from-amber-600 to-amber-950", count: genreCount },
    { to: `${FILM}/movies`, label: t("ent.movies"), icon: Clapperboard, tint: "from-red-700 to-red-950", count: movies.length },
    { to: `${FILM}/tv-series`, label: t("ent.tvSeries"), icon: Tv, tint: "from-sky-700 to-sky-950", count: shows.length },
  ];

  return (
    <>
      {lead ? (
        <Hero
          tall
          image={heroImage(lead.backdrop_path ?? lead.poster_path)}
          eyebrow={lead.kind === "series" ? t("ent.tvSeries") : t("ent.movies")}
          title={lead.title}
          text={lead.tagline ?? lead.description}
          demo={lead.is_demo}
          meta={[year(lead), ...lead.genres.slice(0, 3)].filter(Boolean).map((m) => <span key={m}>{m}</span>)}
        >
          <Link to={linkFor(lead.kind, lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            {t("ent.watch")} <ArrowRight className="h-5 w-5" />
          </Link>
          {lead.trailer_youtube && <YouTubeButton video={lead.trailer_youtube} label={t("ent.trailer")} />}
        </Hero>
      ) : (
        <SectionIntro eyebrow="Isoko Entertainment" title={t("ent.film")} text="Stories from around the world: movies and TV series, by genre." />
      )}

      <div className="relative z-10 space-y-12 pt-6">
        <nav className="grid gap-3 px-4 sm:grid-cols-3 md:px-10" aria-label="Film sections">
          {tiles.map((s) => (
            <Link key={s.to} to={s.to} className={`group flex h-28 flex-col justify-between rounded-2xl bg-gradient-to-br p-4 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-white/30 ${s.tint}`}>
              <span className="flex items-center justify-between"><s.icon className="h-6 w-6" /><span className="text-sm text-white/70">{s.count}</span></span>
              <span className="flex items-center justify-between font-display text-xl font-bold">{s.label} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </nav>

        {movies.length > 0 ? (
          <Row title={t("ent.movies")} to={`${FILM}/movies`}>
            {movies.slice(0, 16).map((x) => <PosterCard key={x.id} to={linkFor("film", x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={year(x)} />)}
          </Row>
        ) : (
          <ComingSoon what={t("ent.movies")} icon={Clapperboard} />
        )}

        {shows.length > 0 ? (
          <Row title={t("ent.tvSeries")} to={`${FILM}/tv-series`}>
            {shows.slice(0, 16).map((x) => <PosterCard key={x.id} to={linkFor("series", x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={year(x)} />)}
          </Row>
        ) : (
          <ComingSoon what={t("ent.tvSeries")} icon={Tv} />
        )}
      </div>
      <FinalCta />
    </>
  );
}

/** /entertainment/film/movies: the existing films page. */
export const MoviesPage = FilmsPage;

/** All titles (movies and series) the public may see, with the genres. */
function useFilmCatalogue() {
  const films = useTitles("film", 200);
  const series = useTitles("series", 200);
  const genres = useCategories("film");
  const all = useMemo(() => [...onlyPublic(films.data), ...onlyPublic(series.data)], [films.data, series.data]);
  return { loading: films.isLoading || series.isLoading || genres.isLoading, all, genres: genres.data ?? [] };
}

/** /entertainment/film/genre: every genre, with how many titles it holds. */
export function GenreIndex() {
  const { t } = useI18n();
  const { loading, all, genres } = useFilmCatalogue();
  if (loading) return <PageLoading />;
  return (
    <>
      <SectionIntro eyebrow={t("ent.film")} title={t("ent.genre")} text={t("ent.browseBy")} />
      {genres.length === 0 ? (
        <ComingSoon what={t("ent.genre")} icon={Tags} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-10 lg:grid-cols-5">
          {genres.map((g) => {
            const n = all.filter((x) => inGenre(x, g)).length;
            return (
              <Link key={g.id} to={`${FILM}/genre/${g.slug}`} className="group flex h-28 flex-col justify-between rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/30">
                <Tags className="h-5 w-5 text-primary" />
                <span>
                  <span className="block font-display text-lg font-bold">{g.name}</span>
                  <span className="text-xs text-neutral-400">{n === 0 ? t("ent.nothingYet") : n}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <FinalCta />
    </>
  );
}

/** /entertainment/film/genre/:slug: the movies and series in one genre. */
export function GenrePage() {
  const { t } = useI18n();
  const { slug } = useParams();
  const { loading, all, genres } = useFilmCatalogue();
  if (loading) return <PageLoading />;
  const g = genres.find((c) => c.slug === slug);
  if (!g) return <EntNotFound />;
  const items = all.filter((x) => inGenre(x, g));
  return (
    <>
      <SectionIntro eyebrow={t("ent.genre")} title={g.name} />
      <div className="px-4 md:px-10">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center text-neutral-400">{t("ent.nothingYet")}</p>
        ) : (
          <TitleGrid items={items} />
        )}
        <div className="mt-10 flex flex-wrap gap-4 text-sm font-semibold text-neutral-400">
          <Link to={`${FILM}/genre`} className="hover:text-white">← {t("ent.allGenres")}</Link>
          <Link to={FILM} className="hover:text-white">{t("ent.backToFilm")}</Link>
        </div>
      </div>
      <FinalCta />
    </>
  );
}

function TitleGrid({ items }: { items: Title[] }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 [&>div>a]:w-full [&>div>a]:max-w-none">
      {items.map((x) => (
        <div key={x.id}>
          <PosterCard to={linkFor(x.kind, x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={[x.kind === "series" ? t("ent.tvSeries") : t("ent.movies"), year(x)].filter(Boolean).join(" · ")} />
        </div>
      ))}
    </div>
  );
}

/** /entertainment/film/tv-series: every published series. */
export function SeriesPage() {
  const { t } = useI18n();
  const series = useTitles("series", 200);
  const genres = useCategories("film");
  const [genre, setGenre] = useState<string | null>(null);
  if (series.isLoading) return <PageLoading />;
  const list = onlyPublic(series.data);
  const chosen = genre ? (genres.data ?? []).find((g) => g.slug === genre) : null;
  const shown = chosen ? list.filter((x) => inGenre(x, chosen)) : list;
  const lead = list.find((x) => x.featured);

  return (
    <>
      {lead ? (
        <Hero image={heroImage(lead.backdrop_path ?? lead.poster_path)} eyebrow={t("ent.tvSeries")} title={lead.title} text={lead.tagline ?? lead.description} demo={lead.is_demo}
          meta={[year(lead), ...lead.genres.slice(0, 3)].filter(Boolean).map((m) => <span key={m}>{m}</span>)}>
          <Link to={linkFor("series", lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            {t("ent.watch")} <ArrowRight className="h-5 w-5" />
          </Link>
          {lead.trailer_youtube && <YouTubeButton video={lead.trailer_youtube} label={t("ent.trailer")} />}
        </Hero>
      ) : (
        <SectionIntro eyebrow={t("ent.film")} title={t("ent.tvSeries")} text="Series from around the world, season by season." />
      )}
      <div className="relative z-10 space-y-6 px-4 pt-4 md:px-10">
        {list.length === 0 ? (
          <ComingSoon what={t("ent.tvSeries")} icon={Tv} />
        ) : (
          <>
            <CategoryChips items={genres.data ?? []} value={genre} onChange={setGenre} />
            {shown.length === 0 ? (
              <p className="py-10 text-center text-neutral-400">{t("ent.nothingYet")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 [&>div>a]:w-full [&>div>a]:max-w-none">
                {shown.map((x) => <div key={x.id}><PosterCard to={linkFor("series", x.slug)} title={x.title} path={x.poster_path} demo={x.is_demo} meta={year(x)} /></div>)}
              </div>
            )}
          </>
        )}
      </div>
      <FinalCta />
    </>
  );
}

const epLabel = (e: Episode) => `S${e.season} · E${e.number}`;

/**
 * /entertainment/film/tv-series/:slug (and .../episodes/:episodeId): the
 * series, its seasons and episodes, and the player for the chosen episode.
 */
export function SeriesDetail() {
  const { t } = useI18n();
  const { slug, episodeId } = useParams();
  const navigate = useNavigate();
  const show = useBySlug<Title>("ent_titles", slug);
  const credits = useChildren<Credit>("ent_credits", "title_id", show.data?.id);
  const episodes = useChildren<Episode>("ent_episodes", "title_id", show.data?.id, "number");
  const all = useTitles("series", 200);
  const [seasonPick, setSeasonPick] = useState<number | null>(null);
  if (show.isLoading || episodes.isLoading) return <PageLoading />;
  const s = show.data;
  if (!s || s.kind !== "series") return <EntNotFound />;

  const eps = onlyPublic(episodes.data).sort((a, b) => a.season - b.season || a.number - b.number);
  const seasons = [...new Set(eps.map((e) => e.season))];
  const current = episodeId ? (episodes.data ?? []).find((e) => e.id === episodeId) ?? null : null;
  if (episodeId && !current) return <EntNotFound />;
  const season = seasonPick ?? current?.season ?? seasons[0] ?? null;
  const inSeason = eps.filter((e) => e.season === season);
  const directors = (credits.data ?? []).filter((c) => c.role === "director");
  const cast = (credits.data ?? []).filter((c) => c.role === "cast");
  const related = onlyPublic(all.data)
    .filter((o) => o.id !== s.id && (o.category_id === s.category_id || o.genres.some((g) => s.genres.includes(g))))
    .slice(0, 16);

  return (
    <>
      <StaffOnlyBanner status={s.status} />
      <Hero
        image={heroImage(s.backdrop_path ?? s.poster_path)}
        eyebrow={t("ent.tvSeries")}
        title={s.title}
        text={s.tagline}
        demo={s.is_demo}
        meta={[year(s), s.age_rating, ...s.genres.slice(0, 3)].filter(Boolean).map((m) => <span key={m} className="rounded bg-white/10 px-2 py-0.5">{m}</span>)}
      >
        {eps[0] && !current && (
          <Link to={`${linkFor("series", s.slug)}/episodes/${eps[0].id}`} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            <Play className="h-5 w-5 fill-black" /> {t("ent.watch")}
          </Link>
        )}
        {s.trailer_youtube && <YouTubeButton video={s.trailer_youtube} label={t("ent.trailer")} />}
        <SaveButton type="title" id={s.id} />
      </Hero>

      <div className="grid gap-10 px-4 md:grid-cols-[1fr_320px] md:px-10">
        <div className="space-y-8">
          {current && (
            <section id="watch" className="space-y-3">
              <StaffOnlyBanner status={current.status} />
              <p className="text-xs uppercase tracking-[0.2em] text-primary">{epLabel(current)}</p>
              <h2 className="font-display text-2xl font-bold">{current.name}</h2>
              <Player item={current} audio={current.format === "audio"} poster={mediaUrl(current.thumb_path ?? s.backdrop_path ?? s.poster_path)} label={t("ent.watch")} />
              {current.description && <p className="whitespace-pre-line text-neutral-300">{current.description}</p>}
            </section>
          )}
          {s.description && <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-200">{s.description}</p>}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">{t("ent.episodes")}</h2>
              {seasons.length > 1 && (
                <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist" aria-label={t("ent.seasons")}>
                  {seasons.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="tab"
                      aria-selected={n === season}
                      onClick={() => setSeasonPick(n)}
                      className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold", n === season ? "bg-white text-black" : "bg-white/10 text-neutral-200 hover:bg-white/20")}
                    >
                      {t("ent.season")} {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {eps.length === 0 ? (
              <p className="rounded-xl bg-white/5 p-4 text-sm text-neutral-400">{t("ent.nothingYet")}</p>
            ) : (
              <ul className="divide-y divide-white/10 rounded-2xl bg-white/[0.03]">
                {inSeason.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`${linkFor("series", s.slug)}/episodes/${e.id}`)}
                      aria-current={current?.id === e.id ? "true" : undefined}
                      className={cn("flex w-full gap-4 p-4 text-left hover:bg-white/5", current?.id === e.id && "bg-white/10")}
                    >
                      <Img path={e.thumb_path ?? s.poster_path} alt="" size="sm" ratio="16 / 9" className="w-24 shrink-0 rounded-lg md:w-36" />
                      <div className="min-w-0">
                        <p className="text-xs text-neutral-400">{epLabel(e)}{e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}{e.watch_source ? "" : " · Not available to play yet"}</p>
                        <p className="font-semibold">{e.name}</p>
                        {e.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{e.description}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cast.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-bold">Cast</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cast.map((c) => (
                  <li key={c.id} className="rounded-xl bg-white/5 p-3">
                    <PersonName credit={c} />
                    {c.character_name && <p className="text-sm text-neutral-400">as {c.character_name}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 text-sm">
          <Fact label="Director" value={directors.length ? directors.map((d) => <PersonName key={d.id} credit={d} />) : null} />
          <Fact label={t("ent.seasons")} value={seasons.length ? String(seasons.length) : null} />
          <Fact label={t("ent.episodes")} value={eps.length ? String(eps.length) : null} />
          <Fact label="Release date" value={s.release_date ? new Date(s.release_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
          <Fact label="Genre" value={s.genres.join(", ") || null} />
          <Fact label="Country" value={s.country} />
          <Fact label="Language" value={s.language} />
          <Fact label="Age rating" value={s.age_rating} />
        </aside>
      </div>

      {related.length > 0 && (
        <Row title="More like this" className="mt-14">
          {related.map((o) => <PosterCard key={o.id} to={linkFor("series", o.slug)} title={o.title} path={o.poster_path} demo={o.is_demo} meta={year(o)} />)}
        </Row>
      )}
      <div className="mt-10 flex flex-wrap gap-4 px-4 text-sm font-semibold text-neutral-400 md:px-10">
        <Link to={`${FILM}/tv-series`} className="hover:text-white">← {t("ent.allSeries")}</Link>
        <Link to={FILM} className="hover:text-white">{t("ent.backToFilm")}</Link>
      </div>
    </>
  );
}

// The addresses used before (/entertainment/films, /entertainment/films/:slug) keep working
export const LegacyFilms = () => <Navigate to={`${FILM}/movies`} replace />;
export function LegacyFilm() {
  const { slug } = useParams();
  return <Navigate to={slug ? linkFor("film", slug) : `${FILM}/movies`} replace />;
}

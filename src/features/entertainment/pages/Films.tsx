import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Film } from "lucide-react";
import { db } from "@/features/services/api";
import { useI18n } from "@/lib/i18n";
import { PageLoading } from "@/features/services/ui";
import {
  ENT, linkFor, onlyPublic, trending, useBySlug, useCategories, useChildren, useTitles, type Credit, type Title,
} from "../api";
import { CategoryChips, ComingSoon, EntNotFound, PosterCard, Row, SaveButton, SectionIntro, StaffOnlyBanner } from "../ui";
import { FinalCta, Hero, heroImage, Player, YouTubeButton } from "../parts";


const AFRICA = new Set([
  "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cameroon", "cape verde", "central african republic", "chad",
  "comoros", "congo", "drc", "democratic republic of the congo", "djibouti", "egypt", "equatorial guinea", "eritrea", "eswatini", "ethiopia",
  "gabon", "gambia", "ghana", "guinea", "guinea-bissau", "ivory coast", "côte d'ivoire", "kenya", "lesotho", "liberia", "libya", "madagascar",
  "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique", "namibia", "niger", "nigeria", "rwanda", "senegal", "seychelles",
  "sierra leone", "somalia", "south africa", "south sudan", "sudan", "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe",
]);
const country = (t: Title) => (t.country ?? "").trim().toLowerCase();

const meta = (t: Title) => [t.release_date?.slice(0, 4), t.duration_minutes ? `${Math.floor(t.duration_minutes / 60) ? `${Math.floor(t.duration_minutes / 60)}h ` : ""}${t.duration_minutes % 60}m` : null, t.age_rating].filter(Boolean) as string[];

export function FilmsPage() {
  const films = useTitles("film", 200);
  const cats = useCategories("film");
  const [cat, setCat] = useState<string | null>(null);
  const list = onlyPublic(films.data);

  const rows = useMemo(() => {
    const byDate = [...list].sort((a, b) => (b.release_date ?? b.created_at).localeCompare(a.release_date ?? a.created_at));
    return [
      { title: "Trending now", items: trending(list), ranked: true },
      { title: "New releases", items: byDate.slice(0, 20) },
      { title: "Rwandan films", items: list.filter((t) => country(t) === "rwanda") },
      { title: "African films", items: list.filter((t) => AFRICA.has(country(t))) },
      { title: "Recommended", items: list.filter((t) => t.featured) },
      ...(cats.data ?? []).map((c) => ({ title: c.name, items: list.filter((t) => t.category_id === c.id) })),
    ].filter((r) => r.items.length > 0);
  }, [list, cats.data]);

  if (films.isLoading) return <PageLoading />;
  const lead = list.find((t) => t.featured) ?? list[0];
  const chosen = cat ? (cats.data ?? []).find((c) => c.slug === cat) : null;

  return (
    <>
      {lead ? (
        <Hero
          tall
          image={heroImage(lead.backdrop_path ?? lead.poster_path)}
          eyebrow="Isoko Films"
          title={lead.title}
          text={lead.tagline ?? lead.description}
          demo={lead.is_demo}
          meta={meta(lead).map((m) => <span key={m}>{m}</span>)}
        >
          <Link to={linkFor("film", lead.slug)} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/85">
            Watch <ArrowRight className="h-5 w-5" />
          </Link>
          {lead.trailer_youtube && <YouTubeButton video={lead.trailer_youtube} label="Trailer" />}
        </Hero>
      ) : (
        <SectionIntro eyebrow="Isoko Films" title="Trending films" text="Rwandan and African stories, from shorts to features." />
      )}

      <div className="relative z-10 space-y-10 pt-4">
        {list.length === 0 ? (
          <ComingSoon what="Films" icon={Film} />
        ) : (
          <>
            <div className="px-4 md:px-10">
              <CategoryChips items={cats.data ?? []} value={cat} onChange={setCat} />
            </div>
            {chosen ? (
              <section className="px-4 md:px-10">
                <h2 className="mb-4 font-display text-2xl font-bold">{chosen.name}</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {list.filter((t) => t.category_id === chosen.id).map((t) => (
                    <div key={t.id} className="[&>a]:w-full [&>a]:max-w-none"><PosterCard to={linkFor("film", t.slug)} title={t.title} path={t.poster_path} demo={t.is_demo} meta={meta(t)[0]} /></div>
                  ))}
                </div>
              </section>
            ) : (
              rows.map((r) => (
                <Row key={r.title} title={r.title}>
                  {r.items.map((t, i) => (
                    <PosterCard key={t.id} to={linkFor("film", t.slug)} title={t.title} path={t.poster_path} rank={r.ranked ? i + 1 : undefined} demo={t.is_demo} meta={meta(t)[0]} />
                  ))}
                </Row>
              ))
            )}
          </>
        )}
      </div>
      <FinalCta />
    </>
  );
}

export function FilmDetail() {
  const { t: tr } = useI18n();
  const { slug } = useParams();
  const film = useBySlug<Title>("ent_titles", slug);
  const credits = useChildren<Credit>("ent_credits", "title_id", film.data?.id);
  const all = useTitles("film", 200);
  if (film.isLoading) return <PageLoading />;
  const t = film.data;
  if (!t || t.kind !== "film") return <EntNotFound />;

  const directors = (credits.data ?? []).filter((c) => c.role === "director");
  const cast = (credits.data ?? []).filter((c) => c.role === "cast");
  const related = onlyPublic(all.data)
    .filter((o) => o.id !== t.id && (o.category_id === t.category_id || o.genres.some((g) => t.genres.includes(g))))
    .slice(0, 16);

  return (
    <>
      <StaffOnlyBanner status={t.status} />
      <Hero
        image={heroImage(t.backdrop_path ?? t.poster_path)}
        eyebrow="Film"
        title={t.title}
        text={t.tagline}
        demo={t.is_demo}
        meta={[...meta(t), ...t.genres.slice(0, 3)].map((m) => <span key={m} className="rounded bg-white/10 px-2 py-0.5">{m}</span>)}
      >
        {t.trailer_youtube && <YouTubeButton video={t.trailer_youtube} label="Trailer" />}
        <SaveButton type="title" id={t.id} />
      </Hero>

      <div className="grid gap-10 px-4 md:grid-cols-[1fr_320px] md:px-10">
        <div className="space-y-8">
          <div id="watch">
            <Player item={t} poster={heroImage(t.backdrop_path)} label="Watch now" />
          </div>
          {t.description && <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-200">{t.description}</p>}
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
          <Fact label="Release date" value={t.release_date ? new Date(t.release_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
          <Fact label="Duration" value={meta(t)[1] ?? null} />
          <Fact label="Genre" value={t.genres.join(", ") || null} />
          <Fact label="Country" value={t.country} />
          <Fact label="Language" value={t.language} />
          <Fact label="Age rating" value={t.age_rating} />
        </aside>
      </div>

      {related.length > 0 && (
        <Row title="More like this" className="mt-14">
          {related.map((o) => <PosterCard key={o.id} to={linkFor("film", o.slug)} title={o.title} path={o.poster_path} demo={o.is_demo} meta={meta(o)[0]} />)}
        </Row>
      )}
      <div className="mt-10 px-4 md:px-10">
        <Link to={`${ENT}/film/movies`} className="text-sm font-semibold text-neutral-400 hover:text-white">← {tr("ent.allMovies")}</Link>
        <Link to={`${ENT}/film`} className="ml-4 text-sm font-semibold text-neutral-400 hover:text-white">{tr("ent.backToFilm")}</Link>
      </div>
    </>
  );
}

export function PersonName({ credit }: { credit: Credit }) {
  return credit.creator_id ? <CreatorLink id={credit.creator_id} name={credit.name} /> : <span className="font-semibold">{credit.name}</span>;
}

function CreatorLink({ id, name }: { id: string; name: string }) {
  const c = useCreatorSlug(id);
  return c ? <Link to={linkFor("creator", c)} className="font-semibold underline-offset-4 hover:underline">{name}</Link> : <span className="font-semibold">{name}</span>;
}

function useCreatorSlug(id: string) {
  const q = useQuery({
    queryKey: ["ent", "creator-slug", id],
    staleTime: 10 * 60_000,
    queryFn: async () => ((await db.from("ent_creators").select("slug").eq("id", id).maybeSingle()).data?.slug as string | undefined) ?? null,
  });
  return q.data ?? null;
}

export function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-neutral-200">{value}</div>
    </div>
  );
}

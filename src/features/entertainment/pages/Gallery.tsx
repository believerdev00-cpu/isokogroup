import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Brush, Camera, MapPin, Shirt } from "lucide-react";
import { db, unwrap } from "@/features/services/api";
import { PageLoading } from "@/features/services/ui";
import {
  ENT, linkFor, mediaUrl, onlyPublic, useBySlug, useCategories, useChildren, useCollections, useCreators, useWorks,
  type Collection, type Creator, type Work, type WorkImage,
} from "../api";
import { CategoryChips, ComingSoon, EntNotFound, Img, Masonry, PinCard, Row, SaveButton, SectionIntro, StaffOnlyBanner } from "../ui";
import { BookButton, FinalCta } from "../parts";
import { FashionHubBanner, FashionSubNav } from "../fashionHub/FashionHub";

const SECTION = {
  photo: { eyebrow: "Isoko Photo Studio", title: "Photo Studio", icon: Camera, people: "photographer", peopleTitle: "Featured photographers",
    text: "Portraits, weddings, events, commercial and studio photography by Isoko and the photographers we work with.", book: "book a photo shoot with Isoko Photo Studio", bookLabel: "Book Photo Studio" },
  art: { eyebrow: "Isoko Art & Design", title: "Art & Design", icon: Brush, people: "artist", peopleTitle: "Artists and designers",
    text: "Graphic design, digital art, illustration, branding, UI/UX and posters from creatives around the world.", book: "commission design work from Isoko Art & Design", bookLabel: "Commission work" },
  fashion: { eyebrow: "Isoko Fashion Agency", title: "Fashion", icon: Shirt, people: "model", peopleTitle: "Featured models",
    text: "Models, designers, collections, campaigns, shows and editorial photography.", book: "book a model or a fashion shoot with Isoko Fashion Agency", bookLabel: "Request a model" },
} as const;

type SectionKey = keyof typeof SECTION;

/** A creative section: people first, then a wall of work to browse by category. */
export function GallerySection({ section }: { section: SectionKey }) {
  const s = SECTION[section];
  const works = useWorks(section, 200);
  const cats = useCategories(section);
  const people = useCreators(s.people, 24);
  const designers = useCreators("designer", 24);
  const collections = useCollections(24);
  const [cat, setCat] = useState<string | null>(null);
  const [shown, setShown] = useState(30);
  if (works.isLoading) return <PageLoading />;

  const all = onlyPublic(works.data);
  const catId = cat ? (cats.data ?? []).find((c) => c.slug === cat)?.id : null;
  const list = catId ? all.filter((w) => w.category_id === catId) : all;
  const featuredPeople = onlyPublic(people.data);

  return (
    <>
      {/* Fashion has two parts: the portfolio (this page) and the Isoko Fashion Hub */}
      {section === "fashion" && <FashionSubNav />}
      <SectionIntro eyebrow={s.eyebrow} title={s.title} text={s.text}>
        <BookButton what={s.book}>{s.bookLabel}</BookButton>
      </SectionIntro>

      <div className="space-y-10">
        {section === "fashion" && <FashionHubBanner />}

        {featuredPeople.length > 0 && (
          <Row title={s.peopleTitle}>
            {featuredPeople.map((p) => <PersonCard key={p.id} person={p} tall={section === "fashion"} />)}
          </Row>
        )}

        {section === "fashion" && onlyPublic(designers.data).length > 0 && (
          <Row title="Designers">
            {onlyPublic(designers.data).map((p) => <PersonCard key={p.id} person={p} />)}
          </Row>
        )}

        {section === "fashion" && onlyPublic(collections.data).length > 0 && (
          <Row title="Collections, shows and campaigns">
            {onlyPublic(collections.data).map((c) => (
              <Link key={c.id} to={linkFor("collection", c.slug)} className="group relative w-[72vw] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-2xl md:w-[340px]">
                <Img path={c.cover_path} alt={c.title} size="sm" ratio="3 / 4" className="transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent" aria-hidden />
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/70">{c.kind}{c.season ? ` · ${c.season}` : ""}</p>
                  <p className="font-display text-2xl font-bold">{c.title}</p>
                </div>
              </Link>
            ))}
          </Row>
        )}

        <section className="px-4 md:px-10">
          <div className="mb-5"><CategoryChips items={cats.data ?? []} value={cat} onChange={(v) => { setCat(v); setShown(30); }} /></div>
          {all.length === 0 ? (
            <ComingSoon what={`${s.title} portfolios`} icon={s.icon} />
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-neutral-400">Nothing in this category yet.</p>
          ) : (
            <>
              <Masonry>
                {list.slice(0, shown).map((w) => (
                  <PinCard key={w.id} to={linkFor(`work:${section}`, w.slug)} title={w.title} path={w.cover_path} w={w.cover_w} h={w.cover_h} subtitle={w.tags.slice(0, 2).join(" · ")} demo={w.is_demo} save={{ type: "work", id: w.id }} />
                ))}
              </Masonry>
              {list.length > shown && (
                <div className="mt-6 text-center">
                  <button type="button" onClick={() => setShown((n) => n + 30)} className="rounded-full bg-white/10 px-6 py-3 font-semibold hover:bg-white/20">Show more</button>
                </div>
              )}
            </>
          )}
        </section>

        {section === "fashion" && (
          <section className="mx-4 grid gap-4 rounded-3xl bg-white/[0.04] p-6 md:mx-10 md:grid-cols-3 md:p-10">
            <div className="md:col-span-1">
              <h2 className="font-display text-2xl font-bold md:text-3xl">Agency services</h2>
              <p className="mt-2 text-neutral-400">Isoko represents adult models only, and every booking goes through our team.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 md:col-span-2">
              {["Model booking for campaigns and shows", "Editorial and lookbook shoots", "Fashion show production", "Brand campaigns and content"].map((x) => (
                <li key={x} className="rounded-xl bg-white/5 p-4 font-semibold">{x}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <FinalCta />
    </>
  );
}

function PersonCard({ person: p, tall }: { person: Creator; tall?: boolean }) {
  return (
    <Link to={linkFor("creator", p.slug)} className="group w-[42vw] max-w-[220px] shrink-0 snap-start md:w-[200px]">
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10 transition group-hover:ring-white/40">
        <Img path={p.avatar_path ?? p.cover_path} alt={p.display_name} size="sm" ratio={tall ? "3 / 4" : "1 / 1"} className="transition-transform duration-500 group-hover:scale-105" />
      </div>
      <p className="mt-2 font-semibold">{p.display_name}</p>
      {p.location && <p className="text-xs text-neutral-400">{p.location}</p>}
    </Link>
  );
}

export function WorkDetail() {
  const { slug } = useParams();
  const work = useBySlug<Work>("ent_works", slug);
  const images = useChildren<WorkImage>("ent_work_images", "work_id", work.data?.id);
  const creator = useQuery({
    queryKey: ["ent", "creator-by-id", work.data?.creator_id],
    enabled: !!work.data?.creator_id,
    queryFn: async () => unwrap(await db.from("ent_creators").select("*").eq("id", work.data!.creator_id).maybeSingle()) as Creator | null,
  });
  const more = useWorks(work.data?.section ?? "photo", 60);
  if (work.isLoading) return <PageLoading />;
  const w = work.data;
  if (!w) return <EntNotFound />;
  const s = SECTION[w.section];
  const imgs = images.data ?? [];
  const before = imgs.find((i) => i.kind === "before");
  const after = imgs.find((i) => i.kind === "after");
  const gallery = imgs.filter((i) => i.kind === "image");
  const related = onlyPublic(more.data).filter((o) => o.id !== w.id && (o.creator_id === w.creator_id || o.category_id === w.category_id)).slice(0, 12);

  return (
    <>
      <StaffOnlyBanner status={w.status} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 md:grid-cols-[1.4fr_1fr] md:pt-10">
        <Img path={w.cover_path} alt={w.title} ratio={w.cover_w && w.cover_h ? `${w.cover_w} / ${w.cover_h}` : "4 / 5"} className="rounded-3xl" />
        <div className="space-y-5 md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{s.title}</p>
          <h1 className="font-display text-3xl font-bold md:text-5xl">{w.title}</h1>
          {creator.data && (
            <Link to={linkFor("creator", creator.data.slug)} className="flex items-center gap-3">
              <Img path={creator.data.avatar_path} alt="" size="sm" ratio="1 / 1" className="w-11 rounded-full" />
              <span><span className="block font-semibold">{creator.data.display_name}</span><span className="text-sm text-neutral-400">{creator.data.headline}</span></span>
            </Link>
          )}
          {w.description && <p className="whitespace-pre-line leading-relaxed text-neutral-300">{w.description}</p>}
          {w.tags.length > 0 && <div className="flex flex-wrap gap-2">{w.tags.map((t) => <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-sm">{t}</span>)}</div>}
          <div className="flex flex-wrap gap-3">
            <SaveButton type="work" id={w.id} />
            <BookButton what={`${s.book} (like “${w.title}”)`}>{s.bookLabel}</BookButton>
          </div>
        </div>
      </div>

      {before && after && (
        <section className="mx-auto mt-12 max-w-6xl px-4">
          <h2 className="mb-3 font-display text-2xl font-bold">Before and after</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[before, after].map((i) => (
              <figure key={i.id}>
                <Img path={i.path} alt={i.kind} ratio={i.w && i.h ? `${i.w} / ${i.h}` : "4 / 5"} className="rounded-2xl" />
                <figcaption className="mt-1 text-sm capitalize text-neutral-400">{i.kind}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="mx-auto mt-12 max-w-6xl px-4">
          <Masonry className="lg:columns-3 2xl:columns-3">
            {gallery.map((i) => (
              <figure key={i.id} className="break-inside-avoid">
                <a href={mediaUrl(i.path) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <Img path={i.path} alt={i.caption ?? w.title} size="sm" ratio={i.w && i.h ? `${i.w} / ${i.h}` : "4 / 5"} className="rounded-2xl" />
                </a>
                {i.caption && <figcaption className="mt-1 text-sm text-neutral-400">{i.caption}</figcaption>}
              </figure>
            ))}
          </Masonry>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-14 px-4 md:px-10">
          <h2 className="mb-4 font-display text-2xl font-bold">More like this</h2>
          <Masonry>
            {related.map((o) => <PinCard key={o.id} to={linkFor(`work:${o.section}`, o.slug)} title={o.title} path={o.cover_path} w={o.cover_w} h={o.cover_h} demo={o.is_demo} save={{ type: "work", id: o.id }} />)}
          </Masonry>
        </section>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  director: "Director", actor: "Actor", host: "Podcast host", photographer: "Photographer", artist: "Artist", designer: "Designer", model: "Model", studio: "Studio",
};

export function CreatorPage() {
  const { slug } = useParams();
  const person = useBySlug<Creator>("ent_creators", slug);
  const works = useQuery({
    queryKey: ["ent", "works-by", person.data?.id],
    enabled: !!person.data?.id,
    queryFn: async () => unwrap(await db.from("ent_works").select("*").eq("creator_id", person.data!.id).order("created_at", { ascending: false })) as Work[],
  });
  if (person.isLoading) return <PageLoading />;
  const p = person.data;
  if (!p) return <EntNotFound />;
  const portfolio = onlyPublic(works.data);
  const details = Object.entries(p.details ?? {});
  const links = Object.entries(p.links ?? {}).filter(([, url]) => /^https:\/\//.test(url));
  const bookWhat = p.kinds.includes("model") ? `book the model ${p.display_name}` : `book ${p.display_name}`;

  return (
    <>
      <StaffOnlyBanner status={p.status} />
      <div className="relative">
        <Img path={p.cover_path ?? p.avatar_path} alt="" ratio="16 / 5" className="max-h-[42vh] min-h-[180px] w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 to-transparent" aria-hidden />
      </div>
      <div className="relative mx-auto -mt-20 max-w-6xl px-4">
        <div className="flex flex-col gap-5 md:flex-row md:items-end">
          <Img path={p.avatar_path} alt={p.display_name} ratio="1 / 1" className="w-32 shrink-0 rounded-full ring-4 ring-neutral-950 md:w-40" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{p.kinds.map((k) => KIND_LABEL[k] ?? k).join(" · ")}</p>
            <h1 className="font-display text-4xl font-bold md:text-5xl">{p.display_name}</h1>
            {p.location && <p className="flex items-center gap-1 text-neutral-400"><MapPin className="h-4 w-4" /> {p.location}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <SaveButton type="creator" id={p.id} />
            <BookButton what={bookWhat}>{p.kinds.includes("model") ? "Request booking" : "Book"}</BookButton>
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            {p.headline && <p className="text-xl font-semibold">{p.headline}</p>}
            {p.bio && <p className="whitespace-pre-line leading-relaxed text-neutral-300">{p.bio}</p>}
            {p.services.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold">Services</h2>
                <div className="flex flex-wrap gap-2">{p.services.map((s) => <span key={s} className="rounded-full bg-white/10 px-3 py-1 text-sm">{s}</span>)}</div>
              </div>
            )}
          </div>
          {(details.length > 0 || links.length > 0) && (
            <aside className="space-y-3 rounded-2xl bg-white/[0.04] p-5 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-white/5 pb-2"><span className="text-neutral-400">{k}</span><span className="font-semibold">{v}</span></div>
              ))}
              {links.map(([k, url]) => (
                <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="block font-semibold text-primary hover:underline">{k}</a>
              ))}
            </aside>
          )}
        </div>

        <section className="mt-12">
          <h2 className="mb-4 font-display text-2xl font-bold">Portfolio</h2>
          {portfolio.length === 0 ? (
            <p className="text-neutral-400">Portfolio coming soon.</p>
          ) : (
            <Masonry>
              {portfolio.map((w) => <PinCard key={w.id} to={linkFor(`work:${w.section}`, w.slug)} title={w.title} path={w.cover_path} w={w.cover_w} h={w.cover_h} demo={w.is_demo} save={{ type: "work", id: w.id }} />)}
            </Masonry>
          )}
        </section>
      </div>
    </>
  );
}

export function CollectionDetail() {
  const { slug } = useParams();
  const col = useBySlug<Collection>("ent_collections", slug);
  const looks = useQuery({
    queryKey: ["ent", "collection-looks", col.data?.id],
    enabled: !!col.data?.id,
    queryFn: async () =>
      (unwrap(await db.from("ent_collection_works").select("sort, work:ent_works(*)").eq("collection_id", col.data!.id).order("sort")) as { work: Work | null }[])
        .map((r) => r.work).filter(Boolean) as Work[],
  });
  if (col.isLoading) return <PageLoading />;
  const c = col.data;
  if (!c) return <EntNotFound />;
  const items = onlyPublic(looks.data);

  return (
    <>
      <StaffOnlyBanner status={c.status} />
      <section className="relative">
        <Img path={c.cover_path} alt={c.title} ratio="16 / 7" className="max-h-[70vh] min-h-[320px] w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 md:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">{c.kind}{c.season ? ` · ${c.season}` : ""}</p>
          <h1 className="font-display text-4xl font-bold md:text-7xl">{c.title}</h1>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4">
        {c.description && <p className="mt-8 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-300">{c.description}</p>}
        <div className="mt-10">
          {items.length === 0 ? <p className="text-neutral-400">Looks coming soon.</p> : (
            <Masonry className="lg:columns-3 2xl:columns-3">
              {items.map((w) => <PinCard key={w.id} to={linkFor("work:fashion", w.slug)} title={w.title} path={w.cover_path} w={w.cover_w} h={w.cover_h} demo={w.is_demo} save={{ type: "work", id: w.id }} />)}
            </Masonry>
          )}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <SaveButton type="collection" id={c.id} />
          <BookButton what="book Isoko Fashion Agency for a collection or campaign">Work with us</BookButton>
          <Link to={`${ENT}/fashion`} className="inline-flex h-11 items-center rounded-full bg-white/10 px-5 text-sm font-semibold hover:bg-white/20">All fashion</Link>
        </div>
      </div>
    </>
  );
}

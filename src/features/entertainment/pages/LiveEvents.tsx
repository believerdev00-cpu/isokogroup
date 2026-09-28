import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, Radio } from "lucide-react";
import { db, unwrap } from "@/features/services/api";
import { PageLoading } from "@/features/services/ui";
import {
  ENT, linkFor, onlyPublic, useBySlug, useCategories, useChildren, useEvents, useLiveStreams, youtubeEmbed, youtubeThumb,
  type Creator, type EntEvent, type EventImage, type LiveStream,
} from "../api";
import { CategoryChips, ComingSoon, EntNotFound, Img, LiveBadge, Masonry, Row, SaveButton, SectionIntro, StaffOnlyBanner, WideCard } from "../ui";
import { BookButton, FinalCta, heroImage } from "../parts";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

function liveCard(l: LiveStream) {
  return (
    <WideCard
      key={l.id}
      width="large"
      to={linkFor("live", l.slug)}
      title={l.title}
      path={l.thumb_path}
      src={l.thumb_path ? null : youtubeThumb(l.live_state === "ended" ? l.recording_ref ?? l.stream_ref : l.stream_ref)}
      subtitle={l.live_state === "live" ? `Live since ${when(l.started_at)}` : l.live_state === "upcoming" ? when(l.scheduled_at) ?? "Date to be announced" : `Streamed ${when(l.started_at) ?? ""}`}
      badge={l.live_state === "live" ? <LiveBadge /> : undefined}
      demo={l.is_demo}
      icon={Radio}
    />
  );
}

export function LivePage() {
  const live = useLiveStreams();
  if (live.isLoading) return <PageLoading />;
  const list = onlyPublic(live.data);
  const now = list.filter((l) => l.live_state === "live");
  const upcoming = list.filter((l) => l.live_state === "upcoming");
  const recent = list.filter((l) => l.live_state === "ended").sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));

  return (
    <>
      <SectionIntro eyebrow="Isoko Live" title="Live" text="Concerts, talks, sports and events, streamed live by Isoko Entertainment." />
      <div className="space-y-10">
        {list.length === 0 && <ComingSoon what="Live streams" icon={Radio} />}
        {now.length > 0 && <Row title="Live now">{now.map(liveCard)}</Row>}
        {upcoming.length > 0 && <Row title="Upcoming">{upcoming.map(liveCard)}</Row>}
        {recent.length > 0 && <Row title="Recent streams">{recent.map(liveCard)}</Row>}
      </div>
      <FinalCta />
    </>
  );
}

export function LiveDetail() {
  const { slug } = useParams();
  const stream = useBySlug<LiveStream>("ent_live_streams", slug);
  const all = useLiveStreams();
  const host = useQuery({
    queryKey: ["ent", "creator-by-id", stream.data?.host_id],
    enabled: !!stream.data?.host_id,
    queryFn: async () => unwrap(await db.from("ent_creators").select("*").eq("id", stream.data!.host_id).maybeSingle()) as Creator | null,
  });
  if (stream.isLoading) return <PageLoading />;
  const l = stream.data;
  if (!l) return <EntNotFound />;
  const playing = l.live_state === "ended" ? l.recording_ref : l.stream_ref;
  const embed = youtubeEmbed(playing, l.live_state === "live");
  const related = onlyPublic(all.data).filter((o) => o.id !== l.id).slice(0, 10);

  return (
    <>
      <StaffOnlyBanner status={l.status} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 md:pt-10">
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          {embed && l.live_state !== "upcoming" ? (
            <iframe src={embed} title={l.title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          ) : (
            <div className="relative h-full w-full">
              <Img path={l.thumb_path} src={l.thumb_path ? null : youtubeThumb(l.stream_ref)} alt="" className="h-full w-full opacity-50" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <Clock className="h-8 w-8 text-primary" />
                <p className="text-lg font-semibold">{l.live_state === "upcoming" ? `Starts ${when(l.scheduled_at) ?? "soon"}` : "The recording isn't available yet"}</p>
                {l.live_state === "upcoming" && <p className="text-sm text-neutral-400">This page shows the stream as soon as it goes live.</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {l.live_state === "live" ? <LiveBadge /> : <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">{l.live_state === "upcoming" ? "Upcoming" : "Recorded"}</span>}
              <span className="text-sm text-neutral-400">{l.live_state === "live" ? `Started ${when(l.started_at)}` : when(l.scheduled_at ?? l.started_at)}</span>
            </div>
            <h1 className="font-display text-3xl font-bold md:text-4xl">{l.title}</h1>
          </div>
          {host.data && (
            <Link to={linkFor("creator", host.data.slug)} className="flex items-center gap-3 rounded-full bg-white/5 py-1.5 pl-1.5 pr-4">
              <Img path={host.data.avatar_path} alt="" size="sm" ratio="1 / 1" className="w-10 rounded-full" />
              <span className="text-sm"><span className="block text-xs text-neutral-400">Host</span><span className="font-semibold">{host.data.display_name}</span></span>
            </Link>
          )}
        </div>
        {l.description && <p className="max-w-3xl whitespace-pre-line leading-relaxed text-neutral-300">{l.description}</p>}
      </div>
      {related.length > 0 && <Row title="More streams" className="mt-12">{related.map(liveCard)}</Row>}
    </>
  );
}

export function EventsPage() {
  const events = useEvents(200);
  const cats = useCategories("event");
  const [cat, setCat] = useState<string | null>(null);
  if (events.isLoading) return <PageLoading />;
  const all = onlyPublic(events.data);
  const catId = cat ? (cats.data ?? []).find((c) => c.slug === cat)?.id : null;
  const list = catId ? all.filter((e) => e.category_id === catId) : all;

  return (
    <>
      <SectionIntro eyebrow="Isoko Event Coverage" title="Event coverage" text="Weddings, concerts, conferences, sports, corporate events and festivals, photographed and filmed by Isoko.">
        <BookButton what="book Isoko Entertainment to cover an event">Book event coverage</BookButton>
      </SectionIntro>
      <div className="px-4 md:px-10">
        <div className="mb-6"><CategoryChips items={cats.data ?? []} value={cat} onChange={setCat} /></div>
        {all.length === 0 ? (
          <ComingSoon what="Event galleries" icon={CalendarDays} />
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-neutral-400">Nothing in this category yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <Link key={e.id} to={linkFor("event", e.slug)} className="group">
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/10">
                  <Img path={e.cover_path} alt={e.title} size="sm" ratio="4 / 3" className="transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" aria-hidden />
                  <div className="absolute bottom-3 left-4 right-4">
                    <p className="font-display text-xl font-bold">{e.title}</p>
                    <p className="text-sm text-white/75">{[e.held_on && new Date(e.held_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), e.location].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <FinalCta />
    </>
  );
}

export function EventDetail() {
  const { slug } = useParams();
  const ev = useBySlug<EntEvent>("ent_events", slug);
  const images = useChildren<EventImage>("ent_event_images", "event_id", ev.data?.id);
  const all = useEvents(60);
  if (ev.isLoading) return <PageLoading />;
  const e = ev.data;
  if (!e) return <EntNotFound />;
  const video = youtubeEmbed(e.video_youtube);
  const related = onlyPublic(all.data).filter((o) => o.id !== e.id && o.category_id === e.category_id).slice(0, 10);

  return (
    <>
      <StaffOnlyBanner status={e.status} />
      <section className="relative">
        <img src={heroImage(e.cover_path) ?? undefined} alt="" className="h-[52vh] min-h-[300px] w-full bg-neutral-800 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-8">
          <h1 className="font-display text-4xl font-bold md:text-6xl">{e.title}</h1>
          <div className="mt-2 flex flex-wrap gap-4 text-neutral-300">
            {e.held_on && <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {new Date(e.held_on).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            {e.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {e.location}</span>}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-10 px-4 pt-6">
        {e.description && <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-300">{e.description}</p>}
        <div className="flex flex-wrap gap-3">
          <SaveButton type="event" id={e.id} />
          <BookButton what="book Isoko Entertainment to cover my event">Book coverage like this</BookButton>
        </div>
        {video && (
          <section>
            <h2 className="mb-3 font-display text-2xl font-bold">Video coverage</h2>
            <div className="aspect-video overflow-hidden rounded-2xl bg-black">
              <iframe src={video} title={`${e.title} video`} className="h-full w-full" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
          </section>
        )}
        {(images.data ?? []).length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-2xl font-bold">Gallery</h2>
            <Masonry className="lg:columns-3 2xl:columns-4">
              {(images.data ?? []).map((i) => (
                <figure key={i.id} className="break-inside-avoid">
                  <Img path={i.path} alt={i.caption ?? e.title} size="sm" ratio={i.w && i.h ? `${i.w} / ${i.h}` : "4 / 3"} className="rounded-2xl" />
                  {i.caption && <figcaption className="mt-1 text-sm text-neutral-400">{i.caption}</figcaption>}
                </figure>
              ))}
            </Masonry>
          </section>
        )}
      </div>
      {related.length > 0 && (
        <Row title="Related events" className="mt-14">
          {related.map((o) => <WideCard key={o.id} width="large" to={linkFor("event", o.slug)} title={o.title} path={o.cover_path} subtitle={o.location} demo={o.is_demo} icon={CalendarDays} />)}
        </Row>
      )}
      <div className="mt-10 px-4 md:px-10">
        <Link to={`${ENT}/events`} className="text-sm font-semibold text-neutral-400 hover:text-white">← All events</Link>
      </div>
    </>
  );
}

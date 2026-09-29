// Isoko Entertainment's media desk: films, podcasts and episodes, people,
// photo studio, art & design and fashion work, fashion collections, live
// streams, event coverage and categories.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Brush, CalendarDays, Camera, Clapperboard, ExternalLink, Film, LayoutGrid, Mic, Radio, Shirt, Square, Tags, UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db, errorText, unwrap } from "@/features/services/api";
import { ENT, youtubeId } from "@/features/entertainment/api";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { StaffPage } from "../common";
import { ContactEditor, EntityManager, ImagesEditor, slugify, type EntityConfig } from "./manager";

type Row = Record<string, unknown> & { id: string };

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const isPublicStatus = (d: Row) => d.status === "published" || d.status === "scheduled";

// ============== CONFIGS ==============
// "basic" fields are all an editor sees at first; the rest is under "More details".
const CREDITS: EntityConfig = {
  table: "ent_credits", noun: "Person", titleKey: "name", order: "sort",
  subtitle: (r) => `${r.role}${r.character_name ? ` · ${r.character_name}` : ""}`,
  fields: [
    { key: "name", label: "Name", type: "text", required: true, basic: true },
    { key: "role", label: "Role", type: "select", required: true, basic: true, options: opts([["director", "Director"], ["cast", "Actor / actress"], ["host", "Host"], ["guest", "Guest"], ["producer", "Producer"], ["writer", "Writer"]]) },
    { key: "character_name", label: "Plays (character)", type: "text" },
    { key: "creator_id", label: "Link to their profile", type: "relation", relation: { table: "ent_creators", label: "display_name" } },
    { key: "sort", label: "Order in the list", type: "number" },
  ],
  defaults: { role: "cast", sort: 0 },
};

const EPISODES: EntityConfig = {
  table: "ent_episodes", noun: "Episode", titleKey: "name", imageKey: "thumb_path", order: "number", publishable: true,
  subtitle: (r) => `Episode ${r.number} · ${r.format}${r.duration_minutes ? ` · ${r.duration_minutes} min` : ""}`,
  fields: [
    { key: "name", label: "Episode title", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "watch", label: "Video or audio", type: "watch", folder: "episodes", basic: true },
    { key: "number", label: "Episode number", type: "number", required: true },
    { key: "season", label: "Season", type: "number", required: true },
    { key: "format", label: "Audio or video", type: "select", required: true, options: opts([["audio", "Audio"], ["video", "Video"]]) },
    { key: "duration_minutes", label: "Length (minutes)", type: "number", help: "Filled in from the file when you upload one." },
    { key: "thumb_path", label: "Picture", type: "image", folder: "episodes" },
  ],
  defaults: { season: 1, format: "audio", status: "draft" },
  validate: validatePlayable,
};

function validatePlayable(d: Row) {
  if (d.status === "scheduled" && !d.publish_at) return "Choose when it should go on the website.";
  if (d.watch_source === "youtube" && !youtubeId(String(d.watch_ref ?? ""))) return "That doesn't look like a YouTube link.";
  return null;
}

const titleConfig = (kind: "film" | "podcast"): EntityConfig => ({
  table: "ent_titles", noun: kind === "film" ? "Film" : "Podcast", titleKey: "title", imageKey: "poster_path",
  publishable: true, featurable: true, slug: true, scope: { kind },
  subtitle: (r) => [r.release_date ? String(r.release_date).slice(0, 4) : null, r.trend_rank ? `Trending #${r.trend_rank}` : null, kind === "film" ? (r.watch_source ? "Has video" : "No video yet") : null].filter(Boolean).join(" · "),
  fields: [
    { key: "title", label: kind === "film" ? "Film name" : "Podcast name", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "poster_path", label: kind === "film" ? "Poster or picture" : "Cover picture", type: "image", folder: kind, basic: true },
    ...(kind === "film" ? [{ key: "watch", label: "Video", type: "watch" as const, folder: "films", basic: true }] : []),
    { key: "tagline", label: "Short tagline", type: "text", wide: true },
    { key: "trailer_youtube", label: "Trailer (YouTube link)", type: "text", wide: true },
    { key: "category_id", label: "Category", type: "relation", relation: { table: "ent_categories", label: "name", filter: () => ({ section: kind }) } },
    { key: "genres", label: "Genres", type: "tags" },
    { key: "country", label: "Country", type: "text", help: "“Rwanda” puts it in Rwandan Films; any African country in African Films." },
    { key: "language", label: "Language", type: "text" },
    { key: "release_date", label: kind === "film" ? "Release date" : "Started on", type: "date" },
    ...(kind === "film" ? [
      { key: "duration_minutes", label: "Length (minutes)", type: "number" as const, help: "Filled in from the video when you upload one." },
      { key: "age_rating", label: "Age rating", type: "text" as const, help: "e.g. 13+, 16+, 18+" },
    ] : []),
    { key: "trend_rank", label: "Trending position (1 = top)", type: "number", help: "Leave empty unless it should be in Trending Now." },
    { key: "backdrop_path", label: "Wide banner picture", type: "image", folder: kind, help: "For the big banner. The poster is used if empty." },
  ],
  defaults: { kind, status: "draft", genres: [] },
  validate: (d) => {
    if (d.trailer_youtube && !youtubeId(String(d.trailer_youtube))) return "The trailer must be a YouTube link.";
    return validatePlayable(d);
  },
  extrasHint: kind === "film" ? "Add the director and cast below if you like, or press Done." : "Now add the first episode below.",
  extras: (r) => (
    <div className="space-y-4">
      {kind === "podcast" && (
        <div>
          <p className="mb-2 text-sm font-semibold">Episodes</p>
          <EntityManager config={EPISODES} parent={{ column: "title_id", id: r.id }} compact />
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold">{kind === "film" ? "Director and cast (optional)" : "Hosts (optional)"}</p>
        <EntityManager config={{ ...CREDITS, defaults: { role: kind === "film" ? "cast" : "host", sort: 0 } }} parent={{ column: "title_id", id: r.id }} compact />
      </div>
    </div>
  ),
});

const KINDS = opts([["photographer", "Photographer"], ["model", "Model"], ["designer", "Designer"], ["artist", "Artist"], ["director", "Director"], ["actor", "Actor"], ["host", "Podcast host"], ["studio", "Studio"]]);

const PEOPLE: EntityConfig = {
  table: "ent_creators", noun: "Person", titleKey: "display_name", imageKey: "avatar_path", publishable: true, featurable: true, slug: true,
  subtitle: (r) => ((r.kinds as string[]) ?? []).join(", "),
  fields: [
    { key: "display_name", label: "Name", type: "text", required: true, basic: true },
    { key: "kinds", label: "What they do", type: "multi", options: KINDS, basic: true },
    { key: "avatar_path", label: "Photo", type: "image", folder: "people", basic: true },
    { key: "bio", label: "About them", type: "textarea", basic: true },
    {
      key: "adult_confirmed", label: "I checked their ID: they are 18 or older", type: "bool", wide: true, basic: true,
      help: "Isoko represents adult models only.", show: (d) => ((d.kinds as string[]) ?? []).includes("model"),
    },
    { key: "location", label: "Location", type: "text" },
    { key: "headline", label: "One-line summary", type: "text", help: "e.g. “Wedding and portrait photographer in Kigali”." },
    { key: "cover_path", label: "Banner picture", type: "image", folder: "people" },
    { key: "services", label: "Services offered", type: "tags" },
    { key: "details", label: "Details to show", type: "pairs", help: "Only what the person agreed to show (for models: height, sizes, experience). No phone numbers or addresses." },
    { key: "links", label: "Links", type: "pairs", help: "e.g. Instagram → https://instagram.com/…" },
  ],
  defaults: { kinds: [], services: [], details: {}, links: {}, status: "draft" },
  validate: (d) => {
    if (!((d.kinds as string[]) ?? []).length) return "Choose what this person does.";
    if (((d.kinds as string[]) ?? []).includes("model") && isPublicStatus(d) && !d.adult_confirmed) return "Tick that you checked the model is 18 or older.";
    if (d.status === "scheduled" && !d.publish_at) return "Choose when it should go on the website.";
    return null;
  },
  extrasHint: "Their private phone and email can be added below (never shown on the website), or press Done.",
  extras: (r) => <ContactEditor creatorId={r.id} />,
};

const workConfig = (section: "photo" | "art" | "fashion", noun: string): EntityConfig => ({
  table: "ent_works", noun, titleKey: "title", imageKey: "cover_path", publishable: true, featurable: true, slug: true, scope: { section },
  subtitle: (r) => [r.year, ((r.tags as string[]) ?? []).slice(0, 3).join(", ")].filter(Boolean).join(" · "),
  fields: [
    { key: "title", label: "Title", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "cover_path", label: "Main picture", type: "image", folder: `works/${section}`, dims: ["cover_w", "cover_h"], basic: true },
    { key: "creator_id", label: section === "fashion" ? "Model or designer" : section === "photo" ? "Photographer" : "Artist or designer", type: "relation", relation: { table: "ent_creators", label: "display_name" } },
    { key: "category_id", label: "Category", type: "relation", relation: { table: "ent_categories", label: "name", filter: () => ({ section }) } },
    { key: "tags", label: "Tags", type: "tags" },
    { key: "year", label: "Year", type: "number" },
    { key: "trend_rank", label: "Trending position (1 = top)", type: "number" },
  ],
  defaults: { section, status: "draft", tags: [] },
  validate: (d) => (d.status === "scheduled" && !d.publish_at ? "Choose when it should go on the website." : null),
  extrasHint: "Add more pictures below if you like, or press Done.",
  extras: (r) => <ImagesEditor table="ent_work_images" column="work_id" parentId={r.id} kinds={section === "photo"} />,
});

const COLLECTIONS: EntityConfig = {
  table: "ent_collections", noun: "Collection", titleKey: "title", imageKey: "cover_path", publishable: true, featurable: true, slug: true,
  subtitle: (r) => [r.kind, r.season].filter(Boolean).join(" · "),
  fields: [
    { key: "title", label: "Name", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "cover_path", label: "Main picture", type: "image", folder: "collections", basic: true },
    { key: "kind", label: "Type", type: "select", required: true, options: opts([["collection", "Collection"], ["campaign", "Campaign"], ["show", "Fashion show"], ["lookbook", "Lookbook"], ["editorial", "Editorial"]]) },
    { key: "designer_id", label: "Designer", type: "relation", relation: { table: "ent_creators", label: "display_name", filter: () => ({ kinds: ["designer"] }) } },
    { key: "season", label: "Season", type: "text", help: "e.g. Spring 2026" },
    { key: "held_on", label: "Date", type: "date" },
  ],
  defaults: { kind: "collection", status: "draft" },
  extrasHint: "Tick the looks that belong to it below, or press Done.",
  extras: (r) => <CollectionWorks collectionId={r.id} />,
};

const EVENTS: EntityConfig = {
  table: "ent_events", noun: "Event", titleKey: "title", imageKey: "cover_path", publishable: true, featurable: true, slug: true,
  subtitle: (r) => [r.held_on, r.location, r.publish_consent ? null : "No client consent yet"].filter(Boolean).join(" · "),
  fields: [
    { key: "title", label: "Event name", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "cover_path", label: "Main picture", type: "image", folder: "events", basic: true },
    { key: "publish_consent", label: "The client agreed to show this on the website", type: "bool", basic: true, help: "Needed before you can publish it." },
    { key: "held_on", label: "Date", type: "date" },
    { key: "location", label: "Place", type: "text" },
    { key: "category_id", label: "Category", type: "relation", relation: { table: "ent_categories", label: "name", filter: () => ({ section: "event" }) } },
    { key: "video_youtube", label: "Video (YouTube link)", type: "text", wide: true },
  ],
  defaults: { status: "draft" },
  validate: (d) => {
    if (isPublicStatus(d) && !d.publish_consent) return "Tick that the client agreed before publishing their event.";
    if (d.video_youtube && !youtubeId(String(d.video_youtube))) return "The video must be a YouTube link.";
    if (d.status === "scheduled" && !d.publish_at) return "Choose when it should go on the website.";
    return null;
  },
  extrasHint: "Add the event photos below, or press Done.",
  extras: (r) => <ImagesEditor table="ent_event_images" column="event_id" parentId={r.id} />,
};

const LIVE: EntityConfig = {
  table: "ent_live_streams", noun: "Live stream", titleKey: "title", imageKey: "thumb_path", publishable: true, featurable: true, slug: true,
  order: "scheduled_at",
  subtitle: (r) => [String(r.live_state).toUpperCase(), r.scheduled_at ? new Date(String(r.scheduled_at)).toLocaleString("en-GB") : null].filter(Boolean).join(" · "),
  fields: [
    { key: "title", label: "Title", type: "text", required: true, basic: true },
    { key: "description", label: "Description", type: "textarea", basic: true },
    { key: "scheduled_at", label: "Starts at", type: "datetime", basic: true },
    { key: "stream_ref", label: "YouTube live link", type: "text", basic: true, help: "Create the broadcast in YouTube Studio, then paste its link. When it starts, press “Go live” in the list." },
    { key: "thumb_path", label: "Picture", type: "image", folder: "live", help: "YouTube's picture is used if empty." },
    { key: "host_id", label: "Host", type: "relation", relation: { table: "ent_creators", label: "display_name" } },
    { key: "category_id", label: "Category", type: "relation", relation: { table: "ent_categories", label: "name", filter: () => ({ section: "live" }) } },
    { key: "recording_ref", label: "Recording (YouTube link, after it ends)", type: "text", wide: true },
  ],
  defaults: { status: "draft", live_state: "upcoming" },
  validate: (d) => {
    if (d.stream_ref && !youtubeId(String(d.stream_ref))) return "The stream must be a YouTube link.";
    if (d.recording_ref && !youtubeId(String(d.recording_ref))) return "The recording must be a YouTube link.";
    if (d.status === "scheduled" && !d.publish_at) return "Choose when it should go on the website.";
    return null;
  },
  rowActions: (r) => <LiveControls row={r} />,
};

const CATEGORIES: EntityConfig = {
  table: "ent_categories", noun: "Category", titleKey: "name", order: "sort",
  subtitle: (r) => String(r.section),
  fields: [
    { key: "name", label: "Name", type: "text", required: true, basic: true },
    { key: "section", label: "Section", type: "select", required: true, basic: true, options: opts([["film", "Films"], ["podcast", "Podcasts"], ["photo", "Photo Studio"], ["art", "Art & Design"], ["fashion", "Fashion"], ["live", "Live"], ["event", "Events"]]) },
    { key: "sort", label: "Order", type: "number" },
  ],
  defaults: { section: "film", sort: 0 },
  // the web name comes from the name
  prepare: (p) => {
    if (!p.slug) p.slug = slugify(String(p.name ?? ""));
  },
};

// ============== PARTS ==============
/** "Go live" and "End" set the real start and end; the site shows LIVE only in between. */
function LiveControls({ row }: { row: Row }) {
  const qc = useQueryClient();
  const set = async (patch: Record<string, unknown>, done: string) => {
    try {
      unwrap(await db.from("ent_live_streams").update(patch).eq("id", row.id));
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["media-admin", "ent_live_streams"] });
      qc.invalidateQueries({ queryKey: ["ent", "live"] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  if (row.live_state === "upcoming") {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
        if (!youtubeId(String(row.stream_ref ?? ""))) return toast.error("Add the YouTube live link first.");
        if (row.status !== "published") return toast.error("Publish the stream first so viewers can find it.");
        set({ live_state: "live", started_at: new Date().toISOString() }, "You're live");
      }}>
        <Radio className="h-4 w-4 text-primary" /> Go live
      </Button>
    );
  }
  if (row.live_state === "live") {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => set({ live_state: "ended", ended_at: new Date().toISOString() }, "Stream ended")}>
        <Square className="h-4 w-4" /> End
      </Button>
    );
  }
  return null;
}

function CollectionWorks({ collectionId }: { collectionId: string }) {
  const qc = useQueryClient();
  const key = ["media-admin", "collection-works", collectionId];
  const data = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [works, chosen] = await Promise.all([
        db.from("ent_works").select("id,title,cover_path").eq("section", "fashion").order("created_at", { ascending: false }).limit(300),
        db.from("ent_collection_works").select("work_id").eq("collection_id", collectionId),
      ]);
      return { works: unwrap(works) as Row[], chosen: new Set((unwrap(chosen) as { work_id: string }[]).map((c) => c.work_id)) };
    },
  });
  const toggle = async (workId: string, on: boolean) => {
    try {
      if (on) unwrap(await db.from("ent_collection_works").insert({ collection_id: collectionId, work_id: workId, sort: data.data?.chosen.size ?? 0 }));
      else unwrap(await db.from("ent_collection_works").delete().eq("collection_id", collectionId).eq("work_id", workId));
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Looks in this collection</p>
      {!data.data?.works.length ? (
        <p className="text-sm text-muted-foreground">Add fashion work first (Fashion → Work), then pick it here.</p>
      ) : (
        <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
          {data.data.works.map((w) => (
            <label key={w.id} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={data.data!.chosen.has(w.id)} onChange={(e) => toggle(w.id, e.target.checked)} />
              <span className="truncate">{String(w.title)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ============== PAGES ==============
const NAV = [
  { to: "/staff/media", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/staff/media/films", label: "Films", icon: Film },
  { to: "/staff/media/podcasts", label: "Podcasts", icon: Mic },
  { to: "/staff/media/people", label: "People", icon: UsersRound },
  { to: "/staff/media/work", label: "Work", icon: Brush },
  { to: "/staff/media/fashion", label: "Fashion", icon: Shirt },
  { to: "/staff/media/live", label: "Live", icon: Radio },
  { to: "/staff/media/events", label: "Events", icon: CalendarDays },
  { to: "/staff/media/categories", label: "Categories", icon: Tags },
];

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <StaffPage
      title={title}
      subtitle={subtitle}
      nav={
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Media sections">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      }
      actions={<Button asChild variant="outline" size="sm" className="gap-1.5"><Link to={ENT} target="_blank"><ExternalLink className="h-4 w-4" /> View site</Link></Button>}
    >
      {children}
    </StaffPage>
  );
}

const QUICK = [
  { label: "A film", to: "/staff/media/films?new=film", icon: Film },
  { label: "A podcast", to: "/staff/media/podcasts?new=podcast", icon: Mic },
  { label: "Photos (Photo Studio)", to: "/staff/media/work?new=photo", icon: Camera },
  { label: "Art or design work", to: "/staff/media/work?new=art", icon: Brush },
  { label: "A fashion look", to: "/staff/media/fashion?new=look", icon: Shirt },
  { label: "A fashion collection", to: "/staff/media/fashion?new=collection", icon: Shirt },
  { label: "A person (model, photographer…)", to: "/staff/media/people?new=person", icon: UsersRound },
  { label: "A live stream", to: "/staff/media/live?new=live", icon: Radio },
  { label: "An event", to: "/staff/media/events?new=event", icon: CalendarDays },
];

const COUNTS: [string, string, string, Record<string, unknown>?][] = [
  ["Films", "/staff/media/films", "ent_titles", { kind: "film" }],
  ["Podcast shows", "/staff/media/podcasts", "ent_titles", { kind: "podcast" }],
  ["People", "/staff/media/people", "ent_creators"],
  ["Portfolio work", "/staff/media/work", "ent_works"],
  ["Live streams", "/staff/media/live", "ent_live_streams"],
  ["Events", "/staff/media/events", "ent_events"],
];

export function MediaOverview() {
  const counts = useQuery({
    queryKey: ["media-admin", "counts"],
    queryFn: async () =>
      Promise.all(COUNTS.map(async ([, , table, where]) => {
        let q = db.from(table).select("id", { count: "exact", head: true });
        for (const [k, v] of Object.entries(where ?? {})) q = q.eq(k, v);
        const res = await q;
        return { total: res.count ?? 0 };
      })),
  });
  return (
    <Shell title="Media" subtitle="Everything on Isoko Entertainment. What you publish is on the website at once.">
      <h2 className="mb-3 font-semibold">What do you want to add?</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="card-interactive flex flex-col items-start gap-3 rounded-2xl border bg-card p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><q.icon className="h-5 w-5" /></span>
            <span className="font-semibold">{q.label}</span>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 font-semibold">On the website</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COUNTS.map(([label, to], i) => (
          <Link key={to + label} to={to} className="card-interactive flex items-center justify-between rounded-2xl border bg-card p-4">
            <span className="font-medium">{label}</span>
            <span className="text-3xl font-bold tabular-nums">{counts.data ? counts.data[i].total : "–"}</span>
          </Link>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">How publishing works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Draft</b>: only media staff see it. <b>Published</b>: everyone sees it. <b>Scheduled</b>: goes public by itself at the time you set. <b>Archived</b>: off the site, kept here.</li>
          <li>Posters and gallery images are made web-sized when you upload them. Full films and episodes are kept private: only subscribers can play them.</li>
          <li>Anything marked <b>Demo</b> is labelled “Demo” on the site. Never publish sample content without it.</li>
          <li>Models: publish only after confirming they're 18 or older. Weddings and private events: only with the client's consent.</li>
        </ul>
      </div>
    </Shell>
  );
}

export const MediaFilms = () => <Shell title="Films" subtitle="Give it a name, a description, a picture and the video, then press Publish."><EntityManager config={titleConfig("film")} openKey="film" /></Shell>;
export const MediaPodcasts = () => <Shell title="Podcasts" subtitle="Add the podcast, then its episodes inside it."><EntityManager config={titleConfig("podcast")} openKey="podcast" /></Shell>;
export const MediaPeople = () => <Shell title="People" subtitle="Photographers, models, designers, artists, directors, actors and hosts."><EntityManager config={PEOPLE} openKey="person" /></Shell>;

export function MediaWork() {
  return (
    <Shell title="Portfolio work" subtitle="Photo Studio and Art & Design pieces, each with its own gallery.">
      <h2 className="mb-2 mt-2 font-semibold">Photo Studio</h2>
      <EntityManager config={workConfig("photo", "Photo project")} openKey="photo" />
      <h2 className="mb-2 mt-8 font-semibold">Art & Design</h2>
      <EntityManager config={workConfig("art", "Art project")} openKey="art" />
    </Shell>
  );
}

export function MediaFashion() {
  return (
    <Shell title="Fashion" subtitle="Editorial looks and campaign images, and the collections, shows and lookbooks made of them.">
      <h2 className="mb-2 mt-2 font-semibold">Work</h2>
      <EntityManager config={workConfig("fashion", "Fashion look")} openKey="look" />
      <h2 className="mb-2 mt-8 font-semibold">Collections, shows and lookbooks</h2>
      <EntityManager config={COLLECTIONS} openKey="collection" />
    </Shell>
  );
}

export const MediaLive = () => <Shell title="Live" subtitle="Schedule a stream, publish it, then press Go live when the broadcast starts."><EntityManager config={LIVE} openKey="live" /></Shell>;
export const MediaEvents = () => <Shell title="Event coverage" subtitle="Galleries and video from events Isoko covered."><EntityManager config={EVENTS} openKey="event" /></Shell>;
export const MediaCategories = () => <Shell title="Categories" subtitle="The filters shown in each section."><EntityManager config={CATEGORIES} /></Shell>;

export const MEDIA_ICON = Clapperboard;

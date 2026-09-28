import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { db, unwrap } from "@/features/services/api";
import { PageLoading } from "@/features/services/ui";
import EntLayout from "./EntLayout";
import EntHome from "./pages/Home";
import { FilmDetail, FilmsPage } from "./pages/Films";
import { EpisodeDetail, PodcastsPage, ShowDetail } from "./pages/Podcasts";
import { CollectionDetail, CreatorPage, GallerySection, WorkDetail } from "./pages/Gallery";
import { EventDetail, EventsPage, LiveDetail, LivePage } from "./pages/LiveEvents";
import { onlyPublic, linkFor } from "./api";
import { EntNotFound, PinCard, SectionIntro } from "./ui";

/** /entertainment/*: public to browse; full films and episodes play for subscribers. */
export default function EntRoutes() {
  return (
    <Routes>
      <Route element={<EntLayout />}>
        <Route index element={<EntHome />} />
        <Route path="films" element={<FilmsPage />} />
        <Route path="films/:slug" element={<FilmDetail />} />
        <Route path="podcasts" element={<PodcastsPage />} />
        <Route path="podcasts/:slug" element={<ShowDetail />} />
        <Route path="podcasts/:slug/episodes/:episodeId" element={<EpisodeDetail />} />
        <Route path="photo-studio" element={<GallerySection section="photo" />} />
        <Route path="art-design" element={<GallerySection section="art" />} />
        <Route path="fashion" element={<GallerySection section="fashion" />} />
        <Route path="fashion/collections/:slug" element={<CollectionDetail />} />
        <Route path="work/:slug" element={<WorkDetail />} />
        <Route path="people/:slug" element={<CreatorPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="live/:slug" element={<LiveDetail />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:slug" element={<EventDetail />} />
        <Route path="saved" element={<Saved />} />
        <Route path="*" element={<EntNotFound />} />
      </Route>
    </Routes>
  );
}

const SAVED_TABLE = { title: "ent_titles", work: "ent_works", collection: "ent_collections", event: "ent_events", creator: "ent_creators" } as const;

/** Everything the signed-in person saved, newest first. */
function Saved() {
  const { user, loading } = useAuth();
  const saved = useQuery({
    queryKey: ["ent", "saved-items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const saves = unwrap(await db.from("ent_saves").select("*").order("created_at", { ascending: false })) as { item_type: keyof typeof SAVED_TABLE; item_id: string }[];
      const groups = await Promise.all(
        (Object.keys(SAVED_TABLE) as (keyof typeof SAVED_TABLE)[]).map(async (type) => {
          const ids = saves.filter((s) => s.item_type === type).map((s) => s.item_id);
          if (!ids.length) return [];
          const rows = onlyPublic(unwrap(await db.from(SAVED_TABLE[type]).select("*").in("id", ids)) as never[]) as Record<string, never>[];
          return rows.map((r) => ({ type, row: r as Record<string, unknown> }));
        }),
      );
      const all = groups.flat();
      return saves.map((s) => all.find((a) => a.type === s.item_type && a.row.id === s.item_id)).filter(Boolean) as { type: keyof typeof SAVED_TABLE; row: Record<string, unknown> }[];
    },
  });
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: "/entertainment/saved" }} />;

  return (
    <>
      <SectionIntro eyebrow="Your list" title="Saved" text="Films, podcasts, work, collections, events and people you saved." />
      <div className="px-4 md:px-10">
        {saved.isLoading ? (
          <PageLoading />
        ) : !saved.data?.length ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <Bookmark className="h-9 w-9 text-neutral-500" />
            <p className="mt-3 font-semibold">Nothing saved yet</p>
            <p className="mt-1 text-sm text-neutral-400">Tap Save on anything you like to find it here again.</p>
          </div>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 md:gap-4 lg:columns-5 [&>*]:mb-3">
            {saved.data.map(({ type, row }) => {
              const kind = type === "title" ? String(row.kind) : type === "work" ? `work:${row.section}` : type;
              const title = String(row.title ?? row.display_name ?? "");
              const path = (row.cover_path ?? row.poster_path ?? row.avatar_path ?? null) as string | null;
              return <PinCard key={`${type}:${row.id}`} to={linkFor(kind, String(row.slug))} title={title} path={path} w={row.cover_w as number | null} h={row.cover_h as number | null} demo={!!row.is_demo} />;
            })}
          </div>
        )}
      </div>
    </>
  );
}

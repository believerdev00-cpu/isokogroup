-- TV series on Isoko Entertainment: Entertainment → Film → Genre | Movies | TV Series.
--
-- What changed and why:
--   * ent_titles.kind now allows 'series'. A TV series is a title like a film
--     (poster, description, genres, trailer, cast) but has no single video of
--     its own: it plays through its episodes.
--   * ent_episodes already holds season / number / name / format / watch for
--     podcast shows. A series' episodes are the same rows, with title_id = the
--     series. The media desk creates them with format 'video' by default; the
--     column's own default ('audio') is unchanged so podcasts behave as before.
--     The existing policy (an episode is public only when its title is) covers
--     series as it covers podcasts.
--   * Genres are ent_categories rows in section 'film'. Four more are added to
--     the six seeded before (Drama, Comedy, Documentary, Action, Romance, Short
--     film): Thriller, Animation, Family, Adventure. A title is in a genre when
--     its category matches or its genres[] names it; the website does that
--     matching. No film or series is created here: an empty genre shows an
--     empty state on the site.
--   * ent_search needs no change: it returns t.kind, so a series is found as
--     kind 'series'.
-- Row-level security and grants are unchanged: the policies on ent_titles and
-- ent_episodes already decide who sees and who edits every kind.

ALTER TABLE public.ent_titles DROP CONSTRAINT IF EXISTS ent_titles_kind_check;
ALTER TABLE public.ent_titles ADD CONSTRAINT ent_titles_kind_check CHECK (kind IN ('film', 'podcast', 'series'));

INSERT INTO public.ent_categories (section, slug, name, sort) VALUES
  ('film', 'thriller', 'Thriller', 7),
  ('film', 'animation', 'Animation', 8),
  ('film', 'family', 'Family', 9),
  ('film', 'adventure', 'Adventure', 10)
ON CONFLICT (section, slug) DO NOTHING;

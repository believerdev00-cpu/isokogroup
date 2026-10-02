// Sitemap of the ISOKO Information Hub: GET /functions/v1/research-sitemap
//
// Lists every public research item, every active country page and every topic
// page as XML for search engines. The website serves it at
// /sitemap-research.xml (a Vercel rewrite) and robots.txt points to it.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SITE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://www.isokogroups.com").replace(/\/$/, "");

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
const url = (loc: string, lastmod?: string | null, changefreq = "weekly") =>
  `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod.slice(0, 10))}</lastmod>` : ""}<changefreq>${changefreq}</changefreq></url>`;

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const now = new Date().toISOString();
  const [items, countries, topics] = await Promise.all([
    admin.from("research_items").select("slug, updated_at, status, publish_at").in("status", ["published", "scheduled"]).order("updated_at", { ascending: false }).limit(20000),
    admin.from("research_countries").select("slug").eq("is_active", true).order("sort"),
    admin.from("research_topics").select("slug").order("sort"),
  ]);
  if (items.error || countries.error || topics.error) {
    console.error(`research-sitemap: ${items.error?.message ?? countries.error?.message ?? topics.error?.message}`);
    return new Response("Sitemap unavailable", { status: 500 });
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url(`${SITE}/research`, now, "daily"),
    ...(countries.data ?? []).map((c: { slug: string }) => url(`${SITE}/research/countries/${c.slug}`, null, "weekly")),
    ...(topics.data ?? []).map((t: { slug: string }) => url(`${SITE}/research/topics/${t.slug}`, null, "weekly")),
    ...(items.data ?? [])
      .filter((i: { status: string; publish_at: string | null }) => i.status === "published" || (i.publish_at && i.publish_at <= now))
      .map((i: { slug: string; updated_at: string }) => url(`${SITE}/research/${i.slug}`, i.updated_at, "monthly")),
    "</urlset>",
  ];
  return new Response(req.method === "HEAD" ? null : lines.join("\n"), {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});

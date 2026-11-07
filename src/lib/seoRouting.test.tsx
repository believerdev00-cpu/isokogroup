import fs from "fs";
import path from "path";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RouteSeo from "@/components/RouteSeo";
import { renderAppShell, renderNotFound, renderSeoPage } from "./seoHtml";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  fullTitle,
  isNoindexPath,
  SEO_PAGES,
  seoFileSlug,
  seoPageFor,
  SITE_ORIGIN,
} from "./seoPages";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const vercel = JSON.parse(read("vercel.json")) as {
  rewrites: { source: string; destination: string }[];
  redirects: { source: string; destination: string }[];
};
const appRoutes = [...read("src/App.tsx").matchAll(/Route path="([^"]+)"/g)].map((m) => m[1]);
const sitemap = read("public/sitemap.xml");
const indexHtml = read("index.html");

describe("every address the app routes is served", () => {
  const rewritten = new Set(vercel.rewrites.map((r) => r.source));
  const redirected = new Set(vercel.redirects.map((r) => r.source));

  it.each(appRoutes.filter((r) => r !== "/" && r !== "*"))("%s", (route) => {
    if (route.endsWith("/*")) {
      const base = route.slice(0, -2);
      expect(rewritten.has(base) && rewritten.has(`${base}/:path*`)).toBe(true);
    } else {
      expect(rewritten.has(route) || redirected.has(route)).toBe(true);
    }
  });

  it("has no catch-all, so addresses the site doesn't have get a real 404", () => {
    const sections = appRoutes.filter((r) => r.endsWith("/*")).map((r) => `${r.slice(0, -2)}/:path*`);
    for (const { source } of vercel.rewrites) {
      expect(source).not.toMatch(/\(\.\*\)/);
      if (source.includes("*")) expect(sections).toContain(source);
    }
  });

  it("serves each public page from its own generated file, and only routes that exist", () => {
    for (const page of SEO_PAGES.filter((p) => p.path !== "/")) {
      expect(appRoutes).toContain(page.path);
      expect(vercel.rewrites).toContainEqual({ source: page.path, destination: `/seo/${seoFileSlug(page.path)}.html` });
    }
  });

  it("lists every public page in the sitemap", () => {
    for (const page of SEO_PAGES) expect(sitemap).toContain(`<loc>${SITE_ORIGIN}${page.path}</loc>`);
  });
});

describe("page metadata", () => {
  it("keeps index.html's defaults equal to seoPages.ts and free of template leftovers", () => {
    expect(indexHtml).toContain(`<title>${DEFAULT_TITLE}</title>`);
    expect(indexHtml).toContain(`name="description" content="${DEFAULT_DESCRIPTION}"`);
    expect(indexHtml).not.toMatch(/@Lovable|TODO/);
  });

  it("gives every public page its own title and description, within search-result lengths", () => {
    const titles = SEO_PAGES.map((p) => fullTitle(p.title));
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(SEO_PAGES.map((p) => p.description)).size).toBe(SEO_PAGES.length);
    for (const p of SEO_PAGES) {
      expect(fullTitle(p.title).length).toBeLessThanOrEqual(70);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("writes a page's own head and a visible heading into the built HTML", () => {
    const about = SEO_PAGES.find((p) => p.path === "/about")!;
    const html = renderSeoPage(indexHtml, about);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain(`<title>${fullTitle(about.title)}</title>`);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/about" />`);
    expect(html).toContain(`property="og:url" content="${SITE_ORIGIN}/about"`);
    expect(html).toContain(`<h1 class="font-display text-4xl font-bold">${about.heading}</h1>`);
    expect(html).toContain('<a href="/services">Services</a>');
    expect(html).not.toContain('<a href="/about">');
  });

  it("escapes text and keeps structured data from closing its script tag", () => {
    const html = renderSeoPage(indexHtml, {
      ...SEO_PAGES[0],
      heading: 'Tom & "Jerry" <b>',
      jsonLd: { name: "</script><script>alert(1)</script>" },
    });
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
    expect(html).not.toContain("</script><script>alert(1)");
  });

  it("puts the organization's structured data on the home page", () => {
    const html = renderSeoPage(indexHtml, SEO_PAGES.find((p) => p.path === "/")!);
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
  });

  it("marks the 404 page noindex, and leaves the app shell without a canonical address", () => {
    expect(renderNotFound(indexHtml)).toContain('<meta name="robots" content="noindex" />');
    expect(renderAppShell(indexHtml)).not.toContain('rel="canonical"');
  });
});

describe("addresses at run time", () => {
  it("finds public pages with or without a trailing slash", () => {
    expect(seoPageFor("/about/")?.path).toBe("/about");
    expect(seoPageFor("/")?.path).toBe("/");
    expect(seoPageFor("/logistics")).toBeUndefined();
  });

  it("keeps sign-in, accounts, staff desks and private links out of search", () => {
    for (const p of ["/login", "/admin", "/staff/finance", "/dashboard", "/travel/trip/abc", "/data-analysis/r/x"]) expect(isNoindexPath(p)).toBe(true);
    for (const p of ["/", "/about", "/travel", "/travel/plan", "/sellers", "/subscription"]) expect(isNoindexPath(p)).toBe(false);
  });

  it("applies a public page's metadata, and noindex on private addresses", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/about"]}>
        <RouteSeo />
      </MemoryRouter>,
    );
    expect(document.title).toBe(fullTitle(SEO_PAGES.find((p) => p.path === "/about")!.title));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${SITE_ORIGIN}/about`);
    unmount();

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <RouteSeo />
      </MemoryRouter>,
    );
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });
});

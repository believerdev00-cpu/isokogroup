// Writes a page's metadata and a visible heading into the built index.html, so each
// public page is served as real HTML (see seoPages.ts). Plain string work, no DOM:
// it runs in the build (vite.config.ts) and in tests.
import { absoluteUrl, fullTitle, SEO_PAGES, type SeoPage } from "./seoPages";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** JSON inside <script> must not be able to close the tag */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function setTitle(html: string, title: string) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

/** Replaces the content of <meta name|property="key">, or adds the tag before </head> */
function setMeta(html: string, attr: "name" | "property", key: string, value: string) {
  const tag = new RegExp(`<meta\\s+[^>]*${attr}="${key.replace(/[.:]/g, "\\$&")}"[^>]*>`, "i");
  const fresh = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return tag.test(html) ? html.replace(tag, fresh) : html.replace(/<\/head>/i, `    ${fresh}\n  </head>`);
}

function addToHead(html: string, markup: string) {
  return html.replace(/<\/head>/i, `    ${markup}\n  </head>`);
}

function setRoot(html: string, inner: string) {
  return html.replace(/<div id="root"><\/div>/i, `<div id="root">${inner}</div>`);
}

/** Links between the public pages, so crawlers that don't run the app can still move around */
function siteLinks(current: string) {
  const items = SEO_PAGES.filter((p) => p.path !== current)
    .map((p) => `<li><a href="${escapeHtml(p.path)}">${escapeHtml(p.label)}</a></li>`)
    .join("");
  return `<nav aria-label="ISOKO GROUP"><ul>${items}</ul></nav>`;
}

/** The built index.html, rewritten for one public page */
export function renderSeoPage(shell: string, page: SeoPage): string {
  const title = fullTitle(page.title);
  const url = absoluteUrl(page.path);
  let html = setTitle(shell, title);
  html = setMeta(html, "name", "description", page.description);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", page.description);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", page.description);
  html = addToHead(html, `<link rel="canonical" href="${escapeHtml(url)}" />`);
  if (page.jsonLd) html = addToHead(html, `<script type="application/ld+json" id="seo-jsonld">${safeJson(page.jsonLd)}</script>`);
  // Replaced by the app as soon as it starts (createRoot().render clears #root)
  return setRoot(
    html,
    `<main class="container py-16"><h1 class="font-display text-4xl font-bold">${escapeHtml(page.heading)}</h1>` +
      `<p class="mt-4 max-w-2xl text-muted-foreground">${escapeHtml(page.summary)}</p>${siteLinks(page.path)}</main>`,
  );
}

/** The app shell for every other address: site defaults, and no canonical (each page sets its own) */
export function renderAppShell(shell: string): string {
  return shell;
}

/** Served by Vercel with status 404 for addresses the site doesn't have */
export function renderNotFound(shell: string): string {
  return setMeta(shell, "name", "robots", "noindex");
}

import { useEffect } from "react";

// Page metadata for search engines and link previews, set from the page that
// knows it (the site is a single-page app, so the <head> is updated at run
// time). Everything is restored when the page goes away, so the next page
// starts from the site defaults in index.html.

export const SITE_ORIGIN = "https://www.isokogroups.com";
export const SITE_NAME = "ISOKO GROUP";
const JSONLD_ID = "seo-jsonld";

export type SeoOptions = {
  title: string;
  description: string;
  /** absolute, or a path on the site */
  canonical?: string;
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
};

/** "https://www.isokogroups.com/research/x" from "/research/x" (absolute addresses are kept) */
export const absoluteUrl = (pathOrUrl: string) => (/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`);

type Restore = () => void;

function setMeta(attr: "name" | "property", key: string, value: string | undefined, restores: Restore[]) {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (value === undefined) return;
  if (existing) {
    const before = existing.getAttribute("content");
    existing.setAttribute("content", value);
    restores.push(() => { if (before === null) existing.removeAttribute("content"); else existing.setAttribute("content", before); });
  } else {
    const el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute("content", value);
    document.head.appendChild(el);
    restores.push(() => el.remove());
  }
}

function setLink(rel: string, href: string | undefined, restores: Restore[]) {
  if (href === undefined) return;
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (existing) {
    const before = existing.getAttribute("href");
    existing.setAttribute("href", href);
    restores.push(() => { if (before === null) existing.remove(); else existing.setAttribute("href", before); });
  } else {
    const el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("href", href);
    document.head.appendChild(el);
    restores.push(() => el.remove());
  }
}

/** Applies the metadata now and returns a function that puts everything back. Used by useSeo; exported for tests. */
export function applySeo(o: SeoOptions): Restore {
  const restores: Restore[] = [];
  const title = o.title.includes(SITE_NAME) ? o.title : `${o.title} · ${SITE_NAME}`;
  const beforeTitle = document.title;
  document.title = title;
  restores.push(() => { document.title = beforeTitle; });
  const canonical = o.canonical ? absoluteUrl(o.canonical) : undefined;
  setMeta("name", "description", o.description, restores);
  setMeta("name", "robots", o.noindex ? "noindex, nofollow" : undefined, restores);
  setLink("canonical", canonical, restores);
  setMeta("property", "og:title", title, restores);
  setMeta("property", "og:description", o.description, restores);
  setMeta("property", "og:type", o.type ?? "website", restores);
  setMeta("property", "og:url", canonical, restores);
  setMeta("property", "og:site_name", SITE_NAME, restores);
  setMeta("property", "og:image", o.image ? absoluteUrl(o.image) : undefined, restores);
  setMeta("name", "twitter:card", "summary_large_image", restores);
  setMeta("name", "twitter:title", title, restores);
  setMeta("name", "twitter:description", o.description, restores);
  if (o.jsonLd) {
    document.getElementById(JSONLD_ID)?.remove();
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = JSONLD_ID;
    script.text = JSON.stringify(o.jsonLd);
    document.head.appendChild(script);
    restores.push(() => script.remove());
  }
  return () => { for (const r of restores.reverse()) r(); };
}

/** Sets this page's title, description, canonical address, link-preview tags and structured data. */
export function useSeo(o: SeoOptions) {
  const key = JSON.stringify(o);
  useEffect(() => applySeo(JSON.parse(key) as SeoOptions), [key]);
}

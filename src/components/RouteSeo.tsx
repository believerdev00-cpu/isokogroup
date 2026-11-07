import { useLocation } from "react-router-dom";
import { useSeo } from "@/lib/seo";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, isNoindexPath, seoPageFor } from "@/lib/seoPages";

/**
 * Keeps the page's title, description and canonical address right as visitors move
 * around the app: the public pages' entries from seoPages.ts, the site defaults
 * elsewhere, and noindex for sign-in, accounts, staff desks and private links.
 *
 * Rendered before <Routes>, so a page that sets its own metadata with useSeo
 * (research, the Global Initiative, products) runs after it and wins.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();
  const page = seoPageFor(pathname);
  useSeo(
    page
      ? { title: page.title, description: page.description, canonical: page.path, jsonLd: page.jsonLd }
      : { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonical: pathname, noindex: isNoindexPath(pathname) },
  );
  return null;
}

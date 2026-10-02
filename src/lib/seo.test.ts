import { afterEach, describe, expect, it } from "vitest";
import { absoluteUrl, applySeo } from "./seo";

const meta = (sel: string) => document.head.querySelector<HTMLMetaElement>(sel)?.getAttribute("content") ?? null;

describe("page metadata (seo)", () => {
  afterEach(() => {
    document.head.querySelectorAll("meta, link, script").forEach((n) => n.remove());
    document.title = "ISOKO GROUP";
  });

  it("makes absolute addresses on the site", () => {
    expect(absoluteUrl("/research")).toBe("https://www.isokogroups.com/research");
    expect(absoluteUrl("research/x")).toBe("https://www.isokogroups.com/research/x");
    expect(absoluteUrl("https://example.org/a")).toBe("https://example.org/a");
  });

  it("sets title, description, canonical, link-preview tags and structured data, then restores", () => {
    const d = document.createElement("meta");
    d.setAttribute("name", "description");
    d.setAttribute("content", "default description");
    document.head.appendChild(d);
    document.title = "ISOKO GROUP";

    const restore = applySeo({
      title: "Population of Rwanda",
      description: "Statistics about the population of Rwanda.",
      canonical: "/research/population-of-rwanda",
      type: "article",
      jsonLd: { "@context": "https://schema.org", "@type": "Dataset", name: "Population of Rwanda" },
    });
    expect(document.title).toBe("Population of Rwanda · ISOKO GROUP");
    expect(meta('meta[name="description"]')).toBe("Statistics about the population of Rwanda.");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://www.isokogroups.com/research/population-of-rwanda");
    expect(meta('meta[property="og:title"]')).toBe("Population of Rwanda · ISOKO GROUP");
    expect(meta('meta[property="og:url"]')).toBe("https://www.isokogroups.com/research/population-of-rwanda");
    expect(meta('meta[property="og:type"]')).toBe("article");
    expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(meta('meta[name="robots"]')).toBeNull();
    const ld = document.getElementById("seo-jsonld");
    expect(ld?.getAttribute("type")).toBe("application/ld+json");
    expect(JSON.parse(ld!.textContent ?? "{}")["@type"]).toBe("Dataset");

    restore();
    expect(document.title).toBe("ISOKO GROUP");
    expect(meta('meta[name="description"]')).toBe("default description");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull();
    expect(document.getElementById("seo-jsonld")).toBeNull();
  });

  it("marks a page noindex when asked", () => {
    const restore = applySeo({ title: "Search", description: "x", noindex: true });
    expect(meta('meta[name="robots"]')).toBe("noindex, nofollow");
    restore();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});

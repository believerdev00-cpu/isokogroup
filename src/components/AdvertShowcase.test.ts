// The advertising section shows what is actually for sale.
//
// The homepage's only product component before this was FeaturedSection, which
// held eight invented listings at invented prices and was imported by nothing
// at all -- so the advertising band invited businesses to buy a placement
// beside no goods whatever. A rendering test would not catch the invented ones
// coming back: the component would still render, just from the wrong source.
// These read the component itself.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const source = read("src/components/AdvertShowcase.tsx");

describe("the advertising showcase", () => {
  it("reads its listings from the database", () => {
    expect(source).toMatch(/from\(["']products["']\)/);
  });

  it("imports no product artwork, which is where the invented ones came from", () => {
    expect(source).not.toMatch(/@\/assets\/products\//);
  });

  it("shows only a listing that can be bought and photographed", () => {
    // Sending a visitor to the marketplace for something that is not there is
    // the fault this section exists to avoid.
    expect(source).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/);
    expect(source).toContain("isProductInStock");
    expect(source).toMatch(/productImages\([^)]*\)\.length > 0/);
  });

  it("maps a stored category rather than printing it raw", () => {
    // the rule the marketplace, the seller's list and the admin desk follow
    expect(source).toContain("displayCategory");
  });

  it("stops rotating for a visitor who asked for less motion", () => {
    expect(source).toContain("isLiteMotion");
    expect(source).toMatch(/if \(lite \|\| held/);
  });

  it("holds the rotation while the stage is being read", () => {
    for (const held of ["onMouseEnter", "onFocusCapture", "onTouchStart"]) {
      expect(source).toContain(held);
    }
  });

  it("draws nothing rather than an empty stage", () => {
    expect(source).toMatch(/products\.length === 0\) return null/);
  });
});

describe("where the showcase is mounted", () => {
  const strip = read("src/components/AdvertiseStrip.tsx");

  it("sits in the advertising section", () => {
    expect(strip).toContain("<AdvertShowcase />");
  });

  it("leaves that section's own invitation and form in place", () => {
    // The point of the band is the enquiry it opens; a showcase that replaced
    // it would cost the section its purpose.
    expect(strip).toContain("<AdvertiseDialog");
    expect(strip).toContain("Advertise Here");
  });
});

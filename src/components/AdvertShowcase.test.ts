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

// A seller presses "Advertise Here", picks some of their own products, and
// agrees a price. Those listings are then what the band carries. The rule
// worth a test is the one that stops it being free: nothing a seller does on
// the form alone can put them on the stage.
describe("what the band actually carries", () => {
  const source = read("src/components/AdvertShowcase.tsx");

  it("asks the database what is on air rather than deciding here", () => {
    // advert_live_products() is where "accepted agreement, inside its run"
    // lives. A filter written in the browser could be edited by anybody.
    expect(source).toContain("advert_live_products");
  });

  it("does not try to work out itself whether an advert is paid for", () => {
    // It must not read the agreements or their dates: a date comparison in
    // the browser is one anybody can edit, and the whole gate would be the
    // honour system. Identifiers only -- the file's comments are free to
    // explain what the database checks.
    for (const leak of ["advert_agreements", "starts_on", "ends_on", "status = 'accepted'"]) {
      expect(source).not.toContain(leak);
    }
  });

  it("gives paid placements the stage and keeps the catalogue as a fallback", () => {
    expect(source).toMatch(/paid\.data\?\.length \?\? 0\) > 0 \? paid\.data!/);
    expect(source).toContain("useCatalogue");
  });

  it("still shows only a listing somebody could actually buy", () => {
    // Both sources go through the same filter: a placeholder square is not a
    // product shot, and the paid path is filtered in the database for stock.
    expect(source).toMatch(/productImages\(p\)\.length > 0/);
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

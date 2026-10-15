// The advertising form refuses what the database would refuse, so somebody
// filling it in is told what is wrong before they wait for a round trip. The
// database still checks everything itself -- these only decide what the person
// sees first.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uploadLimitMb } from "@/lib/uploadLimits";
import { RWF, type Currency } from "@/lib/money";
import {
  ARTWORK_TYPES, DURATIONS, MAX_ARTWORK_BYTES, PLACEMENTS,
  advertProblem, advertMailto, artworkProblem, dialDigits, statusTone, telHref, whatsappHref,
  STATUS_LABEL, STATUS_TONE, type AdvertInput,
} from "./api";

const USD: Currency = {
  code: "USD", name: "US Dollar", symbol: "$",
  minor_units: 2, rounding_step: "0.01", is_active: true, sort: 1,
};

const complete: AdvertInput = {
  full_name: "Jane Advertiser",
  company: "Kigali Coffee Ltd",
  email: "jane@example.com",
  phone: "+250780000000",
  industry: "Food and beverage",
  what_to_advertise: "Our new roastery",
  placement: "homepage",
  duration: "3 months",
  country: "RW",
  budget_amount: "450000",
  budget_currency: "RWF",
  message: "",
};

const file = (type: string, mb: number, name = "art") =>
  ({ name, type, size: Math.round(mb * 1024 * 1024) }) as File;

describe("what the advertising form accepts", () => {
  it("accepts a complete enquiry", () => {
    expect(advertProblem(complete, RWF)).toBeNull();
  });

  it("names the field that is missing, one at a time", () => {
    const required: [keyof AdvertInput, RegExp][] = [
      ["full_name", /your name/i],
      ["company", /company or business/i],
      ["email", /email/i],
      ["phone", /phone or WhatsApp/i],
      ["industry", /type of business/i],
      ["what_to_advertise", /what you would like to advertise/i],
      ["placement", /where/i],
      ["duration", /how long/i],
    ];
    for (const [key, says] of required) {
      expect(advertProblem({ ...complete, [key]: "" }, RWF)).toMatch(says);
      expect(advertProblem({ ...complete, [key]: "   " }, RWF)).toMatch(says);
    }
  });

  it("checks the email looks like one", () => {
    for (const bad of ["jane", "jane@", "@example.com", "jane example.com"]) {
      expect(advertProblem({ ...complete, email: bad }, RWF)).toMatch(/email/i);
    }
  });

  it("takes the budget only as the chosen currency can be paid in", () => {
    expect(advertProblem({ ...complete, budget_amount: "" }, RWF)).toBeNull();       // optional
    expect(advertProblem({ ...complete, budget_amount: undefined }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, budget_amount: "450000" }, RWF)).toBeNull();
    // A franc has no smaller unit, so cents in a franc budget are a typo.
    for (const bad of ["450,000", "450000.50", "lots", "-5"]) {
      const problem = advertProblem({ ...complete, budget_amount: bad }, RWF);
      expect(problem).toMatch(/whole number/i);
      // and says why, so somebody who typed cents knows what to do instead
      expect(problem).toMatch(/Rwandan Franc has no smaller unit/);
    }
    // The same figure is a perfectly good dollar amount.
    expect(advertProblem({ ...complete, budget_amount: "1250.45", budget_currency: "USD" }, USD)).toBeNull();
    expect(advertProblem({ ...complete, budget_amount: "1250.455", budget_currency: "USD" }, USD))
      .toMatch(/number, with no commas/i);
  });

  it("refuses an amount with no currency beside it", () => {
    // An amount alone is not money: the office cannot quote against it, and
    // the database will not store one.
    expect(advertProblem({ ...complete, budget_amount: "450000", budget_currency: "" }, RWF))
      .toMatch(/currency your budget is in/i);
  });

  it("asks for a country only as a code, and does not insist on one", () => {
    // Somebody whose country is not on our list still has a currency to
    // choose; what is refused is a half-written code.
    expect(advertProblem({ ...complete, country: "" }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, country: "KE" }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, country: "Rwanda" }, RWF)).toMatch(/country you are advertising from/i);
  });

  it("takes an exact number of days as a whole number", () => {
    expect(advertProblem({ ...complete, preferred_days: "45" }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, preferred_days: "" }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, preferred_days: "6 weeks" }, RWF)).toMatch(/whole number/i);
  });

  it("offers placements and durations the form can actually submit", () => {
    for (const p of PLACEMENTS) expect(advertProblem({ ...complete, placement: p.key }, RWF)).toBeNull();
    for (const d of DURATIONS) expect(advertProblem({ ...complete, duration: d }, RWF)).toBeNull();
  });
});

describe("what the artwork upload accepts", () => {
  it("takes the types the bucket allows", () => {
    for (const type of Object.keys(ARTWORK_TYPES)) {
      expect(artworkProblem(file(type, 1))).toBeNull();
    }
  });

  it("refuses anything that is not artwork, a video or a sound", () => {
    for (const type of ["application/zip", "text/html", "application/x-msdownload", ""]) {
      expect(artworkProblem(file(type, 1))).toMatch(/JPG, PNG, WEBP, AVIF or PDF/);
    }
  });

  it("takes a video or a sound, because an advert is often one", () => {
    for (const type of ["video/mp4", "video/webm", "audio/mpeg", "audio/wav"]) {
      expect(artworkProblem(file(type, 1))).toBeNull();
    }
  });

  it("accepts any size up to the bucket's limit, with no minimum", () => {
    const limit = MAX_ARTWORK_BYTES / 1024 / 1024;
    for (const mb of [0.001, 0.5, 5, 9.9, limit]) {
      expect(artworkProblem(file("image/png", mb))).toBeNull();
    }
    // one number, in uploadLimits, rather than a figure repeated here
    expect(MAX_ARTWORK_BYTES).toBe(uploadLimitMb("adverts") * 1024 * 1024);
  });

  it("says how big a file is when it is too big", () => {
    const over = MAX_ARTWORK_BYTES / 1024 / 1024 + 2;
    const problem = artworkProblem(file("image/png", over, "banner.png"));
    expect(problem).toContain("banner.png");
    expect(problem).toContain(`${over} MB`);
    expect(problem).toContain(`${uploadLimitMb("adverts")} MB`);
  });
});

// An advertiser can see what became of their own enquiry. The row policy for
// it ("Advertisers read their own requests") shipped with the table and then
// went unused by any screen, so a reference number was the last the sender
// ever heard of it unless they wrote in.
describe("what an advertiser is shown of their own requests", () => {
  const source = readFileSync(join(process.cwd(), "src/features/adverts/api.ts"), "utf8");
  const dashboard = readFileSync(join(process.cwd(), "src/features/adverts/MyAdvertRequests.tsx"), "utf8");

  it("asks only for the sender's own rows", () => {
    // Not redundant with the policy: "Admins manage advert requests" grants an
    // admin every row, so without this an administrator's own dashboard would
    // list the whole office's leads under the heading "your requests".
    const mine = source.slice(source.indexOf("useMyAdvertRequests"));
    expect(mine).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*userId\s*\)/);
  });

  it("does not run before it knows who is asking", () => {
    const mine = source.slice(source.indexOf("useMyAdvertRequests"));
    expect(mine).toMatch(/enabled:\s*Boolean\(userId\)/);
  });

  it("keeps the office's notes out of the advertiser's view", () => {
    const mine = source.slice(source.indexOf("useMyAdvertRequests"), source.indexOf("useMyAdvertRequests") + 900);
    expect(mine).not.toContain("staff_notes");
    expect(dashboard).not.toContain("staff_notes");
  });

  it("names every status the table may hold, so none shows as a raw word", () => {
    const allowed = ["new", "contacted", "quoted", "accepted", "declined", "closed"];
    for (const status of allowed) expect(STATUS_LABEL[status]).toBeTruthy();
  });
});

// The desk is a call-back list, so reaching the person has to be one click.
// A number is written both ways in Rwanda and WhatsApp takes only one of them.
describe("reaching an advertiser", () => {
  it("reads a local Rwandan number as the international one", () => {
    expect(dialDigits("0788 481 648")).toBe("250788481648");
    expect(dialDigits("0788481648")).toBe("250788481648");
  });

  it("leaves a number that already carries its country alone", () => {
    expect(dialDigits("+250788481648")).toBe("250788481648");
    expect(dialDigits("250 788 481 648")).toBe("250788481648");
  });

  it("does not invent a country for a foreign advertiser", () => {
    // Guessing Rwanda for a number that is plainly not one would dial a
    // stranger; passing it through at least fails visibly.
    expect(dialDigits("+44 20 7946 0958")).toBe("442079460958");
  });

  it("builds a dialable and a WhatsApp link from the same number", () => {
    expect(telHref("0788 481 648")).toBe("tel:+250788481648");
    expect(whatsappHref("0788 481 648")).toBe("https://wa.me/250788481648");
  });

  it("puts the reference in the subject so a reply can be filed", () => {
    const href = advertMailto({ email: "jane@example.com", reference: "ISO-ADV-00007" });
    expect(href.startsWith("mailto:jane@example.com?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("[ISO-ADV-00007]");
  });

  it("gives every status a colour, so none renders unstyled", () => {
    for (const status of Object.keys(STATUS_LABEL)) {
      expect(statusTone(status)).toBeTruthy();
    }
    expect(statusTone("something new")).toBe(STATUS_TONE.new);
  });
});

describe("the advertising desk", () => {
  const desk = readFileSync(join(process.cwd(), "src/components/admin/AdvertRequests.tsx"), "utf8");

  it("makes the address and the number links rather than text to copy out", () => {
    expect(desk).toContain("advertMailto");
    expect(desk).toContain("telHref");
    expect(desk).toContain("whatsappHref");
  });

  it("says how long somebody has been waiting, not only the date", () => {
    expect(desk).toMatch(/waited\(r\.created_at\)/);
  });

  it("can mark a request contacted without opening anything", () => {
    expect(desk).toContain("markContacted");
    expect(desk).toMatch(/setAdvertStatus\(row\.request\.id, "contacted"\)/);
  });

  it("warns before throwing away typed notes", () => {
    expect(desk).toContain("closeReview");
    expect(desk).toMatch(/notes !== editing\.request\.staff_notes/);
  });

  it("colours a status with the same map the advertiser's card uses", () => {
    expect(desk).toContain("statusTone");
  });

  it("never writes an amount without its currency beside it", () => {
    // Every amount on the desk goes through formatAmount(.., { code: true })
    // or a figure that already carries its code. A bare toLocaleString on an
    // amount is how a franc total ends up read as dollars.
    const quote = readFileSync(join(process.cwd(), "src/components/admin/AdvertQuoteDialog.tsx"), "utf8");
    for (const source of [desk, quote]) {
      expect(source).toContain("formatAmount");
      expect(source).not.toMatch(/budget_rwf/);
    }
  });

  it("refuses to compare a quote with a budget in another currency", () => {
    const quote = readFileSync(join(process.cwd(), "src/components/admin/AdvertQuoteDialog.tsx"), "utf8");
    // The screen says so before the database does, and blocks the button.
    expect(quote).toContain("currencyClash");
    expect(quote).toMatch(/blocked =.*currencyClash/s);
  });

  it("has no rate card to quote from, so the budget is the anchor", () => {
    const quote = readFileSync(join(process.cwd(), "src/components/admin/AdvertQuoteDialog.tsx"), "utf8");
    // Identifiers, not prose: the file's own comments explain that there is
    // no rate card, and a test that forbade the words would forbid saying so.
    for (const gone of ["useCardRate", "confirmRate", "advert_daily_rate"]) {
      expect(quote).not.toContain(gone);
    }
    expect(quote).toContain("their maximum");
  });
});

// A seller picks their own listings on the form; what that means is decided in
// the database, not here.
describe("choosing products to advertise", () => {
  const dialog = readFileSync(join(process.cwd(), "src/features/adverts/AdvertiseDialog.tsx"), "utf8");

  it("takes several listings, not one", () => {
    expect(dialog).toContain("product_ids");
    expect(dialog).toContain("toggleProduct");
  });

  it("stops at the number the database will accept, rather than being refused", () => {
    expect(dialog).toMatch(/MAX_PRODUCTS = 12/);
    expect(dialog).toMatch(/chosenIds\.length >= MAX_PRODUCTS/);
  });

  it("offers only the seller's own listings", () => {
    const source = readFileSync(join(process.cwd(), "src/features/adverts/api.ts"), "utf8");
    const mine = source.slice(source.indexOf("useMyProducts"));
    expect(mine).toMatch(/\.eq\(\s*["']seller_id["']\s*,\s*userId\s*\)/);
  });

  it("says the listings go on air only once a price is agreed", () => {
    // Nobody should submit the form expecting the homepage.
    expect(dialog).toMatch(/once .*price is agreed|once you and our team have agreed a price/);
  });

  it("sends the chosen ids and nothing when none were chosen", () => {
    expect(advertProblem({ ...complete, product_ids: ["a", "b"] }, RWF)).toBeNull();
    expect(advertProblem({ ...complete, product_ids: [] }, RWF)).toBeNull();
  });
});

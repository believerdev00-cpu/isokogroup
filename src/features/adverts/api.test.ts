// The advertising form refuses what the database would refuse, so somebody
// filling it in is told what is wrong before they wait for a round trip. The
// database still checks everything itself -- these only decide what the person
// sees first.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uploadLimitMb } from "@/lib/uploadLimits";
import {
  ARTWORK_TYPES, DURATIONS, MAX_ARTWORK_BYTES, PLACEMENTS,
  advertProblem, artworkProblem, STATUS_LABEL, type AdvertInput,
} from "./api";

const complete: AdvertInput = {
  full_name: "Jane Advertiser",
  company: "Kigali Coffee Ltd",
  email: "jane@example.com",
  phone: "+250780000000",
  industry: "Food and beverage",
  what_to_advertise: "Our new roastery",
  placement: "homepage",
  duration: "3 months",
  budget_rwf: "450000",
  message: "",
};

const file = (type: string, mb: number, name = "art") =>
  ({ name, type, size: Math.round(mb * 1024 * 1024) }) as File;

describe("what the advertising form accepts", () => {
  it("accepts a complete enquiry", () => {
    expect(advertProblem(complete)).toBeNull();
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
      expect(advertProblem({ ...complete, [key]: "" })).toMatch(says);
      expect(advertProblem({ ...complete, [key]: "   " })).toMatch(says);
    }
  });

  it("checks the email looks like one", () => {
    for (const bad of ["jane", "jane@", "@example.com", "jane example.com"]) {
      expect(advertProblem({ ...complete, email: bad })).toMatch(/email/i);
    }
  });

  it("takes the budget only as whole francs, and only when given", () => {
    expect(advertProblem({ ...complete, budget_rwf: "" })).toBeNull();       // optional
    expect(advertProblem({ ...complete, budget_rwf: undefined })).toBeNull();
    expect(advertProblem({ ...complete, budget_rwf: "450000" })).toBeNull();
    for (const bad of ["450,000", "450000.50", "lots", "-5"]) {
      expect(advertProblem({ ...complete, budget_rwf: bad })).toMatch(/whole number/i);
    }
  });

  it("offers placements and durations the form can actually submit", () => {
    for (const p of PLACEMENTS) expect(advertProblem({ ...complete, placement: p.key })).toBeNull();
    for (const d of DURATIONS) expect(advertProblem({ ...complete, duration: d })).toBeNull();
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

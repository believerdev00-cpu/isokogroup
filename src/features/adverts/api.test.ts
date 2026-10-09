// The advertising form refuses what the database would refuse, so somebody
// filling it in is told what is wrong before they wait for a round trip. The
// database still checks everything itself -- these only decide what the person
// sees first.
import { describe, expect, it } from "vitest";
import {
  ARTWORK_TYPES, DURATIONS, MAX_ARTWORK_BYTES, PLACEMENTS,
  advertProblem, artworkProblem, type AdvertInput,
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

  it("refuses anything else, including a video", () => {
    for (const type of ["video/mp4", "application/zip", "text/html", ""]) {
      expect(artworkProblem(file(type, 1))).toMatch(/JPG, PNG, WEBP, AVIF or PDF/);
    }
  });

  it("accepts any size up to ten megabytes, with no minimum", () => {
    for (const mb of [0.001, 0.5, 5, 9.9, 10]) {
      expect(artworkProblem(file("image/png", mb))).toBeNull();
    }
    expect(MAX_ARTWORK_BYTES).toBe(10 * 1024 * 1024);
  });

  it("says how big a file is when it is too big", () => {
    const problem = artworkProblem(file("image/png", 12, "banner.png"));
    expect(problem).toContain("banner.png");
    expect(problem).toContain("12 MB");
    expect(problem).toContain("10 MB");
  });
});

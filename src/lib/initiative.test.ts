// The Global Initiative's focus areas are what the application form offers and
// what the database accepts, so these guard the list itself: the five areas, the
// exact wording ISOKO approved, and the rule that only Unemployment Reduction
// has a third level. The lifecycle is checked the same way — it is the website's
// copy of a rule the database also enforces, and the two must agree.
import { describe, expect, it } from "vitest";
import {
  APPLICANT_STATUS_LABEL, DONATIONS_OPEN, DONATION_GENERAL, FOCUS_AREAS, MIN_DONATION_RWF,
  PUBLISHABLE_STATUSES, donationTarget, donationTargetValue,
  SUGGESTED_DONATIONS_RWF, STATUS_TRANSITIONS, classificationLabel, donationAmountProblem,
  donationProblem, donationReferenceProblem, isValidClassification, rwf, type ProjectStatus,
} from "./initiative";

const APPROVED: Record<string, Record<string, string[]>> = {
  Entrepreneurship: {
    Logistics: [], Packaging: [], "Travel Agency": [], Undergraduates: [],
    "Support for Innovative Business Ideas": [],
  },
  Arts: {
    Music: [], "Cinema (Film)": [], Architecture: [], Literature: [], Painting: [], "Other Related Arts": [],
  },
  Agriculture: { Agroforestry: [], "Regenerative Agriculture": [], "Conservation Agriculture": [] },
  "Unemployment Reduction": {
    "Technical Up-skilling": ["Bootcamps", "Vocational Trades", "Carpentry", "Plumbing", "Coding", "Digital Literacy"],
    "Soft Skills Development": ["Workplace Communication", "Time Management", "Professional Adaptability"],
    Certifications: ["Professional Certification Exam Fees", "Recognized Professional Credentials"],
  },
  Research: {
    Economy: [], Education: [], Population: [], Agriculture: [], Tourism: [], Business: [],
    "Housing & Property": [], Health: [], Technology: [], "Logistics & Trade": [],
  },
};

describe("Global Initiative focus areas", () => {
  it("are exactly the five ISOKO approved, with the approved wording", () => {
    const actual = Object.fromEntries(
      FOCUS_AREAS.map((a) => [
        a.label,
        Object.fromEntries(a.subcategories.map((s) => [s.label, (s.items ?? []).map((i) => i.label)])),
      ]),
    );
    expect(actual).toEqual(APPROVED);
  });

  it("give only Unemployment Reduction a third level", () => {
    for (const area of FOCUS_AREAS) {
      const hasItems = area.subcategories.some((s) => s.items && s.items.length > 0);
      expect(hasItems, area.label).toBe(area.key === "unemployment_reduction");
    }
  });

  it("use stable keys, never display labels, and never repeat a key inside an area", () => {
    for (const area of FOCUS_AREAS) {
      expect(area.key).toMatch(/^[a-z][a-z0-9_]*$/);
      const keys = area.subcategories.map((s) => s.key);
      expect(new Set(keys).size, area.label).toBe(keys.length);
      for (const sub of area.subcategories) {
        expect(sub.key).toMatch(/^[a-z][a-z0-9_]*$/);
        for (const item of sub.items ?? []) expect(item.key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });
});

describe("classification", () => {
  it("accepts a complete three-level path and a two-level one", () => {
    expect(isValidClassification("unemployment_reduction", "technical_upskilling", "coding")).toBe(true);
    expect(isValidClassification("arts", "music", null)).toBe(true);
  });

  it("refuses every wrong shape", () => {
    // unknown area
    expect(isValidClassification("space_travel", "music", null)).toBe(false);
    // a subcategory from a different area
    expect(isValidClassification("arts", "agroforestry", null)).toBe(false);
    // three-level subcategory with no item
    expect(isValidClassification("unemployment_reduction", "technical_upskilling", null)).toBe(false);
    // an item that belongs to a different subcategory
    expect(isValidClassification("unemployment_reduction", "certifications", "plumbing")).toBe(false);
    // a two-level subcategory may not carry an item
    expect(isValidClassification("arts", "music", "coding")).toBe(false);
  });

  it("reads a stored row back as the words a person approved", () => {
    expect(classificationLabel({ focus_area: "unemployment_reduction", subcategory: "technical_upskilling", item: "coding" }))
      .toBe("Unemployment Reduction → Technical Up-skilling → Coding");
    expect(classificationLabel({ focus_area: "arts", subcategory: "cinema_film", item: null }))
      .toBe("Arts → Cinema (Film)");
  });
});

describe("project lifecycle", () => {
  it("only ever moves forward, and ends at rejected or completed", () => {
    expect(STATUS_TRANSITIONS.submitted).toEqual(["approved", "rejected"]);
    expect(STATUS_TRANSITIONS.approved).toEqual(["seeking_support"]);
    expect(STATUS_TRANSITIONS.seeking_support).toEqual(["funded"]);
    expect(STATUS_TRANSITIONS.funded).toEqual(["in_progress"]);
    expect(STATUS_TRANSITIONS.in_progress).toEqual(["completed"]);
    expect(STATUS_TRANSITIONS.rejected).toEqual([]);
    expect(STATUS_TRANSITIONS.completed).toEqual([]);
  });

  it("never offers a move back to an earlier stage", () => {
    const order: ProjectStatus[] = ["submitted", "approved", "seeking_support", "funded", "in_progress", "completed"];
    for (const [i, from] of order.entries()) {
      for (const to of STATUS_TRANSITIONS[from]) {
        if (to === "rejected") continue;
        expect(order.indexOf(to), `${from} -> ${to}`).toBeGreaterThan(i);
      }
    }
  });

  it("shows the public only projects that have reached a public stage", () => {
    expect(PUBLISHABLE_STATUSES).toEqual(["seeking_support", "funded", "in_progress", "completed"]);
    expect(PUBLISHABLE_STATUSES).not.toContain("submitted");
    expect(PUBLISHABLE_STATUSES).not.toContain("approved");
    expect(PUBLISHABLE_STATUSES).not.toContain("rejected");
  });

  it("tells an applicant where they stand without internal wording", () => {
    expect(APPLICANT_STATUS_LABEL.submitted).toBe("Under review");
    expect(APPLICANT_STATUS_LABEL.rejected).toBe("Not approved");
  });
});

describe("money", () => {
  it("is Rwandan francs, and the campaign name is never an exchange rate", () => {
    expect(MIN_DONATION_RWF).toBe(1000);
    expect(rwf(1000)).toBe("1,000 RWF");
    expect(rwf(null)).toBe("0 RWF");
    // Every suggested amount is a round figure in francs at or above the
    // minimum. None of them is derived from a rate against another currency.
    expect(SUGGESTED_DONATIONS_RWF.every((v) => Number.isInteger(v) && v >= MIN_DONATION_RWF)).toBe(true);
  });

  it("is being collected", () => {
    expect(DONATIONS_OPEN).toBe(true);
  });

  /**
   * The database puts the same minimum and the same reference length on a
   * donation. These are the website half of that pair, so a contribution the
   * database would refuse is refused before anybody is asked to pay.
   */
  it("refuses the amounts the database refuses", () => {
    expect(donationAmountProblem(999)).toMatch(/smallest contribution/);
    expect(donationAmountProblem(0)).toMatch(/smallest contribution/);
    expect(donationAmountProblem(-5000)).toMatch(/smallest contribution/);
    expect(donationAmountProblem(1000.5)).toMatch(/whole Rwandan francs/);
    expect(donationAmountProblem(Number.NaN)).toMatch(/whole Rwandan francs/);
    expect(donationAmountProblem(1000)).toBeNull();
    expect(donationAmountProblem(25000)).toBeNull();
  });

  it("refuses the references the database refuses", () => {
    expect(donationReferenceProblem("abc")).toMatch(/transaction reference/);
    expect(donationReferenceProblem("")).toMatch(/transaction reference/);
    expect(donationReferenceProblem("    ")).toMatch(/transaction reference/);
    expect(donationReferenceProblem("x".repeat(121))).toMatch(/too long/);
    expect(donationReferenceProblem("TX12345")).toBeNull();
    expect(donationReferenceProblem("  TX12345  ")).toBeNull();
  });

  it("reports the amount before the reference, so the first step is fixed first", () => {
    expect(donationProblem(999, "ab")).toMatch(/smallest contribution/);
    expect(donationProblem(5000, "ab")).toMatch(/transaction reference/);
    expect(donationProblem(5000, "TX12345")).toBeNull();
  });
});

// A donation can name a project, or one of the five areas, or nothing in
// particular. They are one control in the form but different columns in the
// database, and getting the split wrong would file money under the wrong cause.
describe("where a donor said their contribution should go", () => {
  it("sends nothing in particular for the general choice", () => {
    expect(donationTarget(DONATION_GENERAL)).toEqual({ project_id: null, focus_area: null });
  });

  it("sends an area, and no project, when an area is chosen", () => {
    for (const area of FOCUS_AREAS) {
      expect(donationTarget(donationTargetValue(area.key)))
        .toEqual({ project_id: null, focus_area: area.key });
    }
  });

  it("sends a project, and no area, when a project is chosen", () => {
    const id = "6f1d0b7a-1111-4c2a-9a3e-2b0f5c7d8e90";
    expect(donationTarget(id)).toEqual({ project_id: id, focus_area: null });
  });

  it("never sends both, whatever is chosen", () => {
    const choices = [DONATION_GENERAL, ...FOCUS_AREAS.map((a) => donationTargetValue(a.key)), "some-project-id"];
    for (const c of choices) {
      const t = donationTarget(c);
      expect(t.project_id === null || t.focus_area === null).toBe(true);
    }
  });

  it("covers all five areas, matching what the database accepts", () => {
    expect(FOCUS_AREAS.map((a) => a.key).sort()).toEqual(
      ["agriculture", "arts", "entrepreneurship", "research", "unemployment_reduction"],
    );
  });
});

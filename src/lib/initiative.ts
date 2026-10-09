// ISOKO Groups Global Initiative — "$1 One Project".
//
// The focus areas below draw every menu and label on the site. The database
// holds the same list in initiative_valid_classification() and is what actually
// decides what may be stored, so the two must be changed together.
//
// "$1" is the campaign's name. Money is recorded in whole Rwandan francs and
// nothing here converts between currencies.

export type FocusItem = { key: string; label: string };
export type FocusSubcategory = { key: string; label: string; items?: FocusItem[] };
export type FocusArea = { key: string; label: string; subcategories: FocusSubcategory[] };

/** Focus area -> subcategory -> item. Only Unemployment Reduction uses the third level. */
export const FOCUS_AREAS: FocusArea[] = [
  {
    key: "entrepreneurship",
    label: "Entrepreneurship",
    subcategories: [
      { key: "logistics", label: "Logistics" },
      { key: "packaging", label: "Packaging" },
      { key: "travel_agency", label: "Travel Agency" },
      { key: "undergraduates", label: "Undergraduates" },
      { key: "innovative_business_ideas", label: "Support for Innovative Business Ideas" },
    ],
  },
  {
    key: "arts",
    label: "Arts",
    subcategories: [
      { key: "music", label: "Music" },
      { key: "cinema_film", label: "Cinema (Film)" },
      { key: "architecture", label: "Architecture" },
      { key: "literature", label: "Literature" },
      { key: "painting", label: "Painting" },
      { key: "other_related_arts", label: "Other Related Arts" },
    ],
  },
  {
    key: "agriculture",
    label: "Agriculture",
    subcategories: [
      { key: "agroforestry", label: "Agroforestry" },
      { key: "regenerative_agriculture", label: "Regenerative Agriculture" },
      { key: "conservation_agriculture", label: "Conservation Agriculture" },
    ],
  },
  {
    key: "unemployment_reduction",
    label: "Unemployment Reduction",
    subcategories: [
      {
        key: "technical_upskilling",
        label: "Technical Up-skilling",
        items: [
          { key: "bootcamps", label: "Bootcamps" },
          { key: "vocational_trades", label: "Vocational Trades" },
          { key: "carpentry", label: "Carpentry" },
          { key: "plumbing", label: "Plumbing" },
          { key: "coding", label: "Coding" },
          { key: "digital_literacy", label: "Digital Literacy" },
        ],
      },
      {
        key: "soft_skills_development",
        label: "Soft Skills Development",
        items: [
          { key: "workplace_communication", label: "Workplace Communication" },
          { key: "time_management", label: "Time Management" },
          { key: "professional_adaptability", label: "Professional Adaptability" },
        ],
      },
      {
        key: "certifications",
        label: "Certifications",
        items: [
          { key: "certification_exam_fees", label: "Professional Certification Exam Fees" },
          { key: "recognized_credentials", label: "Recognized Professional Credentials" },
        ],
      },
    ],
  },
  {
    key: "research",
    label: "Research",
    subcategories: [
      { key: "economy", label: "Economy" },
      { key: "education", label: "Education" },
      { key: "population", label: "Population" },
      { key: "agriculture", label: "Agriculture" },
      { key: "tourism", label: "Tourism" },
      { key: "business", label: "Business" },
      { key: "housing_property", label: "Housing & Property" },
      { key: "health", label: "Health" },
      { key: "technology", label: "Technology" },
      { key: "logistics_trade", label: "Logistics & Trade" },
    ],
  },
];

export type ProjectStatus =
  | "submitted" | "rejected" | "approved" | "seeking_support" | "funded" | "in_progress" | "completed";

/** Forward only. 'rejected' and 'completed' are final; the database enforces this too. */
export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  submitted: ["approved", "rejected"],
  rejected: [],
  approved: ["seeking_support"],
  seeking_support: ["funded"],
  funded: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
};

/** A project can only be shown to the public from one of these. */
export const PUBLISHABLE_STATUSES: ProjectStatus[] = ["seeking_support", "funded", "in_progress", "completed"];

/** Wording for the admin desk. */
export const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  rejected: "Rejected",
  approved: "Approved",
  seeking_support: "Seeking support",
  funded: "Funded",
  in_progress: "In progress",
  completed: "Completed",
};

/** Wording for the applicant, who should not read internal states as judgements. */
export const APPLICANT_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  submitted: "Under review",
  rejected: "Not approved",
};

/**
 * The smallest contribution, in whole RWF. The campaign is called "$1 One
 * Project"; this is a round figure in that spirit, not an exchange rate, and the
 * site never says the two amounts are equal. The database holds the same
 * minimum as a CHECK constraint, so the two must be changed together.
 */
export const MIN_DONATION_RWF = 1000;
export const SUGGESTED_DONATIONS_RWF = [1000, 5000, 10000, 25000];

/**
 * Donations are collected. Nothing on the site moves money: a donor pays ISOKO
 * GROUP with the Mobile Money code or bank account the site already publishes,
 * then submits the transaction reference, and an admin confirms it against the
 * statement before it counts towards anything.
 */
export const DONATIONS_OPEN = true;

/** How a donor paid. The database accepts these two and nothing else. */
export const PAYMENT_METHODS = [
  { key: "momo", label: "Mobile Money (MTN MoMo)" },
  { key: "bank", label: "Bank transfer" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"];

/** Wording for a donor reading their own contribution back. */
export const DONATION_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting to be confirmed",
  confirmed: "Confirmed",
  rejected: "Could not be matched",
};

/**
 * The same rules the database puts on a donation, so the form can say what is
 * wrong before anything is sent. Each returns the reason, or null when it is
 * fine. The two halves are separate because the form asks for the amount on one
 * step and the transaction reference on the next.
 */
export function donationAmountProblem(amount: number): string | null {
  if (!Number.isInteger(amount)) return "Enter the amount in whole Rwandan francs.";
  if (amount < MIN_DONATION_RWF) return `The smallest contribution is ${rwf(MIN_DONATION_RWF)}.`;
  return null;
}

export function donationReferenceProblem(reference: string): string | null {
  const given = reference.trim();
  if (given.length < 4) return "Enter the transaction reference from your payment confirmation.";
  if (given.length > 120) return "That transaction reference is too long.";
  return null;
}

export const donationProblem = (amount: number, reference: string): string | null =>
  donationAmountProblem(amount) ?? donationReferenceProblem(reference);

export const areaOf = (key: string) => FOCUS_AREAS.find((a) => a.key === key);
export const subcategoryOf = (area: FocusArea | undefined, key: string) =>
  area?.subcategories.find((s) => s.key === key);

/** "Unemployment Reduction → Technical Up-skilling → Coding" from the stored keys. */
export function classificationLabel(row: { focus_area: string; subcategory: string; item?: string | null }) {
  const area = areaOf(row.focus_area);
  const sub = subcategoryOf(area, row.subcategory);
  const item = sub?.items?.find((i) => i.key === row.item);
  return [area?.label, sub?.label, item?.label].filter(Boolean).join(" → ");
}

/** The same rule the database applies, so the form can refuse before saving. */
export function isValidClassification(areaKey: string, subKey: string, itemKey?: string | null) {
  const area = areaOf(areaKey);
  const sub = subcategoryOf(area, subKey);
  if (!area || !sub) return false;
  const items = sub.items ?? [];
  return items.length === 0 ? !itemKey : !!itemKey && items.some((i) => i.key === itemKey);
}

export const rwf = (amount: number | string | null | undefined) =>
  `${Number(amount ?? 0).toLocaleString()} RWF`;

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertStored } from "@/lib/uploadVerify";
import { db, rpc, unwrap } from "@/features/services/api";
import { MEDIA_ACCEPT } from "@/lib/mediaKind";
import { tooLargeMessage, uploadLimitMb } from "@/lib/uploadLimits";
import { parseMoney, type Currency } from "@/lib/money";

// Asking ISOKO GROUP to carry your advertising, and what happens after.
//
// A request is still a lead: nothing is published by sending one and nobody is
// charged. What follows it now lives here too -- the office's quote, the
// advertiser's acceptance, and the account that acceptance opens -- because
// the one thing that must never drift is which currency a figure is in.
//
// Submitting goes through advert_submit_request() rather than an insert, which
// is why the table has no insert policy: the function decides the status and
// the account, so a crafted request cannot arrive already accepted. Quoting,
// accepting and declining go through functions for the same reason, and
// because the rules that matter -- a total within the stated budget, a
// confirmed rate behind a converted price -- are enforced there and not here.

export const ARTWORK_BUCKET = "adverts";

/** What the artwork upload accepts, matching the bucket's own list. */
export const ARTWORK_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  // an advert is as often a clip or a radio-style spot as it is a still
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
export const ARTWORK_ACCEPT = `image/jpeg,image/png,image/webp,image/avif,application/pdf,${MEDIA_ACCEPT}`;
export const MAX_ARTWORK_BYTES = uploadLimitMb("adverts") * 1024 * 1024;

/** Where an advert could run. The wording is what the office uses. */
export const PLACEMENTS = [
  { key: "homepage", label: "Homepage" },
  { key: "products", label: "Marketplace and product pages" },
  { key: "banners", label: "Banners across the site" },
  { key: "entertainment", label: "Entertainment section" },
  { key: "training", label: "Training Center" },
  { key: "other", label: "Somewhere else / not sure yet" },
];

export const DURATIONS = ["1 week", "2 weeks", "1 month", "3 months", "6 months", "1 year", "Not sure yet"];

/**
 * Roughly how many days each of those is, so the office's quote starts from
 * the advertiser's own answer instead of being retyped.
 *
 * A month is 30 days here and nobody should pretend otherwise: it is the
 * starting figure in a form the office then edits, not a calendar.
 */
export const DURATION_DAYS: Record<string, number> = {
  "1 week": 7,
  "2 weeks": 14,
  "1 month": 30,
  "3 months": 90,
  "6 months": 180,
  "1 year": 365,
};

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  accepted: "Accepted",
  declined: "Declined",
  closed: "Closed",
};

export type AdvertRequest = {
  id: string;
  reference: string;
  user_id: string | null;
  full_name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  what_to_advertise: string;
  placement: string;
  duration: string;
  /**
   * Historical. Every budget before the currencies went in was francs by
   * assumption; those rows were copied into budget_amount/budget_currency and
   * this is left exactly as it was written. Read budget_amount instead.
   */
  budget_rwf: number | null;
  budget_amount: string | null;
  budget_currency: string | null;
  country: string | null;
  preferred_start: string | null;
  preferred_days: number | null;
  message: string | null;
  artwork_path: string | null;
  status: string;
  staff_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type AdvertInput = {
  full_name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  what_to_advertise: string;
  placement: string;
  duration: string;
  /** ISO 3166-1 alpha-2. Asked for, never inferred from a language. */
  country?: string;
  /** A decimal string. Never a number: see src/lib/money.ts. */
  budget_amount?: string;
  budget_currency?: string;
  /**
   * The seller's own listings they want carried in the advertising band.
   * Several, because a seller advertising a line advertises a line, and the
   * database refuses any product that is not theirs.
   */
  product_ids?: string[];
  preferred_start?: string;
  preferred_days?: string;
  message?: string;
  artwork_path?: string | null;
};

/** One quote. A revised quote is a new revision, never an edit of this one. */
export type AdvertAgreement = {
  id: string;
  request_id: string;
  revision: number;
  currency: string;
  daily_rate: string;
  days: number;
  total: string;
  starts_on: string | null;
  ends_on: string | null;
  payment_terms: string;
  note: string;
  fx_rate: string | null;
  fx_base: string | null;
  fx_source: string | null;
  fx_read_at: string | null;
  rate_confirmed_by: string | null;
  rate_confirmed_at: string | null;
  status: "proposed" | "accepted" | "declined" | "withdrawn" | "superseded";
  proposed_by: string | null;
  proposed_at: string;
  responded_at: string | null;
  decline_reason: string;
};

export type AdvertBudgetRevision = {
  amount: string;
  currency: string;
  by_staff: boolean;
  note: string;
  created_at: string;
};

export type FinanceTotals = {
  charged: string; credits: string; paid: string; refunded: string; pending: string; balance: string;
};

/** A request with everything the desk needs beside it, from advert_desk(). */
export type AdvertDeskRow = {
  request: AdvertRequest;
  /** Their own listings, with the shelf price — which is not the advert fee. */
  products: { id: string; name: string; price: number; currency: string; status: string; stock: number }[];
  budgets: AdvertBudgetRevision[];
  agreements: AdvertAgreement[];
  finance: { currency: string; totals: FinanceTotals } | null;
};

/**
 * The problem with a field, in the words the person needs, or null.
 *
 * The currency is passed in rather than looked up here so that this stays a
 * pure function the tests can drive, and so that the decimals a budget may
 * have are the ones the chosen currency actually has: 1,250.45 is a dollar
 * amount and a typo in francs.
 */
export function advertProblem(input: AdvertInput, currency?: Currency | null): string | null {
  const required: [keyof AdvertInput, string][] = [
    ["full_name", "your name"],
    ["company", "your company or business name"],
    ["email", "your email address"],
    ["phone", "a phone or WhatsApp number"],
    ["industry", "your type of business"],
    ["what_to_advertise", "what you would like to advertise"],
    ["placement", "where you would like it to appear"],
    ["duration", "how long you would like it to run"],
  ];
  for (const [key, label] of required) {
    if (!String(input[key] ?? "").trim()) return `Please give ${label}.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Please check the email address.";

  // A country is a suggestion's evidence, not a requirement: an advertiser
  // whose country is not on our list still has a currency to choose, and the
  // form asks for that instead. What is not allowed is a half-written code.
  const country = String(input.country ?? "").trim();
  if (country && !/^[A-Za-z]{2}$/.test(country)) return "Please choose the country you are advertising from.";

  const budget = String(input.budget_amount ?? "").trim();
  if (budget) {
    // An amount with no currency beside it is not money, and the office
    // cannot quote against it.
    if (!String(input.budget_currency ?? "").trim()) return "Please choose the currency your budget is in.";
    if (parseMoney(budget, currency?.minor_units ?? 2) === null) {
      // Saying why beats saying no: somebody typing 450000.50 in francs has
      // not made a rounding mistake, they have used a unit that does not
      // exist, and the message that explains that is the one they can act on.
      return currency && currency.minor_units === 0
        ? `Give the budget as a whole number, with no commas — the ${currency.name} has no smaller unit.`
        : "Give the budget as a number, with no commas.";
    }
  }
  const days = String(input.preferred_days ?? "").trim();
  if (days && !/^[0-9]{1,4}$/.test(days)) return "Give the number of days as a whole number.";
  return null;
}

export function artworkProblem(file: File): string | null {
  if (!ARTWORK_TYPES[file.type]) return "Choose a JPG, PNG, WEBP, AVIF or PDF file, or an MP4, WebM, MKV, MP3, M4A, AAC or WAV.";
  // the figure came from a number written twice; it is the bucket's now
  if (file.size > MAX_ARTWORK_BYTES) return tooLargeMessage(file, uploadLimitMb("adverts"));
  return null;
}

/**
 * Puts the artwork in the sender own folder, which is the only place storage
 * will take it and the only shape the submit function will accept.
 */
export async function uploadArtwork(userId: string, file: File) {
  const problem = artworkProblem(file);
  if (problem) throw new Error(problem);
  const path = `${userId}/${crypto.randomUUID()}.${ARTWORK_TYPES[file.type]}`;
  const { error } = await supabase.storage.from(ARTWORK_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  // The submit function is given a path and cannot tell a whole file from a
  // truncated one, so that is settled before it is handed over.
  await assertStored(ARTWORK_BUCKET, path, file.size);
  return path;
}

export async function submitAdvertRequest(input: AdvertInput, currency?: Currency | null): Promise<{ reference: string }> {
  const problem = advertProblem(input, currency);
  if (problem) throw new Error(problem);
  return rpc<{ reference: string }>("advert_submit_request", {
    p: {
      ...input,
      full_name: input.full_name.trim(),
      company: input.company.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      industry: input.industry.trim(),
      what_to_advertise: input.what_to_advertise.trim(),
      message: (input.message ?? "").trim() || undefined,
      country: (input.country ?? "").trim().toUpperCase() || undefined,
      // Strings all the way to Postgres: JSON has only doubles, and a budget
      // is not a thing to round-trip through one.
      budget_amount: String(input.budget_amount ?? "").trim() || undefined,
      budget_currency: (input.budget_currency ?? "").trim().toUpperCase() || undefined,
      product_ids: input.product_ids?.length ? input.product_ids : undefined,
      preferred_start: (input.preferred_start ?? "").trim() || undefined,
      preferred_days: String(input.preferred_days ?? "").trim() || undefined,
    },
  });
}

/** Every request with its quotes and its account, for the office. */
export function useAdvertDesk() {
  return useQuery({
    queryKey: ["adverts", "desk"],
    queryFn: async () => rpc<AdvertDeskRow[]>("advert_desk"),
  });
}

export async function setAdvertStatus(id: string, status: string, staffNotes?: string) {
  const patch: Record<string, unknown> = { status };
  if (staffNotes !== undefined) patch.staff_notes = staffNotes;
  unwrap(await db.from("advert_requests").update(patch).eq("id", id));
}

/** The office's quote. Every figure is re-checked in the database. */
export async function proposeAgreement(input: {
  request_id: string;
  currency: string;
  daily_rate: string;
  days: string;
  total?: string;
  starts_on?: string;
  payment_terms?: string;
  note?: string;
  confirm_rate?: boolean;
}) {
  return rpc<AdvertAgreement>("advert_propose_agreement", {
    p: {
      ...input,
      currency: input.currency.toUpperCase(),
      total: input.total?.trim() || undefined,
      starts_on: input.starts_on?.trim() || undefined,
      confirm_rate: input.confirm_rate ? "true" : undefined,
    },
  });
}

export const acceptAdvertAgreement = (id: string) =>
  rpc<AdvertAgreement>("advert_accept_agreement", { p_agreement_id: id });

export const declineAdvertAgreement = (id: string, reason: string) =>
  rpc<AdvertAgreement>("advert_decline_agreement", { p_agreement_id: id, p_reason: reason });

/** A new maximum, said by the advertiser. Appended; the old one is kept. */
export const reviseAdvertBudget = (input: { request_id: string; amount: string; currency: string; note?: string }) =>
  rpc<{ amount: string; currency: string }>("advert_revise_budget", {
    p: { ...input, currency: input.currency.toUpperCase() },
  });

/** A short-lived link to a piece of artwork, for the office to look at. */
export async function artworkUrl(path: string) {
  const { data, error } = await supabase.storage.from(ARTWORK_BUCKET).createSignedUrl(path, 10 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** The part of a request its own sender is shown. */
export type MyAdvertRequest = Pick<
  AdvertRequest,
  "id" | "reference" | "company" | "what_to_advertise" | "placement" | "duration" | "status"
  | "created_at" | "budget_amount" | "budget_currency"
>;

/**
 * What this advertiser sent, for their own dashboard.
 *
 * The `user_id` filter is not redundant with the row policy. "Admins manage
 * advert requests" grants an admin every row, so without it an administrator
 * opening their own dashboard would be shown the whole office's leads under
 * the heading "your requests". The policy still does the real enforcing: it is
 * what stops anyone else's request being returned to an ordinary advertiser.
 *
 * Someone who asked while signed out has no account on the row and so has
 * nothing to show here -- they have their reference and a reply by email.
 */
export function useMyAdvertRequests(userId: string | undefined) {
  return useQuery({
    queryKey: ["adverts", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      return (unwrap(
        await db
          .from("advert_requests")
          .select("id, reference, company, what_to_advertise, placement, duration, status, created_at, budget_amount, budget_currency")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ) ?? []) as MyAdvertRequest[];
    },
  });
}

/**
 * The quotes on this advertiser's own requests.
 *
 * Read straight from the table: "Advertisers read their own agreements" is
 * what makes this safe, and it returns nothing at all for somebody else's
 * request rather than an error to handle.
 */
export function useMyAdvertAgreements(userId: string | undefined) {
  return useQuery({
    queryKey: ["adverts", "mine", "agreements", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      return (unwrap(
        await db.from("advert_agreements").select("*").order("revision", { ascending: false }),
      ) ?? []) as AdvertAgreement[];
    },
  });
}

/** What this advertiser owes and has paid on one request. */
export function useAdvertPaymentState(requestId: string | undefined) {
  return useQuery({
    queryKey: ["adverts", "payment", requestId],
    enabled: Boolean(requestId),
    queryFn: async () =>
      rpc<{ exists: boolean; currency?: string; totals?: FinanceTotals; payments?: unknown[] } | null>(
        "advert_payment_state", { p_request_id: requestId },
      ),
  });
}

/**
 * The listings currently sliding in the advertising band.
 *
 * Choosing products on the form does not put them here: the database returns
 * only those with an accepted agreement whose run covers today, which is what
 * stops the homepage being free to anybody with a seller account. The band
 * falls back to the catalogue when nothing is on air, so it is never empty.
 */
export type LiveAdvertProduct = {
  product_id: string;
  name: string;
  price: number | null;
  category: string;
  description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  stock: number;
  placement: string;
};

export function useLiveAdvertProducts() {
  return useQuery({
    queryKey: ["adverts", "on-air"],
    staleTime: 5 * 60_000,
    queryFn: async () => rpc<LiveAdvertProduct[]>("advert_live_products"),
  });
}

/** This seller's own listings, for "advertise some of my products". */
export function useMyProducts(userId: string | undefined) {
  return useQuery({
    queryKey: ["adverts", "my-products", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      return (unwrap(
        await db
          .from("products")
          .select("id, name, price, status")
          .eq("seller_id", userId)
          .order("created_at", { ascending: false }),
      ) ?? []) as { id: string; name: string; price: number; status: string }[];
    },
  });
}

/** Advertising revenue by the currency it was earned in, then consolidated. */
export type AdvertRevenue = {
  reporting_currency: string;
  generated_at: string;
  by_currency: {
    currency: string; accounts: number; charged: string; paid: string; refunded: string;
    fees: string; settled: string;
    converted_paid: string | null; rate: string | null; rate_source: string | null;
    rate_read_at: string | null; convertible: boolean;
  }[];
  consolidated_paid: string;
  not_converted: string[];
};

export function useAdvertRevenue(reportIn?: string) {
  return useQuery({
    queryKey: ["adverts", "revenue", reportIn ?? "default"],
    queryFn: async () => rpc<AdvertRevenue>("advert_revenue_report", { _in: reportIn ?? null }),
  });
}

/**
 * How a status reads at a glance.
 *
 * Shared by the office's desk and the advertiser's own card so the two cannot
 * drift into saying the same word in different colours.
 */
export const STATUS_TONE: Record<string, string> = {
  new: "bg-yellow-500/15 text-yellow-500",
  contacted: "bg-blue-500/15 text-blue-500",
  quoted: "bg-blue-500/15 text-blue-500",
  accepted: "bg-green-500/15 text-green-500",
  declined: "bg-destructive/15 text-destructive",
  closed: "bg-muted text-muted-foreground",
};
export const statusTone = (status: string) => STATUS_TONE[status] ?? STATUS_TONE.new;

/** The same, for a quote rather than a request. */
export const AGREEMENT_TONE: Record<string, string> = {
  proposed: "bg-blue-500/15 text-blue-500",
  accepted: "bg-green-500/15 text-green-500",
  declined: "bg-destructive/15 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  superseded: "bg-muted text-muted-foreground",
};
export const agreementTone = (status: string) => AGREEMENT_TONE[status] ?? AGREEMENT_TONE.proposed;

/**
 * The number as a dialer and as WhatsApp each want it.
 *
 * People write a Rwandan number both ways -- "0788 481 648" and
 * "+250788481648" -- and WhatsApp accepts only the international form with no
 * punctuation. A ten-digit number beginning 0 is read as Rwandan, which is
 * what the office is given; anything else is passed through as typed, because
 * guessing a country for a foreign advertiser would be worse than leaving it.
 */
export const dialDigits = (phone: string) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("0") ? `250${digits.slice(1)}` : digits;
};
export const telHref = (phone: string) => `tel:+${dialDigits(phone)}`;
export const whatsappHref = (phone: string) => `https://wa.me/${dialDigits(phone)}`;

/** An email to an advertiser, with the reference already in the subject. */
export const advertMailto = (r: Pick<AdvertRequest, "email" | "reference">) =>
  `mailto:${r.email}?subject=${encodeURIComponent(`Advertising with ISOKO GROUP [${r.reference}]`)}`;

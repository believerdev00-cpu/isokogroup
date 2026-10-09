import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db, rpc, unwrap } from "@/features/services/api";

// Asking ISOKO GROUP to carry your advertising. The request is a lead: nothing
// is published and nobody is charged by it, and a person reads every one.
//
// Submitting goes through advert_submit_request() rather than an insert, which
// is why the table has no insert policy: the function decides the status and
// the account, so a crafted request cannot arrive already accepted.

export const ARTWORK_BUCKET = "adverts";

/** What the artwork upload accepts, matching the bucket's own list. */
export const ARTWORK_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};
export const ARTWORK_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,application/pdf";
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

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
  budget_rwf: number | null;
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
  budget_rwf?: string;
  message?: string;
  artwork_path?: string | null;
};

/** The problem with a field, in the words the person needs, or null. */
export function advertProblem(input: AdvertInput): string | null {
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
  const budget = String(input.budget_rwf ?? "").trim();
  if (budget && !/^[0-9]{1,12}$/.test(budget)) return "Give the budget as a whole number of francs, with no commas.";
  return null;
}

export function artworkProblem(file: File): string | null {
  if (!ARTWORK_TYPES[file.type]) return "Choose a JPG, PNG, WEBP, AVIF or PDF file.";
  if (file.size > MAX_ARTWORK_BYTES) {
    return `${file.name} is ${Math.round(file.size / 1024 / 1024)} MB. The largest upload is 10 MB.`;
  }
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
  return path;
}

export async function submitAdvertRequest(input: AdvertInput): Promise<{ reference: string }> {
  const problem = advertProblem(input);
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
      budget_rwf: String(input.budget_rwf ?? "").trim() || undefined,
    },
  });
}

/** Every request, for the office. */
export function useAdvertRequests() {
  return useQuery({
    queryKey: ["adverts", "admin"],
    queryFn: async () => {
      return (unwrap(
        await db.from("advert_requests").select("*").order("created_at", { ascending: false }),
      ) ?? []) as AdvertRequest[];
    },
  });
}

export async function setAdvertStatus(id: string, status: string, staffNotes?: string) {
  const patch: Record<string, unknown> = { status };
  if (staffNotes !== undefined) patch.staff_notes = staffNotes;
  unwrap(await db.from("advert_requests").update(patch).eq("id", id));
}

/** A short-lived link to a piece of artwork, for the office to look at. */
export async function artworkUrl(path: string) {
  const { data, error } = await supabase.storage.from(ARTWORK_BUCKET).createSignedUrl(path, 10 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

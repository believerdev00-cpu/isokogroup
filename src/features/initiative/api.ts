// Reading and writing the Global Initiative. Everything goes through
// row-level security: the public view shows only published projects and only
// the columns a visitor may see, an applicant reads their own rows, a donor
// reads their own donations, and an admin reads the rest.
//
// No money moves through this file. A donor pays ISOKO GROUP directly, using
// the Mobile Money code or bank account the site already publishes, and then
// submits the transaction reference. That is a claim, not a payment: it is
// stored as 'pending' and an admin confirms it against the real statement
// before it counts towards anything.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db, unwrap } from "@/features/services/api";
import type { ProjectStatus } from "@/lib/initiative";

export const INITIATIVE = "/global-initiative";
export const INITIATIVE_NAME = "ISOKO Groups Global Initiative";
export const TAGLINE = "$1 — One Project";

const STALE = 5 * 60_000;

/** A project as the public view returns it: no applicant, no document, no reviewer. */
export type PublicProject = {
  id: string;
  title: string;
  description: string;
  focus_area: string;
  subcategory: string;
  item: string | null;
  location: string;
  status: ProjectStatus;
  completion_summary: string | null;
  completed_at: string | null;
  created_at: string;
};

/**
 * The applicant's own row: what they wrote, and where it has got to. Money
 * raised is not part of it — that is summed by the public view, and this comes
 * straight from the table, so claiming the field would describe a value neither
 * query can return.
 */
export type OwnProject = PublicProject & {
  /** What the applicant asked for. Never shown to the public. */
  amount_required: number;
  published: boolean;
  rejection_reason: string | null;
  updated_at: string;
};

/** Everything, for the admin desk. */
export type AdminProject = OwnProject & {
  user_id: string | null;
  document_path: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  verified_by: string | null;
};

/**
 * What an applicant may read back about their own application. Asking for "*"
 * would also return the account id of the admin who reviewed or verified it,
 * which is no part of telling an applicant where their project stands.
 */
export const OWN_COLUMNS =
  "id, title, description, focus_area, subcategory, item, location, amount_required, status, " +
  "published, rejection_reason, completion_summary, completed_at, created_at, updated_at";

/** Published projects at a given stage. Empty until ISOKO publishes one. */
export function usePublicProjects(status: ProjectStatus | ProjectStatus[]) {
  const statuses = Array.isArray(status) ? status : [status];
  return useQuery({
    queryKey: ["initiative", "public", statuses],
    staleTime: STALE,
    queryFn: async () =>
      unwrap(
        await db
          .from("initiative_public_projects")
          .select("*")
          .in("status", statuses)
          .order("created_at", { ascending: false }),
      ) as PublicProject[],
  });
}

/**
 * What the initiative has actually done, counted from the records themselves.
 * With no published projects and no confirmed donations these are all zero, and
 * the page says so rather than showing a number.
 */
export function useImpact() {
  return useQuery({
    queryKey: ["initiative", "impact"],
    staleTime: STALE,
    queryFn: async () => {
      const rows = (unwrap(
        await db.from("initiative_public_projects").select("status, focus_area"),
      ) ?? []) as Pick<PublicProject, "status" | "focus_area">[];
      const byArea: Record<string, number> = {};
      for (const r of rows) byArea[r.focus_area] = (byArea[r.focus_area] ?? 0) + 1;
      return {
        published: rows.length,
        completed: rows.filter((r) => r.status === "completed").length,
        funded: rows.filter((r) => ["funded", "in_progress", "completed"].includes(r.status)).length,
        seeking: rows.filter((r) => r.status === "seeking_support").length,

        byArea,
      };
    },
  });
}

/** The signed-in visitor's own applications. Row-level security scopes this. */
export function useMyApplications(userId: string | undefined) {
  return useQuery({
    queryKey: ["initiative", "mine", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await db
          .from("initiative_projects")
          .select(OWN_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ) as OwnProject[],
  });
}

/**
 * The kinds of file a supporting document may be, and the extension each one is
 * stored under. The name the visitor's own file carries is never used to build
 * the stored path, and the same four types are what the storage bucket itself
 * accepts, so a file the website would refuse is refused again by the server.
 */
export const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const DOCUMENT_TYPES = Object.keys(DOCUMENT_EXTENSIONS);
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type ApplicationInput = {
  title: string;
  description: string;
  focus_area: string;
  subcategory: string;
  item: string | null;
  location: string;
  amount_required: number;
};

/**
 * Applies. The database forces a new row to 'submitted' and unpublished and
 * tells the admins, so the form only has to send what the applicant wrote.
 * The optional document goes to the private 'initiative' bucket, under the
 * applicant's own folder, which is the only place they may write.
 */
export async function submitApplication(userId: string, input: ApplicationInput, document?: File | null) {
  let documentPath: string | null = null;
  if (document) {
    const ext = DOCUMENT_EXTENSIONS[document.type];
    if (!ext) throw new Error("Upload a JPG, PNG, WEBP or PDF file.");
    documentPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("initiative").upload(documentPath, document, { upsert: false });
    if (error) throw new Error(error.message);
  }
  try {
    return unwrap(
      await db
        .from("initiative_projects")
        .insert({ ...input, user_id: userId, document_path: documentPath })
        .select(OWN_COLUMNS)
        .single(),
    ) as OwnProject;
  } catch (err) {
    // Don't leave an orphaned upload behind if the row was refused.
    if (documentPath) await supabase.storage.from("initiative").remove([documentPath]);
    throw err;
  }
}

/** A link the applicant or an admin can open for a few minutes; the file stays private. */
export async function documentUrl(path: string) {
  const { data, error } = await supabase.storage.from("initiative").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------- donations ----------

/**
 * A donation as its donor may read it back. The account id of the admin who
 * reviewed it is not part of telling a donor whether their payment was found,
 * and neither is the donor id, which they already know.
 */
export const OWN_DONATION_COLUMNS =
  "id, amount, payment_method, reference, project_id, focus_area, designated_by_donor, status, " +
  "donor_name, anonymous, submitted_at, reviewed_at, review_note";

export type DonationStatus = "pending" | "confirmed" | "rejected";

export type OwnDonation = {
  id: string;
  amount: number;
  payment_method: "momo" | "bank";
  reference: string;
  project_id: string | null;
  /** The area the donor asked for, or null for wherever it is needed most. */
  focus_area: string | null;
  designated_by_donor: boolean;
  status: DonationStatus;
  donor_name: string | null;
  anonymous: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

export type AdminDonation = OwnDonation & {
  user_id: string | null;
  donor_email: string | null;
  reviewed_by: string | null;
};

/** What the donor fills in. Everything else about the row is set by the database. */
export type DonationInput = {
  amount: number;
  payment_method: "momo" | "bank";
  reference: string;
  /** null = no particular project. */
  project_id: string | null;
  /**
   * The area the donor asked for, or null. Ignored when a project is given: the
   * database reads the area off the project rather than taking it on trust.
   */
  focus_area: string | null;
  donor_name: string | null;
  donor_email: string | null;
  anonymous: boolean;
};

/**
 * Records that a donor says they have paid. The database stamps the account,
 * forces the row to 'pending', refuses a project the public page does not
 * offer, and will not take a fourth unconfirmed claim from one account, so this
 * sends only what the donor typed.
 */
export async function submitDonation(input: DonationInput) {
  return unwrap(
    await db.from("initiative_donations").insert(input).select(OWN_DONATION_COLUMNS).single(),
  ) as OwnDonation;
}

/** The signed-in donor's own donations, and where each one got to. */
export function useMyDonations(userId: string | undefined) {
  return useQuery({
    queryKey: ["initiative", "donations", "mine", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await db
          .from("initiative_donations")
          .select(OWN_DONATION_COLUMNS)
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false }),
      ) as OwnDonation[],
  });
}

/** Projects a donor may actually choose: published, and still being worked on. */
export function useSupportableProjects() {
  return usePublicProjects(["seeking_support", "funded", "in_progress"]);
}

// ---------- admin ----------

export function useAdminProjects() {
  return useQuery({
    queryKey: ["initiative", "admin"],
    queryFn: async () =>
      unwrap(
        await db.from("initiative_projects").select("*").order("created_at", { ascending: false }),
      ) as AdminProject[],
  });
}

/**
 * Moves a project along. The database checks the move is allowed and stamps who
 * reviewed or verified it, so this only sends the decision and its reason.
 */
export async function setStatus(
  id: string,
  to: ProjectStatus,
  extra: { rejection_reason?: string; completion_summary?: string } = {},
) {
  return unwrap(
    await db.from("initiative_projects").update({ status: to, ...extra }).eq("id", id).select("*").single(),
  ) as AdminProject;
}

export async function setPublished(id: string, published: boolean) {
  return unwrap(
    await db.from("initiative_projects").update({ published }).eq("id", id).select("*").single(),
  ) as AdminProject;
}

export async function updateProject(id: string, fields: Partial<ApplicationInput>) {
  return unwrap(
    await db.from("initiative_projects").update(fields).eq("id", id).select("*").single(),
  ) as AdminProject;
}

/** A project ISOKO runs itself: no applicant, same lifecycle. */
export async function createOwnProject(input: ApplicationInput) {
  return unwrap(
    await db.from("initiative_projects").insert({ ...input, user_id: null }).select("*").single(),
  ) as AdminProject;
}

/** Every donation, for the review desk. */
export function useAdminDonations() {
  return useQuery({
    queryKey: ["initiative", "donations", "admin"],
    queryFn: async () =>
      unwrap(
        await db.from("initiative_donations").select("*").order("submitted_at", { ascending: false }),
      ) as AdminDonation[],
  });
}

/**
 * Confirms or rejects a donation after checking the reference against the real
 * statement. The database stamps who did it and when, and refuses a second
 * review, so this sends only the decision and the note explaining it.
 */
export async function setDonationStatus(id: string, to: "confirmed" | "rejected", note?: string) {
  return unwrap(
    await db
      .from("initiative_donations")
      .update({ status: to, ...(note ? { review_note: note } : {}) })
      .eq("id", id)
      .select("*")
      .single(),
  ) as AdminDonation;
}

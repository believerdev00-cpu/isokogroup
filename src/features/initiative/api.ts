// Reading and writing the Global Initiative. Everything goes through
// row-level security: the public view shows only published projects and only
// the columns a visitor may see, an applicant reads their own rows, and an
// admin reads the rest. Nothing here handles money — donations are not open.
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
  amount_required: number;
  status: ProjectStatus;
  /** Summed from confirmed donations; PostgREST sends a bigint as text. */
  amount_raised: number | string;
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
export type OwnProject = Omit<PublicProject, "amount_raised"> & {
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
        await db.from("initiative_public_projects").select("status, amount_raised, focus_area"),
      ) ?? []) as Pick<PublicProject, "status" | "amount_raised" | "focus_area">[];
      const byArea: Record<string, number> = {};
      for (const r of rows) byArea[r.focus_area] = (byArea[r.focus_area] ?? 0) + 1;
      return {
        published: rows.length,
        completed: rows.filter((r) => r.status === "completed").length,
        funded: rows.filter((r) => ["funded", "in_progress", "completed"].includes(r.status)).length,
        seeking: rows.filter((r) => r.status === "seeking_support").length,
        raised: rows.reduce((n, r) => n + Number(r.amount_raised ?? 0), 0),
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

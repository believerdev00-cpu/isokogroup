// The Isoko Fashion Hub: designs to browse, and the requests signed-in people
// send about them. Row-level security decides what each person reads; a
// request is written only through the database functions here (which refuse
// visitors), so the login requirement is enforced server-side.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { db, rpc, unwrap } from "@/features/services/api";
import type { Status } from "@/features/entertainment/api";

export const HUB = "/entertainment/fashion/hub";
export const linkForDesign = (slug: string) => `${HUB}/${slug}`;

export type Availability = "available" | "made_to_order" | "limited" | "on_request" | "unavailable";
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available", made_to_order: "Made to order", limited: "Limited", on_request: "On request", unavailable: "Not available",
};

export type Design = {
  id: string;
  slug: string;
  name: string;
  category_id: string | null;
  designer_id: string | null;
  description: string | null;
  style_notes: string | null;
  colors: string[];
  sizes: string[];
  fabric: string | null;
  availability: Availability;
  cover_path: string | null;
  cover_w: number | null;
  cover_h: number | null;
  status: Status;
  publish_at: string | null;
  featured: boolean;
  is_demo: boolean;
  created_at: string;
};

export type DesignImage = { id: string; design_id: string; path: string; w: number | null; h: number | null; caption: string | null; sort: number };

export type RequestKind = "inquiry" | "production";
export const REQUEST_STATUSES = ["submitted", "under_review", "more_info_required", "accepted", "in_production", "ready", "completed", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// The columns a customer may read (internal_note is staff-only in the database)
const REQUEST_COLUMNS = "id, reference, design_id, user_id, kind, status, message, size, color, fabric, quantity, customization, staff_note, created_at, updated_at";

export type FashionRequest = {
  id: string;
  reference: string;
  design_id: string;
  user_id: string;
  kind: RequestKind;
  status: RequestStatus;
  message: string | null;
  size: string | null;
  color: string | null;
  fabric: string | null;
  quantity: number | null;
  customization: string | null;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
  design: Pick<Design, "name" | "slug" | "cover_path"> | null;
};

export type DeskRow = Omit<FashionRequest, "design"> & {
  design_name: string;
  design_slug: string;
  design_cover_path: string | null;
  customer_name: string | null;
  customer_email: string | null;
  internal_note: string | null;
};

export function useDesigns(limit = 120) {
  return useQuery({
    queryKey: ["ent", "fashion-designs", limit],
    queryFn: async () =>
      unwrap(await db.from("ent_fashion_designs").select("*").order("featured", { ascending: false }).order("created_at", { ascending: false }).limit(limit)) as Design[],
  });
}

export function useDesign(slug: string | undefined) {
  return useQuery({
    queryKey: ["ent", "fashion-design", slug],
    enabled: !!slug,
    queryFn: async () => unwrap(await db.from("ent_fashion_designs").select("*").eq("slug", slug).maybeSingle()) as Design | null,
  });
}

export function useDesignImages(designId: string | undefined) {
  return useQuery({
    queryKey: ["ent", "fashion-design-images", designId],
    enabled: !!designId,
    queryFn: async () => unwrap(await db.from("ent_fashion_design_images").select("*").eq("design_id", designId).order("sort")) as DesignImage[],
  });
}

/** The signed-in person's own requests, newest first. */
export function useMyFashionRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ent", "fashion-requests", user?.id],
    enabled: !!user,
    queryFn: async () =>
      unwrap(
        await db.from("ent_fashion_requests")
          .select(`${REQUEST_COLUMNS}, design:ent_fashion_designs(name, slug, cover_path)`)
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
      ) as FashionRequest[],
  });
}

export type RequestInput = {
  design_id: string;
  kind: RequestKind;
  message?: string;
  size?: string;
  color?: string;
  fabric?: string;
  quantity?: string;
  customization?: string;
};

/** Sends an inquiry or a production request; the database refuses visitors. */
export const submitFashionRequest = (p: RequestInput) => rpc<{ id: string; reference: string }>("fashion_submit_request", { p });

// ============== STAFF ==============
export function useFashionDesk() {
  return useQuery({
    queryKey: ["media-admin", "fashion-desk"],
    queryFn: () => rpc<DeskRow[]>("fashion_requests_desk"),
  });
}

export const updateFashionRequest = (id: string, status: RequestStatus, staffNote: string, internalNote: string) =>
  rpc("fashion_update_request", { p_id: id, p_status: status, p_staff_note: staffNote || null, p_internal_note: internalNote || null });

/** The design categories (section 'design' of ent_categories). */
export function useDesignCategories() {
  return useQuery({
    queryKey: ["ent", "categories", "design"],
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(await db.from("ent_categories").select("*").eq("section", "design").order("sort")) as { id: string; slug: string; name: string }[],
  });
}

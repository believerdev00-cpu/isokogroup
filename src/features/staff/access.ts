import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { db, rpc, type ServiceKey } from "@/features/services/api";

/** A staff workspace: a client service, or Isoko Entertainment's media desk. */
export type StaffArea = ServiceKey | "entertainment";

const ROLE_FOR: Record<StaffArea, string> = {
  travel: "travel_staff", consultancy: "consultancy_staff", data: "data_analyst", entertainment: "media_staff",
};
export const SERVICE_ORDER: StaffArea[] = ["travel", "consultancy", "data", "entertainment"];

/** Which workspaces the signed-in person works in. Admins work in all. */
export function useStaffAccess() {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["staff_access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await db.from("user_roles").select("role").eq("user_id", user!.id);
      const roles = new Set<string>((data ?? []).map((r: { role: string }) => r.role));
      const isAdmin = roles.has("admin");
      return { isAdmin, services: SERVICE_ORDER.filter((s) => isAdmin || roles.has(ROLE_FOR[s])) };
    },
  });
  return {
    loading: authLoading || (!!user && q.isLoading),
    signedIn: !!user,
    isAdmin: q.data?.isAdmin ?? false,
    services: q.data?.services ?? [],
  };
}

export type StaffMember = { user_id: string; full_name: string; email: string };

export function useStaffDirectory(service: ServiceKey) {
  return useQuery({
    queryKey: ["service_staff_directory", service],
    queryFn: () => rpc<StaffMember[]>("service_staff_directory", { _service: service }),
    staleTime: 5 * 60_000,
  });
}

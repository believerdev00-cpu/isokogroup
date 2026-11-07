export type UserPaymentStatus = "pending" | "confirmed" | "rejected" | "none";

export type UserPayment = {
  user_id: string | null;
  customer_email: string | null;
  status: "pending" | "confirmed" | "rejected";
  submitted_at: string;
};

/**
 * Where each registered user stands, from the subscription payments they reported.
 * A payment waiting for a decision comes first, because it needs the admin;
 * otherwise their most recent one counts. Someone who has reported nothing isn't
 * in the map: that's "no payment".
 */
export function currentPaymentByUser<T extends UserPayment>(payments: T[]): Map<string, T> {
  const byUser = new Map<string, T>();
  for (const p of payments) {
    if (!p.user_id) continue;
    const held = byUser.get(p.user_id);
    if (
      !held ||
      (p.status === "pending" && held.status !== "pending") ||
      (p.status === held.status || held.status !== "pending") && p.submitted_at > held.submitted_at
    ) {
      byUser.set(p.user_id, p);
    }
  }
  return byUser;
}

// The shared payment engine (see supabase/migrations/20260925120100_payment_engine.sql).
// Every billable record has one account: a ledger of charges, payments, refunds and
// adjustments, customer payment reports waiting for a check, and verified payments.
// All writes go through database functions that check the caller and the amounts.
import { useQuery } from "@tanstack/react-query";
import { rpc, type PaymentMethod } from "@/features/services/api";

export type FinanceModule = "travel" | "consultancy" | "data" | "marketplace" | "subscriptions" | "software";
export type BillableTable = "travel_trips" | "consult_requests" | "data_requests" | "orders" | "subscriptions" | "software_bookings";

export type Totals = { charged: number; credits: number; paid: number; refunded: number; pending: number; balance: number };

export type Submission = {
  id: string; amount: number; currency: string; method: PaymentMethod; reference: string;
  status: "pending" | "verified" | "rejected"; via: string; review_note: string | null; created_at: string; reviewed_at: string | null;
};

export type PaymentStatus = "pending" | "processing" | "successful" | "failed" | "cancelled" | "refunded" | "partially_refunded" | "voided";
export type FinancePayment = {
  id: string; amount: number; currency: string; method: PaymentMethod; provider: string; reference: string;
  status: PaymentStatus; refunded_amount: number; failure_reason: string | null;
  metadata: { note?: string } | null; confirmed_at: string | null; created_at: string;
};

export type LedgerEntry = { id: number; kind: string; amount: number; description: string; reason: string | null; created_at: string };

export type AccountSummary = {
  exists: boolean; currency?: string; totals: Totals; can_reverse: boolean;
  submissions: Submission[]; payments: FinancePayment[]; entries: LedgerEntry[];
};

export type PendingSubmission = {
  id: string; amount: number; currency: string; method: PaymentMethod; reference: string; created_at: string;
  entity_table: BillableTable; entity_id: string; label: string; balance: number;
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Started",
  processing: "Processing",
  successful: "Received",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  voided: "Voided",
};

export const accountKey = (table: BillableTable, id: string) => ["finance_account", table, id];

export function useAccountSummary(table: BillableTable, id: string) {
  return useQuery({
    queryKey: accountKey(table, id),
    queryFn: () => rpc<AccountSummary>("finance_account_summary", { p_entity_table: table, p_entity_id: id }),
  });
}

/** Customer payment reports waiting for a check, for one service (refreshes every minute). */
export function usePendingSubmissions(module: FinanceModule) {
  return useQuery({
    queryKey: ["finance_pending", module],
    queryFn: () => rpc<PendingSubmission[]>("finance_pending_submissions", { p_module: module }),
    refetchInterval: 60_000,
  });
}

/** A fresh key per payment form, so a double click or a retry records the payment once. */
export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

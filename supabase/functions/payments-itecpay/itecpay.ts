// ItecPay's mobile-money API (V2), as documented in their Postman collection
// (see docs/ITECPAY_INTEGRATION.md). Every call is a JSON POST with the API key
// in the body; the HTTP status is always 200 and the outcome is the body's
// "status". Anything unexpected (no answer, not JSON, an unknown shape) is
// "unknown", never "failed": the payment then waits for the next check.
import { mocksAllowed } from "../_shared/environment.ts";

export type Network = "mtn" | "airtel" | "spenn";
type Env = { get(name: string): string | undefined };

const ITECPAY_URL = "https://pay.itecpay.rw";
const TIMEOUT_MS = 20_000;

export type PayResult =
  | { kind: "accepted"; transactionId: string; financialTransactionId: string | null }
  | { kind: "refused"; message: string }
  | { kind: "unknown"; reason: string };

export type VerifyResult =
  | { kind: "status"; status: string; outcome: Outcome; amount: number | null; transactionId: string | null }
  | { kind: "refused"; message: string }
  | { kind: "unknown"; reason: string };

/** What an ItecPay status means for the payment. */
export type Outcome = "successful" | "failed" | "waiting" | "unknown";

export function outcomeOf(status: string): Outcome {
  switch (status.toUpperCase()) {
    case "SUCCESSFUL":
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETED":
      return "successful";
    case "FAILED":
    case "FAILURE":
    case "REJECTED":
    case "DECLINED":
    case "CANCELLED":
    case "CANCELED":
    case "EXPIRED":
    case "TIMEOUT":
      return "failed";
    case "PENDING":
    case "PROCESSING":
    case "INITIATED":
    case "ONGOING":
      return "waiting";
    default:
      return "unknown";
  }
}

export class ItecPay {
  readonly baseUrl: string;
  private readonly keys: Partial<Record<Network, string>>;

  constructor(env: Env) {
    // A different address only locally (tests use a fake ItecPay); never on hosted Supabase
    const override = env.get("ITECPAY_BASE_URL");
    this.baseUrl = (override && mocksAllowed(env) ? override : ITECPAY_URL).replace(/\/$/, "");
    this.keys = {
      mtn: env.get("ITECPAY_KEY_MTN") || undefined,
      airtel: env.get("ITECPAY_KEY_AIRTEL") || undefined,
      spenn: env.get("ITECPAY_KEY_SPENN") || undefined,
    };
  }

  hasKey(network: Network) {
    return Boolean(this.keys[network]);
  }

  /** Asks the customer to approve the payment on their phone. req_ref is our payment id. */
  async pay(p: { paymentId: string; network: Network; phone: string; amount: number }): Promise<PayResult> {
    const r = await this.post("/api2/pay", p.network, {
      amount: p.amount,
      phone: p.phone,
      req_ref: p.paymentId,
      note: `ISOKO-${p.paymentId.slice(0, 8).toUpperCase()}`,
      message: "Isoko payment",
    });
    if (!r.ok) return { kind: "unknown", reason: r.reason };
    const data = (r.json.data ?? {}) as Record<string, unknown>;
    if (r.json.status === 200 && typeof data.transaction_id === "string" && data.transaction_id) {
      return {
        kind: "accepted",
        transactionId: data.transaction_id,
        financialTransactionId: data.financial_transaction_id == null ? null : String(data.financial_transaction_id),
      };
    }
    if (typeof r.json.status === "number" && r.json.status >= 400) {
      return { kind: "refused", message: String(data.message ?? "The payment request was refused") };
    }
    return { kind: "unknown", reason: "Unexpected reply" };
  }

  /** ItecPay's own record of the payment: the only thing that marks it paid. */
  async verify(p: { paymentId: string; network: Network }): Promise<VerifyResult> {
    const r = await this.post("/api2/verify", p.network, { action: "status_check", req_ref: p.paymentId });
    if (!r.ok) return { kind: "unknown", reason: r.reason };
    const data = (r.json.data ?? {}) as Record<string, unknown>;
    if (r.json.status === 200 && typeof data.status === "string") {
      const amount = data.amount == null || data.amount === "" ? null : Number(data.amount);
      return {
        kind: "status",
        status: data.status.toUpperCase(),
        outcome: outcomeOf(data.status),
        amount: amount != null && Number.isFinite(amount) ? amount : null,
        transactionId: typeof data.transaction_id === "string" ? data.transaction_id : null,
      };
    }
    if (typeof r.json.status === "number" && r.json.status >= 400) {
      return { kind: "refused", message: String(data.message ?? "Not found") };
    }
    return { kind: "unknown", reason: "Unexpected reply" };
  }

  private async post(path: string, network: Network, body: Record<string, unknown>):
    Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; reason: string }> {
    const key = this.keys[network];
    if (!key) return { ok: false, reason: `No ItecPay key for ${network}` };
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...body, key }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "ItecPay didn't answer in time" : "ItecPay unreachable" };
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object") return { ok: true, json };
    } catch {
      // fall through
    }
    return { ok: false, reason: `ItecPay answered ${res.status} without JSON` };
  }
}

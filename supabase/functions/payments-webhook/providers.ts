// Payment providers the webhook accepts. Each one checks that a webhook really
// comes from the provider and turns it into one ProviderEvent; the database
// (finance_apply_provider_event) does everything else: dedupe, amount checks,
// the ledger.
//
// Only providers with their secret configured are enabled. A real provider
// (MTN MoMo, Airtel Money, Flutterwave, ...) is added here once Isoko has an
// account and its credentials; until then only the mock provider exists, for
// development and tests, and only when PAYMENTS_MOCK_SECRET is set.

export type ProviderStatus = "processing" | "successful" | "failed" | "cancelled";

export type ProviderEvent = {
  eventId: string;
  paymentId: string;
  providerTxnId: string | null;
  status: ProviderStatus;
  amount: number;
  currency: string;
  failureReason: string | null;
};

export interface PaymentProvider {
  id: string;
  /** Checks the webhook's signature. Must be constant-time and reject stale requests. */
  verify(req: Request, rawBody: string): Promise<boolean>;
  /** Reads the event; throws when the body isn't a valid event. */
  parse(rawBody: string): ProviderEvent;
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<ProviderStatus>(["processing", "successful", "failed", "cancelled"]);
const MAX_AGE_SECONDS = 300;

/**
 * Mock provider for development and tests.
 *   X-Isoko-Timestamp: <unix seconds>
 *   X-Isoko-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with PAYMENTS_MOCK_SECRET>
 *   body: { event_id, payment_id, provider_txn_id?, status, amount, currency, failure_reason? }
 */
export function mockProvider(secret: string): PaymentProvider {
  return {
    id: "mock",
    async verify(req, rawBody) {
      const ts = req.headers.get("x-isoko-timestamp") ?? "";
      const sig = (req.headers.get("x-isoko-signature") ?? "").replace(/^sha256=/, "");
      const age = Math.abs(Date.now() / 1000 - Number(ts));
      if (!/^\d{9,11}$/.test(ts) || !(age <= MAX_AGE_SECONDS)) return false;
      return constantTimeEqual(await hmacHex(secret, `${ts}.${rawBody}`), sig);
    },
    parse(rawBody) {
      const b = JSON.parse(rawBody);
      const event: ProviderEvent = {
        eventId: String(b.event_id ?? ""),
        paymentId: String(b.payment_id ?? ""),
        providerTxnId: b.provider_txn_id == null ? null : String(b.provider_txn_id),
        status: b.status,
        amount: Number(b.amount),
        currency: String(b.currency ?? ""),
        failureReason: b.failure_reason == null ? null : String(b.failure_reason).slice(0, 500),
      };
      if (!/^[\w.:-]{1,200}$/.test(event.eventId) || !UUID.test(event.paymentId) || !STATUSES.has(event.status)
          || !Number.isFinite(event.amount) || event.amount <= 0 || !/^[A-Z]{3}$/.test(event.currency)
          || (event.providerTxnId !== null && !/^[\w.:-]{1,200}$/.test(event.providerTxnId))) {
        throw new Error("Invalid event");
      }
      return event;
    },
  };
}

/** The providers enabled by the environment, by id. */
export function enabledProviders(env: { get(name: string): string | undefined }): Map<string, PaymentProvider> {
  const providers = new Map<string, PaymentProvider>();
  const mockSecret = env.get("PAYMENTS_MOCK_SECRET");
  if (mockSecret && mockSecret.length >= 16) providers.set("mock", mockProvider(mockSecret));
  return providers;
}

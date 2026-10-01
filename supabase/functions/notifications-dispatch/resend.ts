// Email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
//
//   RESEND_API_KEY   an API key with "Sending access" (Resend > API Keys): a
//                    secret, set only with `supabase secrets set`, never in the
//                    website's variables or in git
//   EMAIL_FROM       the sender, on the domain verified in Resend; defaults to
//                    "Isoko Groups <noreply@isokogroups.com>"
//
// The delivery id is sent as Resend's Idempotency-Key, so a resend after a
// crash is recognised and not delivered twice. Resend answers 4xx for things
// that won't change by trying again (a bad address, an unverified sender, a
// refused key) and 429 / 5xx when it is busy or down; only those are retried.
// The key never appears in an error: messages name the setting, not its value.
import { mocksAllowed } from "../_shared/environment.ts";
import type { Message, NotificationProvider, SendResult } from "./channels.ts";

type Env = { get(name: string): string | undefined };

export const DEFAULT_FROM = "Isoko Groups <noreply@isokogroups.com>";

/** `Name <address>` for Resend, with the name quoted when it needs to be */
export function recipient(to: string, name: string | null): string {
  const n = (name ?? "").replace(/[<>"\r\n]/g, " ").trim();
  return n ? `"${n}" <${to}>` : to;
}

export function resendProvider(env: Env): NotificationProvider | string {
  const key = (env.get("RESEND_API_KEY") ?? "").trim();
  if (!key) return "EMAIL_PROVIDER is resend but RESEND_API_KEY is not set";
  const from = (env.get("EMAIL_FROM") ?? "").trim() || DEFAULT_FROM;
  if (!/<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$|^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(from)) {
    return 'EMAIL_FROM must be an address on the verified domain, e.g. "Isoko Groups <noreply@isokogroups.com>"';
  }
  // A different Resend address only locally (tests use a fake Resend)
  const override = env.get("RESEND_API_BASE");
  const base = (override && mocksAllowed(env) ? override : "https://api.resend.com").replace(/\/$/, "");

  return {
    id: "resend",
    async send(m: Message): Promise<SendResult> {
      if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(m.to)) return { ok: false, error: "Invalid email address", retry: false };
      let res: Response;
      try {
        res = await fetch(`${base}/emails`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            // the same delivery is never sent twice (Resend keeps keys for 24 hours)
            "Idempotency-Key": `notification/${m.id}`,
          },
          body: JSON.stringify({
            from,
            to: [recipient(m.to, m.name)],
            subject: m.subject.slice(0, 998),
            text: m.body,
            headers: { "X-Entity-Ref-ID": m.id },
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        return { ok: false, error: "Resend unreachable", retry: true };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
      if (res.ok && body.id) return { ok: true, messageId: body.id };
      // Resend's own words, minus anything that could echo settings back
      const detail = String(body.message ?? "").replace(/re_[A-Za-z0-9_]+/g, "re_…").slice(0, 200);
      let error: string;
      if (res.status === 401 || res.status === 403) error = "Resend refused the API key (check RESEND_API_KEY)";
      else if (res.status === 422 || res.status === 400) error = `Resend refused the message: ${detail || body.name || "validation error"}`;
      else if (res.status === 429) error = "Resend rate limit";
      else error = `Resend ${res.status}: ${detail || body.name || "error"}`;
      return { ok: false, error, retry: res.status === 429 || res.status >= 500 };
    },
  };
}

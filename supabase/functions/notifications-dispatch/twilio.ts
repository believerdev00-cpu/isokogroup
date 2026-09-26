// WhatsApp and SMS through Twilio's Messages API.
//
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN      the account (Twilio Console > Account info)
//   TWILIO_WHATSAPP_FROM                       the WhatsApp sender, e.g. whatsapp:+250788000000
//                                              (or Twilio's sandbox number while testing)
//   TWILIO_SMS_FROM                            the SMS sender: a number, an approved sender name,
//                                              or a Messaging Service SID (MG...)
//
// WhatsApp only lets a business start a conversation with a template WhatsApp
// approved: when notification_templates names one for the event
// (provider_template = the content SID "HX..."), it is sent with its numbered
// variables; otherwise the text is sent as it is, which WhatsApp accepts only
// within 24 hours of the customer's last message (and in the sandbox).
// Twilio reports delivery later to the notifications-status function.
import { mocksAllowed } from "../_shared/environment.ts";
import type { Message, NotificationProvider, SendResult } from "./channels.ts";

type Env = { get(name: string): string | undefined };

/** +2507XXXXXXXX from the ways Rwandan (and international) numbers are written; null if unusable. */
export function e164(raw: string): string | null {
  const t = raw.replace(/^whatsapp:/, "").trim();
  const digits = t.replace(/[^0-9]/g, "");
  if (t.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (/^07[0-9]{8}$/.test(digits)) return `+250${digits.slice(1)}`;
  if (/^2507[0-9]{8}$/.test(digits)) return `+${digits}`;
  if (/^00[0-9]{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
}

// Twilio errors that won't go away by trying again
const FINAL: Record<number, string> = {
  21211: "Invalid phone number",
  21408: "Twilio isn't allowed to send to this country (Geo permissions)",
  21610: "The recipient has unsubscribed (replied STOP)",
  21612: "Twilio can't send to this number from this sender",
  21614: "Not a mobile number",
  63003: "The number isn't on WhatsApp",
  63016: "Needs an approved WhatsApp template (outside the 24-hour window)",
  63024: "The number isn't on WhatsApp or the message was blocked",
};

export function twilioProvider(env: Env, channel: "whatsapp" | "sms"): NotificationProvider | string {
  const sid = env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = env.get("TWILIO_AUTH_TOKEN") ?? "";
  const from = (channel === "whatsapp" ? env.get("TWILIO_WHATSAPP_FROM") : env.get("TWILIO_SMS_FROM")) ?? "";
  if (!/^AC[0-9a-zA-Z]{8,}$/.test(sid) || !token) return `${channel}: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required`;
  if (!from) return `${channel}: ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_SMS_FROM"} is required`;
  // A different Twilio address only locally (tests use a fake Twilio)
  const override = env.get("TWILIO_API_BASE");
  const base = (override && mocksAllowed(env) ? override : "https://api.twilio.com").replace(/\/$/, "");
  const statusUrl = `${(env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/notifications-status/twilio`;
  const auth = "Basic " + btoa(`${sid}:${token}`);

  return {
    id: "twilio",
    async send(m: Message): Promise<SendResult> {
      const to = e164(m.to);
      if (!to) return { ok: false, error: "Invalid phone number", retry: false };
      const form = new URLSearchParams();
      form.set("To", channel === "whatsapp" ? `whatsapp:${to}` : to);
      if (channel === "sms" && from.startsWith("MG")) form.set("MessagingServiceSid", from);
      else form.set("From", channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from);
      if (m.template) {
        form.set("ContentSid", m.template.id);
        form.set("ContentVariables", JSON.stringify(m.template.variables));
      } else {
        form.set("Body", m.body.slice(0, channel === "sms" ? 640 : 1600));
      }
      if (statusUrl.startsWith("https://")) form.set("StatusCallback", statusUrl);

      let res: Response;
      try {
        res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        return { ok: false, error: "Twilio unreachable", retry: true };
      }
      const body = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
      if (res.ok && body.sid) return { ok: true, messageId: body.sid };
      const code = Number(body.code ?? 0);
      const error = FINAL[code] ?? `Twilio ${res.status}${code ? ` (${code})` : ""}: ${String(body.message ?? "").slice(0, 200)}`;
      // busy or down: later; anything else (bad number, not allowed, bad settings) won't fix itself
      return { ok: false, error, retry: res.status === 429 || res.status >= 500 };
    },
  };
}

// Senders for the notification channels. Configured per channel with
//   EMAIL_PROVIDER=smtp with SMTP_HOST, SMTP_PORT (465), SMTP_SECURE (true),
//     SMTP_USER, SMTP_PASSWORD and EMAIL_FROM: any mail server or email service
//     that accepts SMTP (the Training Center's mailbox, for example)
//   WHATSAPP_PROVIDER / WHATSAPP_API_KEY
//   SMS_PROVIDER / SMS_API_KEY
// A channel without a provider is not sent: its deliveries are marked skipped
// with the reason, never "sent". WhatsApp and SMS providers are added here once
// Isoko has an account with them (e.g. the WhatsApp Business Cloud API, an SMS
// gateway); until then they have only "mock", for development and tests.
import nodemailer from "npm:nodemailer@10.0.10";

export type Channel = "email" | "whatsapp" | "sms";

export type Message = {
  /** The delivery id: passed to providers as the idempotency key, so a resend after a crash is recognised. */
  id: string;
  to: string;
  name: string | null;
  subject: string;
  body: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; retry: boolean };

export interface NotificationProvider {
  id: string;
  send(message: Message): Promise<SendResult>;
}
export type EmailProvider = NotificationProvider;
export type WhatsAppProvider = NotificationProvider;
export type SmsProvider = NotificationProvider;

/**
 * Pretends to send, for development and tests. Addresses ending in ".invalid"
 * fail for good; addresses containing "timeout" fail and are retried.
 */
export function mockProvider(): NotificationProvider {
  return {
    id: "mock",
    send(m) {
      if (m.to.endsWith(".invalid")) return Promise.resolve({ ok: false, error: "Invalid address", retry: false });
      if (m.to.includes("timeout")) return Promise.resolve({ ok: false, error: "Provider timeout", retry: true });
      return Promise.resolve({ ok: true, messageId: `mock-${m.id}` });
    },
  };
}

type Env = { get(name: string): string | undefined };

/**
 * Email through an SMTP server. The delivery id becomes the Message-ID, so a
 * resend after a crash can be recognised. The server refusing the message or
 * the address (5xx) is final; anything else (timeouts, 4xx) is retried.
 */
export function smtpProvider(env: Env): NotificationProvider | string {
  const host = (env.get("SMTP_HOST") ?? "").trim();
  const from = (env.get("EMAIL_FROM") ?? "").trim();
  if (!host) return "EMAIL_PROVIDER is smtp but SMTP_HOST is not set";
  if (!from) return "EMAIL_PROVIDER is smtp but EMAIL_FROM is not set";
  const user = env.get("SMTP_USER");
  const transport = nodemailer.createTransport({
    host,
    port: Number(env.get("SMTP_PORT") ?? 465),
    secure: (env.get("SMTP_SECURE") ?? "true") === "true",
    auth: user ? { user, pass: env.get("SMTP_PASSWORD") } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    id: "smtp",
    async send(m) {
      try {
        const info = await transport.sendMail({
          from,
          to: m.name ? { name: m.name, address: m.to } : m.to,
          subject: m.subject,
          text: m.body,
          messageId: `<${m.id}@notifications.isoko>`,
        });
        if (info.rejected?.length) return { ok: false, error: "The mail server refused the address", retry: false };
        return { ok: true, messageId: String(info.messageId ?? m.id) };
      } catch (e) {
        const code = Number((e as { responseCode?: number }).responseCode ?? 0);
        const message = e instanceof Error ? e.message : "Send failed";
        return { ok: false, error: message.slice(0, 300), retry: !(code >= 500 && code < 600) };
      }
    },
  };
}

const ENV_PREFIX: Record<Channel, string> = { email: "EMAIL", whatsapp: "WHATSAPP", sms: "SMS" };

/** The configured provider of each channel, or why there is none. */
export function configuredProviders(env: Env) {
  const providers = new Map<Channel, NotificationProvider | string>();
  for (const channel of Object.keys(ENV_PREFIX) as Channel[]) {
    const name = (env.get(`${ENV_PREFIX[channel]}_PROVIDER`) ?? "").trim().toLowerCase();
    if (!name) providers.set(channel, `No ${channel} provider configured`);
    else if (name === "mock") providers.set(channel, mockProvider());
    else if (name === "smtp" && channel === "email") providers.set(channel, smtpProvider(env));
    else providers.set(channel, `The ${channel} provider "${name}" is not supported yet`);
  }
  return providers;
}

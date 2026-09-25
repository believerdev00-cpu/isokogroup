// Senders for the notification channels. Configured per channel with
//   EMAIL_PROVIDER / EMAIL_API_KEY (+ EMAIL_FROM)
//   WHATSAPP_PROVIDER / WHATSAPP_API_KEY
//   SMS_PROVIDER / SMS_API_KEY
// A channel without a provider is not sent: its deliveries are marked skipped
// with the reason, never "sent". Real providers are added here once Isoko has
// an account with them (e.g. an email API, the WhatsApp Business Cloud API, an
// SMS gateway); until then only "mock" exists, for development and tests.

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

const ENV_PREFIX: Record<Channel, string> = { email: "EMAIL", whatsapp: "WHATSAPP", sms: "SMS" };

/** The configured provider of each channel, or why there is none. */
export function configuredProviders(env: { get(name: string): string | undefined }) {
  const providers = new Map<Channel, NotificationProvider | string>();
  for (const channel of Object.keys(ENV_PREFIX) as Channel[]) {
    const name = (env.get(`${ENV_PREFIX[channel]}_PROVIDER`) ?? "").trim().toLowerCase();
    if (!name) providers.set(channel, `No ${channel} provider configured`);
    else if (name === "mock") providers.set(channel, mockProvider());
    else providers.set(channel, `The ${channel} provider "${name}" is not supported yet`);
  }
  return providers;
}

// Sends one real test email through Resend with the same code the
// notifications-dispatch function uses, to check the key, the verified domain
// and the sender before deploying. Never prints the key.
//
//   RESEND_API_KEY=<the key> node supabase/tests/resend-smoke.mjs you@example.com
//   (or put RESEND_API_KEY in supabase/functions/.env, which git ignores)
//
// Optional: EMAIL_FROM="Isoko Groups <noreply@isokogroups.com>" (the default).
import { readFileSync } from "node:fs";

const to = process.argv[2];
if (!to || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(to)) {
  console.error("Usage: RESEND_API_KEY=<key> node supabase/tests/resend-smoke.mjs you@example.com");
  process.exit(2);
}
if (!process.env.RESEND_API_KEY) {
  // the local functions' env file, if the key is kept there
  try {
    for (const line of readFileSync(new URL("../functions/.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*(RESEND_API_KEY|EMAIL_FROM)\s*=\s*"?([^"\r]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no local env file */ }
}
if (!process.env.RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set (environment or supabase/functions/.env)");
  process.exit(2);
}

// The provider module is TypeScript; load it through the same transpiler the tests use
const { createServer } = await import("vite");
const vite = await createServer({ server: { middlewareMode: true }, logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
const { resendProvider, DEFAULT_FROM } = await vite.ssrLoadModule("/supabase/functions/notifications-dispatch/resend.ts");
await vite.close();

const provider = resendProvider({ get: (n) => process.env[n] });
if (typeof provider === "string") {
  console.error(provider);
  process.exit(1);
}
const id = crypto.randomUUID();
const result = await provider.send({
  id,
  to,
  name: null,
  subject: "Isoko Groups: test email",
  body: `This is a test from the Isoko notification sender (delivery ${id}).\nIf you can read it, Resend, the verified domain and the sender work.`,
});
const from = process.env.EMAIL_FROM || DEFAULT_FROM;
if (result.ok) {
  console.log(`  ok  sent to ${to} from ${from} (Resend id ${result.messageId})`);
} else {
  console.error(`  FAIL  ${result.error}${result.retry ? " (temporary)" : ""}`);
  process.exit(1);
}

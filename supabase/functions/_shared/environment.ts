// Where an Edge Function is running. Hosted Supabase sets the region variables;
// `supabase start` / `supabase functions serve` don't.

type Env = { get(name: string): string | undefined };

/** True on hosted Supabase (staging or production), false locally. */
export function isHosted(env: Env): boolean {
  return Boolean(env.get("SB_REGION") || env.get("DENO_REGION"));
}

/**
 * Mock providers pretend to take payments and send messages. They exist for
 * local development and tests only: on hosted Supabase they are never enabled,
 * whatever the settings say, so a leftover test secret can't confirm payments.
 */
export function mocksAllowed(env: Env): boolean {
  return !isHosted(env);
}

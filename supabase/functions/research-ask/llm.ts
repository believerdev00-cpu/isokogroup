// The model that writes the answer: Claude, through the official SDK. The key
// is a function secret; without it the engine returns the matching items and
// no written answer (ai: false). Deno-only module (npm import): not imported
// by the vitest file.
import Anthropic from "npm:@anthropic-ai/sdk";

type Env = { get(name: string): string | undefined };

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MODEL_TIMEOUT_MS = 40_000;
/**
 * The ceiling covers the model's reasoning as well as the answer. On this model
 * reasoning is always on and cannot be switched off, and it is spent before a
 * word of the reply is written -- so a ceiling sized for the answer alone (the
 * answer itself is capped at 2,500 characters) is spent on reasoning and the
 * reply comes back empty or cut in half, which reads from outside exactly like
 * a key that does not work. Low effort keeps the reasoning short; this keeps
 * the room for it.
 */
export const MAX_TOKENS = 4_000;

export function modelName(env: Env): string {
  return env.get("RESEARCH_MODEL")?.trim() || DEFAULT_MODEL;
}

export function hasModelKey(env: Env): boolean {
  return Boolean(env.get("ANTHROPIC_API_KEY")?.trim());
}

/**
 * Asks the model and returns its raw text (a JSON object, per the prompt), or
 * null when it refused, timed out or failed. Errors are logged without the key.
 */
export async function askModel(env: Env, system: string, user: string): Promise<{ text: string | null; model: string; error: string | null }> {
  const model = modelName(env);
  // A key that belongs to a person or a service account, rather than to one
  // workspace, has to say which workspace the request acts in; a key created
  // for a single workspace already knows, and needs no header. Setting
  // ANTHROPIC_WORKSPACE_ID covers the first case.
  const workspace = env.get("ANTHROPIC_WORKSPACE_ID")?.trim();
  const client = new Anthropic({
    apiKey: env.get("ANTHROPIC_API_KEY"),
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: 1,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
      // short factual prose: the lowest effort is enough and keeps answers quick
      output_config: { effort: "low" },
      // a policy decline is re-run on a fallback model inside the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") return { text: null, model: response.model, error: "the model declined this question" };
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    // a reply cut off at the ceiling is unusable JSON, and says so rather than
    // being reported as the model simply having nothing to say
    if (response.stop_reason === "max_tokens") {
      return { text: text || null, model: response.model, error: `the reply hit the ${MAX_TOKENS}-token ceiling (${text.length} characters of text)` };
    }
    return { text: text || null, model: response.model, error: text ? null : "empty reply" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? ` (${e.status})` : "";
    const message = e instanceof Error ? e.message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "<key>") : "model call failed";
    return { text: null, model, error: `${message}${status}` };
  }
}

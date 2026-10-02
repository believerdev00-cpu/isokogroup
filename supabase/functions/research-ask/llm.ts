// The model that writes the answer: Claude, through the official SDK. The key
// is a function secret; without it the engine returns the matching items and
// no written answer (ai: false). Deno-only module (npm import): not imported
// by the vitest file.
import Anthropic from "npm:@anthropic-ai/sdk";

type Env = { get(name: string): string | undefined };

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MODEL_TIMEOUT_MS = 25_000;
export const MAX_TOKENS = 700;

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
  const client = new Anthropic({ apiKey: env.get("ANTHROPIC_API_KEY"), timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
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
    return { text: text || null, model: response.model, error: text ? null : "empty reply" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? ` (${e.status})` : "";
    const message = e instanceof Error ? e.message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "<key>") : "model call failed";
    return { text: null, model, error: `${message}${status}` };
  }
}

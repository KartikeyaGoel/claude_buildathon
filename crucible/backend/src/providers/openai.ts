import OpenAI from "openai";
import { env } from "../config/env.js";
import { timeoutSignal } from "../utils/abort.js";
import { modelTimeoutMs } from "../utils/pipelineCancel.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || "missing-openai-key",
  maxRetries: 0,
});

/** Reasoning / GPT-5 family models only accept the default temperature. */
export function openAiSupportsTemperature(model: string): boolean {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
    return false;
  }
  if (normalized.startsWith("gpt-5")) return false;
  return true;
}

export const runOpenAI: Provider = async (call: ProviderCall): Promise<ProviderResult> => {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for OpenAI provider");

  const started = Date.now();
  const timeoutMs = modelTimeoutMs(call.role, call.timeoutMs);
  const signal = timeoutSignal(timeoutMs);
  const model = env.OPENAI_MODEL;
  let completion;
  try {
    completion = await withProviderRetry(
    `openai:${call.role}`,
    () =>
      openai.chat.completions.create(
        {
          model,
          ...(openAiSupportsTemperature(model) ? { temperature: 0.2 } : {}),
          messages: [
            { role: "system", content: call.system },
            { role: "user", content: call.user },
          ],
        },
        { signal },
      ),
    signal,
  );
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`Model call timed out after ${timeoutMs}ms (openai:${call.role})`);
    }
    throw error;
  }

  return {
    role: call.role,
    text: completion.choices[0]?.message.content ?? "",
    model: env.OPENAI_MODEL,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted,
  };
};

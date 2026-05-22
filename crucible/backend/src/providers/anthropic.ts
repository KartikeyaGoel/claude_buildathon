import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { timeoutSignal } from "../utils/abort.js";
import { modelTimeoutMs } from "../utils/pipelineCancel.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  // Per-call deadline is timeoutSignal(timeoutMs); this is only the HTTP client ceiling.
  timeout: 120_000,
  maxRetries: 0,
});

function textFromMessage(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export const runAnthropic: Provider = async (call: ProviderCall): Promise<ProviderResult> => {
  const started = Date.now();
  const timeoutMs = modelTimeoutMs(call.role, call.timeoutMs);
  const signal = timeoutSignal(timeoutMs);
  const model = call.model ?? env.ANTHROPIC_MODEL;

  let message: Anthropic.Messages.Message;
  try {
    message = await withProviderRetry(
      `anthropic:${call.role}`,
      () =>
        anthropic.messages.create(
          {
            model,
            max_tokens: 4096,
            temperature: 0.2,
            system: call.system,
            messages: [{ role: "user", content: call.user }],
          },
          { signal },
        ),
      signal,
    );
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`Model call timed out after ${timeoutMs}ms (anthropic:${call.role})`);
    }
    throw error;
  }

  return {
    role: call.role,
    text: textFromMessage(message),
    model,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted,
  };
};

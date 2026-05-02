import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { anySignal, timeoutSignal } from "../utils/abort.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
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
  const signal = anySignal([call.signal, timeoutSignal(call.timeoutMs)]);
  const model = call.model ?? env.ANTHROPIC_MODEL;

  const message = await withProviderRetry(
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

  return {
    role: call.role,
    text: textFromMessage(message),
    model,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted && !call.signal.aborted,
  };
};

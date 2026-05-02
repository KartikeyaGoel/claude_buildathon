import OpenAI from "openai";
import { env } from "../config/env.js";
import { anySignal, timeoutSignal } from "../utils/abort.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || "missing-openai-key",
  maxRetries: 0,
});

export const runOpenAI: Provider = async (call: ProviderCall): Promise<ProviderResult> => {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for OpenAI provider");

  const started = Date.now();
  const signal = anySignal([call.signal, timeoutSignal(call.timeoutMs)]);
  const completion = await withProviderRetry(
    `openai:${call.role}`,
    () =>
      openai.chat.completions.create(
        {
          model: env.OPENAI_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: call.system },
            { role: "user", content: call.user },
          ],
        },
        { signal },
      ),
    signal,
  );

  return {
    role: call.role,
    text: completion.choices[0]?.message.content ?? "",
    model: env.OPENAI_MODEL,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted && !call.signal.aborted,
  };
};

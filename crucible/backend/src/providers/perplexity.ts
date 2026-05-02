import { env } from "../config/env.js";
import { anySignal, timeoutSignal } from "../utils/abort.js";
import { withProviderRetry } from "./retry.js";
import type { Provider, ProviderCall, ProviderResult } from "./types.js";

interface PerplexityResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export const runPerplexity: Provider = async (call: ProviderCall): Promise<ProviderResult> => {
  if (!env.PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is required for Perplexity provider");

  const started = Date.now();
  const signal = anySignal([call.signal, timeoutSignal(call.timeoutMs)]);

  const json = await withProviderRetry(
    `perplexity:${call.role}`,
    async () => {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.PERPLEXITY_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: call.system },
            { role: "user", content: call.user },
          ],
        }),
        signal,
      });

      if (!response.ok) {
        const error = new Error(`Perplexity request failed with ${response.status}`);
        (error as Error & { status: number }).status = response.status;
        throw error;
      }

      return (await response.json()) as PerplexityResponse;
    },
    signal,
  );

  return {
    role: call.role,
    text: json.choices?.[0]?.message?.content ?? "",
    model: env.PERPLEXITY_MODEL,
    latencyMs: Date.now() - started,
    timedOut: signal.aborted && !call.signal.aborted,
  };
};

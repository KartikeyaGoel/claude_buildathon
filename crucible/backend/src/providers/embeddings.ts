import OpenAI from "openai";
import { env } from "../config/env.js";
import { withProviderRetry } from "./retry.js";
import type { EmbeddingProvider } from "./types.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || "missing-openai-key",
  maxRetries: 0,
});

export const openAiEmbeddings: EmbeddingProvider = {
  async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for embeddings");

    const response = await withProviderRetry(
      "openai:embedding",
      () =>
        openai.embeddings.create(
          {
            model: env.OPENAI_EMBEDDING_MODEL,
            input: text,
          },
          { signal },
        ),
      signal,
    );

    return response.data[0]?.embedding ?? [];
  },
};

export function toPgVector(values: readonly number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

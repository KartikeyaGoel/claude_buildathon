import type { PipelineStage } from "@crucible/shared";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { env } from "../../config/env.js";
import { anthropic, withRetries } from "../../config/anthropic.js";
import { anySignal, timeoutSignal } from "../../utils/abort.js";

export interface StreamAgentParams {
  system: string;
  messages: MessageParam[];
  signal: AbortSignal;
  stage: PipelineStage;
  onChunk: (chunk: string, stage: PipelineStage) => void;
}

export async function streamAgentCompletion(
  params: StreamAgentParams,
): Promise<string> {
  const { system, messages, signal, stage, onChunk } = params;
  const combined = anySignal([signal, timeoutSignal(120_000)]);

  const stream = await withRetries(
    async () =>
      await anthropic.messages.create(
        {
          model: env.MODEL_ID,
          max_tokens: 8192,
          system,
          messages,
          stream: true,
        },
        { signal: combined },
      ),
    { signal, label: `stream ${stage}` },
  );

  let full = "";
  for await (const event of stream) {
    if (combined.aborted) break;
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta" &&
      "text" in event.delta
    ) {
      const piece = event.delta.text;
      full += piece;
      onChunk(piece, stage);
    }
  }

  if (combined.aborted && !signal.aborted) {
    throw new Error("Anthropic call timed out after 120s");
  }
  return full;
}

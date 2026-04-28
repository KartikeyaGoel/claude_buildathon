import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { FRAMING_SYSTEM_PROMPT } from "../../prompts/framing.prompt.js";
import { streamAgentCompletion } from "./streamCompletion.js";

export async function runFramingInitial(params: {
  decisionText: string;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const { decisionText, signal, onChunk } = params;
  const messages: MessageParam[] = [{ role: "user", content: decisionText }];
  return streamAgentCompletion({
    system: FRAMING_SYSTEM_PROMPT,
    messages,
    signal,
    stage: "framing",
    onChunk: (t) => onChunk(t),
  });
}

export async function runFramingRevision(params: {
  decisionText: string;
  priorFraming: string;
  userFeedback: string;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const { decisionText, priorFraming, userFeedback, signal, onChunk } = params;
  const messages: MessageParam[] = [
    { role: "user", content: decisionText },
    { role: "assistant", content: priorFraming },
    {
      role: "user",
      content: `The user reviewed your framing and provided this feedback:\n\n${userFeedback}\n\nProduce a revised framing following the same structure and requirements as before.`,
    },
  ];
  return streamAgentCompletion({
    system: FRAMING_SYSTEM_PROMPT,
    messages,
    signal,
    stage: "framing",
    onChunk: (t) => onChunk(t),
  });
}

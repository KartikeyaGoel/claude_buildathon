import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ASSUMPTION_SYSTEM_PROMPT } from "../../prompts/assumption.prompt.js";
import { streamAgentCompletion } from "./BaseAgent.js";

function buildUserContent(params: {
  decisionText: string;
  framingText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
}): string {
  const { decisionText, framingText, iteration, previousOutput, graderFeedback } = params;
  let body = `## Decision (user)\n${decisionText}\n\n## Framing (confirmed)\n${framingText}\n\n## Your task\nPerform layered assumption excavation as specified in your system instructions.`;
  if (iteration > 1 && previousOutput != null) {
    body += `\n\n## Previous iteration output\n${previousOutput}\n\n## GRADER FEEDBACK\n${graderFeedback ?? ""}\n\nRevise and strengthen your excavation; address the feedback above. Only the latest feedback applies.`;
  }
  return body;
}

export async function runAssumptionIteration(params: {
  decisionText: string;
  framingText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildUserContent({
        decisionText: params.decisionText,
        framingText: params.framingText,
        iteration: params.iteration,
        previousOutput: params.previousOutput,
        graderFeedback: params.graderFeedback,
      }),
    },
  ];
  return streamAgentCompletion({
    system: ASSUMPTION_SYSTEM_PROMPT,
    messages,
    signal: params.signal,
    stage: "assumption",
    onChunk: (t) => params.onChunk(t),
  });
}

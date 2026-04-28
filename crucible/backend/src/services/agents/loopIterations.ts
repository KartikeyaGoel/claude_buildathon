import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ASSUMPTION_SYSTEM_PROMPT } from "../../prompts/assumption.prompt.js";
import { STEELMAN_SYSTEM_PROMPT } from "../../prompts/steelman.prompt.js";
import { SYNTHESIS_SYSTEM_PROMPT } from "../../prompts/synthesis.prompt.js";
import { streamAgentCompletion } from "./streamCompletion.js";

// --- Assumption

function buildAssumptionUserContent(params: {
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
    { role: "user", content: buildAssumptionUserContent(params) },
  ];
  return streamAgentCompletion({
    system: ASSUMPTION_SYSTEM_PROMPT,
    messages,
    signal: params.signal,
    stage: "assumption",
    onChunk: (t) => params.onChunk(t),
  });
}

// --- Steelman

function buildSteelmanUserContent(params: {
  decisionText: string;
  framingText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
}): string {
  const { decisionText, framingText, iteration, previousOutput, graderFeedback } = params;
  let body = `## Decision (user)\n${decisionText}\n\n## Framing (confirmed)\n${framingText}\n\n## Your task\nProduce the strongest steelman argument as specified in your system instructions. Do not assume you have seen any assumption-excavation output; you have not.`;
  if (iteration > 1 && previousOutput != null) {
    body += `\n\n## Previous iteration output\n${previousOutput}\n\n## GRADER FEEDBACK\n${graderFeedback ?? ""}\n\nStrengthen your steelman; address the feedback above. Only the latest feedback applies.`;
  }
  return body;
}

export async function runSteelmanIteration(params: {
  decisionText: string;
  framingText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const messages: MessageParam[] = [
    { role: "user", content: buildSteelmanUserContent(params) },
  ];
  return streamAgentCompletion({
    system: STEELMAN_SYSTEM_PROMPT,
    messages,
    signal: params.signal,
    stage: "steelman",
    onChunk: (t) => params.onChunk(t),
  });
}

// --- Synthesis

function buildSynthesisUserContent(params: {
  decisionText: string;
  framingText: string;
  assumptionText: string;
  steelmanText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
}): string {
  const {
    decisionText,
    framingText,
    assumptionText,
    steelmanText,
    iteration,
    previousOutput,
    graderFeedback,
  } = params;
  let body = `## Decision (user)\n${decisionText}\n\n## Framing\n${framingText}\n\n## Assumption excavation\n${assumptionText}\n\n## Steelman\n${steelmanText}\n\n## Your task\nProduce the synthesis output in the required format.`;
  if (iteration > 1 && previousOutput != null) {
    body += `\n\n## Previous iteration output\n${previousOutput}\n\n## GRADER FEEDBACK\n${graderFeedback ?? ""}\n\nRevise your synthesis; address the feedback above. Only the latest feedback applies.`;
  }
  return body;
}

export async function runSynthesisIteration(params: {
  decisionText: string;
  framingText: string;
  assumptionText: string;
  steelmanText: string;
  iteration: number;
  previousOutput: string | null;
  graderFeedback: string | null;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const messages: MessageParam[] = [
    { role: "user", content: buildSynthesisUserContent(params) },
  ];
  return streamAgentCompletion({
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages,
    signal: params.signal,
    stage: "synthesis",
    onChunk: (t) => params.onChunk(t),
  });
}

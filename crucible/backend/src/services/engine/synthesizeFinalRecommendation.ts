import { runAnthropic } from "../../providers/anthropic.js";
import { env } from "../../config/env.js";
import type { ProviderResult } from "../../providers/types.js";
import { SYNTHESIS_SYSTEM_PROMPT } from "../../prompts/synthesis.prompt.js";
import type { ScoredAssumption } from "./types.js";

function buildAssumptionText(assumptions: ScoredAssumption[]): string {
  if (assumptions.length === 0) return "No assumptions passed the validity judge.";
  return assumptions
    .map(
      (a, idx) =>
        `${idx + 1}. [${a.type}/${a.domain}] (${a.compositeScore.toFixed(2)}): ${a.text}`,
    )
    .join("\n");
}

function buildAgentOutputText(agentOutputs: ProviderResult[]): string {
  if (agentOutputs.length === 0) return "No raw agent outputs available.";
  return agentOutputs
    .map((output) => `## ${output.role} (${output.model})\n${output.text}`)
    .join("\n\n");
}

function buildSynthesisUserContent(params: {
  decisionText: string;
  framingText: string;
  assumptionText: string;
  steelmanText: string;
  agentOutputText: string;
}): string {
  return `## Submitted source text\n${params.decisionText}\n\n## Framing\n${params.framingText}\n\n## Scored assumption data\n${params.assumptionText}\n\n## Raw agent outputs\n${params.agentOutputText}\n\n## Steelman\n${params.steelmanText}\n\n## Your task\nProduce the synthesis output in the required format.`;
}

export async function synthesizeFinalRecommendation(params: {
  decisionText: string;
  framingText: string;
  assumptions: ScoredAssumption[];
  steelmanText: string;
  agentOutputs?: ProviderResult[];
  signal: AbortSignal;
}): Promise<string> {
  const assumptionText = buildAssumptionText(params.assumptions);
  const agentOutputText = buildAgentOutputText(params.agentOutputs ?? []);
  const user = buildSynthesisUserContent({
    decisionText: params.decisionText,
    framingText: params.framingText,
    assumptionText,
    steelmanText: params.steelmanText,
    agentOutputText,
  });

  const result = await runAnthropic({
    role: "critic",
    system: SYNTHESIS_SYSTEM_PROMPT,
    user,
    model: env.MODEL_ID,
    timeoutMs: 60_000,
    signal: params.signal,
  });

  return result.text;
}


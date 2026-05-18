import { runAnthropic } from "../../providers/anthropic.js";
import { env } from "../../config/env.js";
import type { ProviderResult } from "../../providers/types.js";
import { COGNITIVE_GYM_SYNTHESIS_SYSTEM_PROMPT } from "../../prompts/cognitiveGymSynthesis.prompt.js";
import { SYNTHESIS_SYSTEM_PROMPT } from "../../prompts/synthesis.prompt.js";
import {
  buildAssumptionExcavationSummary,
  isNoPriorPosition,
  parseCognitiveGymSynthesis,
} from "./cognitiveGym.js";
import type { CognitiveGymSynthesis, ScoredAssumption } from "./types.js";

function buildAgentOutputText(agentOutputs: ProviderResult[]): string {
  if (agentOutputs.length === 0) return "No raw agent outputs available.";
  return agentOutputs
    .map((output) => `## ${output.role} (${output.model})\n${output.text}`)
    .join("\n\n");
}

function buildCognitiveGymUserContent(params: {
  decisionText: string;
  userPosition: string;
  framingText: string;
  assumptions: ScoredAssumption[];
  steelmanText: string;
  agentOutputText: string;
}): string {
  const mode = isNoPriorPosition(params.userPosition)
    ? "fresh-approach (no prior position)"
    : "standard (gap analysis against user position)";

  return [
    `## Synthesis mode\n${mode}`,
    "",
    "## User's stated position",
    params.userPosition,
    "",
    "## Submitted source text",
    params.decisionText,
    "",
    "## Framing",
    params.framingText,
    "",
    "## Scored assumption excavation",
    buildAssumptionExcavationSummary(params.assumptions),
    "",
    "## Raw agent outputs",
    params.agentOutputText,
    "",
    "## Steelman",
    params.steelmanText,
    "",
    "## Your task",
    "Return the synthesis JSON in the required format.",
  ].join("\n");
}

function buildLegacyUserContent(params: {
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
  userPosition?: string;
  fallbackDivergence?: number;
  signal: AbortSignal;
}): Promise<string> {
  const agentOutputText = buildAgentOutputText(params.agentOutputs ?? []);
  const useCognitiveGym = Boolean(params.userPosition?.trim());

  if (useCognitiveGym) {
    const user = buildCognitiveGymUserContent({
      decisionText: params.decisionText,
      userPosition: params.userPosition!.trim(),
      framingText: params.framingText,
      assumptions: params.assumptions,
      steelmanText: params.steelmanText,
      agentOutputText,
    });

    const result = await runAnthropic({
      role: "critic",
      system: COGNITIVE_GYM_SYNTHESIS_SYSTEM_PROMPT,
      user,
      model: env.MODEL_ID,
      timeoutMs: 60_000,
      signal: params.signal,
    });

    return result.text;
  }

  const assumptionText = buildAssumptionExcavationSummary(params.assumptions);
  const user = buildLegacyUserContent({
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

export async function synthesizeCognitiveGym(params: {
  decisionText: string;
  userPosition: string;
  framingText: string;
  assumptions: ScoredAssumption[];
  steelmanText: string;
  agentOutputs: ProviderResult[];
  fallbackDivergence: number;
  signal: AbortSignal;
}): Promise<CognitiveGymSynthesis> {
  const raw = await synthesizeFinalRecommendation({
    decisionText: params.decisionText,
    framingText: params.framingText,
    assumptions: params.assumptions,
    steelmanText: params.steelmanText,
    agentOutputs: params.agentOutputs,
    userPosition: params.userPosition,
    fallbackDivergence: params.fallbackDivergence,
    signal: params.signal,
  });

  return parseCognitiveGymSynthesis(raw, params.fallbackDivergence);
}

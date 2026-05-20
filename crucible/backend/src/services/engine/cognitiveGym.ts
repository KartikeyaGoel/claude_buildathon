import type { ProviderResult } from "../../providers/types.js";
import type {
  CognitiveGymPayload,
  CognitiveGymSynthesis,
  DeliberationOnlyPayload,
  DeliberationStage,
  ImplicitAssumptionSurfaced,
  ScoredAssumption,
  TemporalStackResult,
} from "./types.js";

export const NO_PRIOR_POSITION_PHRASE = "no prior position, approaching fresh";

export function isNoPriorPosition(userPosition: string): boolean {
  return userPosition.trim().toLowerCase() === NO_PRIOR_POSITION_PHRASE.toLowerCase();
}

function extractConfidenceFromAgentText(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as { confidence?: unknown };
    const value = Number(parsed.confidence);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
  } catch {
    const match = text.match(/"confidence"\s*:\s*([\d.]+)/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
  }
}

export function computeStageDivergence(agentOutputs: string[]): number {
  if (agentOutputs.length <= 1) return 0;

  const confidences = agentOutputs
    .map(extractConfidenceFromAgentText)
    .filter((value): value is number => value !== null);

  if (confidences.length >= 2) {
    const mean = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
    const variance =
      confidences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / confidences.length;
    return Math.min(1, Math.sqrt(variance) * 2);
  }

  return Math.min(1, (agentOutputs.length / 4) * 0.55);
}

function stageFromOutputs(outputs: string[]): DeliberationStage {
  return {
    agent_outputs: outputs,
    divergence_score: computeStageDivergence(outputs),
  };
}

export function buildDeliberationStages(params: {
  framingText: string;
  agentResults: ProviderResult[];
  negativeSpaceText?: string;
  temporalStackText?: string;
  temporalStacks?: TemporalStackResult[];
}): Pick<
  CognitiveGymPayload,
  "framing" | "assumption_excavation" | "steelman" | "negative_space" | "temporal_stack"
> {
  const excavationRoles = new Set(["advocate", "critic", "blindspot"]);
  const excavationOutputs = params.agentResults
    .filter((result) => excavationRoles.has(result.role))
    .map((result) => result.text);
  const steelmanOutputs = params.agentResults
    .filter((result) => result.role === "steelman")
    .map((result) => result.text);

  const base = {
    framing: stageFromOutputs([params.framingText]),
    assumption_excavation: stageFromOutputs(excavationOutputs),
    steelman: stageFromOutputs(
      steelmanOutputs.length > 0 ? steelmanOutputs : ["No steelman agent output in this run."],
    ),
  };

  if (params.negativeSpaceText?.trim()) {
    return {
      ...base,
      negative_space: stageFromOutputs([params.negativeSpaceText]),
      ...(params.temporalStackText?.trim()
        ? {
            temporal_stack: {
              ...stageFromOutputs([params.temporalStackText]),
              horizons: params.temporalStacks,
            },
          }
        : {}),
    };
  }

  if (params.temporalStackText?.trim()) {
    return {
      ...base,
      temporal_stack: {
        ...stageFromOutputs([params.temporalStackText]),
        horizons: params.temporalStacks,
      },
    };
  }

  return base;
}

function parseImplicitAssumptions(value: unknown): ImplicitAssumptionSurfaced[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const assumption = typeof row.assumption === "string" ? row.assumption : "";
      if (!assumption.length) return null;
      return {
        assumption,
        lens: typeof row.lens === "string" ? row.lens : "selection",
        visibility: typeof row.visibility === "string" ? row.visibility : "implicit",
        why_implicit: typeof row.why_implicit === "string" ? row.why_implicit : "",
        test: typeof row.test === "string" ? row.test : "",
      };
    })
    .filter((row): row is ImplicitAssumptionSurfaced => row !== null);

  return parsed.length > 0 ? parsed : undefined;
}

export function parseCognitiveGymSynthesis(raw: string, fallbackDivergence: number): CognitiveGymSynthesis {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as Partial<CognitiveGymSynthesis>;
    return {
      position_held: typeof parsed.position_held === "string" ? parsed.position_held : trimmed,
      position_cracked: typeof parsed.position_cracked === "string" ? parsed.position_cracked : "",
      position_missed: typeof parsed.position_missed === "string" ? parsed.position_missed : "",
      overall_confidence:
        typeof parsed.overall_confidence === "number" && Number.isFinite(parsed.overall_confidence)
          ? Math.max(0, Math.min(1, parsed.overall_confidence))
          : 0.5,
      overall_divergence:
        typeof parsed.overall_divergence === "number" && Number.isFinite(parsed.overall_divergence)
          ? Math.max(0, Math.min(1, parsed.overall_divergence))
          : fallbackDivergence,
      implicit_assumptions_surfaced: parseImplicitAssumptions(parsed.implicit_assumptions_surfaced),
    };
  } catch {
    return {
      position_held: trimmed,
      position_cracked: "",
      position_missed: "",
      overall_confidence: 0.5,
      overall_divergence: fallbackDivergence,
    };
  }
}

export function formatSynthesisText(synthesis: CognitiveGymSynthesis): string {
  const lines = [
    "POSITION HELD:",
    synthesis.position_held,
    "",
    "POSITION CRACKED:",
    synthesis.position_cracked,
    "",
    "POSITION MISSED:",
    synthesis.position_missed,
    "",
    `OVERALL CONFIDENCE: ${(synthesis.overall_confidence * 100).toFixed(0)}%`,
    `OVERALL DIVERGENCE: ${(synthesis.overall_divergence * 100).toFixed(0)}%`,
  ];

  if (synthesis.implicit_assumptions_surfaced?.length) {
    lines.push("", "IMPLICIT ASSUMPTIONS SURFACED:");
    synthesis.implicit_assumptions_surfaced.forEach((row, index) => {
      lines.push(
        `${index + 1}. [${row.visibility}/${row.lens}] ${row.assumption}`,
        `   Why implicit: ${row.why_implicit}`,
        `   Test: ${row.test}`,
      );
    });
  }

  return lines.join("\n");
}

export function buildDeliberationOnlyPayload(params: {
  userPosition: string;
  framingText: string;
  agentResults: ProviderResult[];
  negativeSpaceText?: string;
  temporalStackText?: string;
  temporalStacks?: TemporalStackResult[];
}): DeliberationOnlyPayload {
  const stages = buildDeliberationStages({
    framingText: params.framingText,
    agentResults: params.agentResults,
    negativeSpaceText: params.negativeSpaceText,
    temporalStackText: params.temporalStackText,
    temporalStacks: params.temporalStacks,
  });

  return {
    ...stages,
    user_position_echo: params.userPosition,
  };
}

export function buildCognitiveGymPayload(params: {
  userPosition: string;
  framingText: string;
  agentResults: ProviderResult[];
  synthesis: CognitiveGymSynthesis;
  negativeSpaceText?: string;
  temporalStackText?: string;
  temporalStacks?: TemporalStackResult[];
}): CognitiveGymPayload {
  const stages = buildDeliberationStages({
    framingText: params.framingText,
    agentResults: params.agentResults,
    negativeSpaceText: params.negativeSpaceText,
    temporalStackText: params.temporalStackText,
    temporalStacks: params.temporalStacks,
  });

  return {
    ...stages,
    synthesis: params.synthesis,
    user_position_echo: params.userPosition,
  };
}

export function buildAssumptionExcavationSummary(assumptions: ScoredAssumption[]): string {
  if (assumptions.length === 0) return "No assumptions passed the validity judge.";
  return assumptions
    .map((assumption, index) => {
      const tags = [
        assumption.visibility ? `vis:${assumption.visibility}` : null,
        assumption.lens ? `lens:${assumption.lens}` : null,
        assumption.load_bearing ? "load-bearing" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const tagSuffix = tags ? ` {${tags}}` : "";
      return `${index + 1}. [${assumption.type}] (${assumption.compositeScore.toFixed(2)})${tagSuffix}: ${assumption.text}`;
    })
    .join("\n");
}

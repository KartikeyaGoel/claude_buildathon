import { env } from "../../config/env.js";
import { runAnthropic } from "../../providers/anthropic.js";
import type { AgentRole, ProviderResult } from "../../providers/types.js";
import { parseTaxonomyFromRaw, passesValidityJudgeFilter } from "./assumptionTaxonomy.js";
import { assertNotCancelled, MODEL_TIMEOUT_MS } from "../../utils/pipelineCancel.js";
import { VALIDITY_JUDGE_SYSTEM_PROMPT, wrapInterrogationContent } from "./prompts.js";
import type { ScoredAssumption } from "./types.js";

interface RawJudgeAssumption {
  text?: unknown;
  assumption_text?: unknown;
  type?: unknown;
  assumption_type?: unknown;
  domain?: unknown;
  validity?: unknown;
  consequence?: unknown;
  novelty?: unknown;
  composite_score?: unknown;
  visibility?: unknown;
  lens?: unknown;
  load_bearing?: unknown;
  sourceModels?: unknown;
  models_that_flagged?: unknown;
  cross_model_agreement?: unknown;
}

interface RawJudgeResponse {
  assumptions?: RawJudgeAssumption[];
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function extractJsonFromText(text: string): unknown | null {
  const raw = text.trim();

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch?.[0]) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      return null;
    }
  }

  return null;
}

function sourceModels(value: unknown): AgentRole[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<AgentRole>(["advocate", "critic", "steelman", "blindspot"]);
  return value.filter((item): item is AgentRole => typeof item === "string" && allowed.has(item as AgentRole));
}

export function mapRawJudgeAssumption(raw: RawJudgeAssumption): ScoredAssumption | null {
  const validity = clampScore(raw.validity);
  const consequence = clampScore(raw.consequence);
  const novelty = clampScore(raw.novelty);
  const computedComposite = validity * 0.3 + consequence * 0.4 + novelty * 0.3;
  const compositeScore = raw.composite_score == null ? computedComposite : clampScore(raw.composite_score);
  const models = sourceModels(raw.sourceModels ?? raw.models_that_flagged);
  const text =
    typeof raw.text === "string"
      ? raw.text
      : typeof raw.assumption_text === "string"
        ? raw.assumption_text
        : "";

  if (!text.length) return null;

  const taxonomy = parseTaxonomyFromRaw(raw as Record<string, unknown>);
  const assumption: ScoredAssumption = {
    text,
    type:
      typeof raw.type === "string"
        ? raw.type
        : typeof raw.assumption_type === "string"
          ? raw.assumption_type
          : "unknown",
    domain: typeof raw.domain === "string" ? raw.domain : "general",
    validity,
    consequence,
    novelty,
    compositeScore,
    sourceModels: models,
    crossModelAgreement: clampScore(raw.cross_model_agreement ?? models.length / 4),
    ...taxonomy,
  };

  return passesValidityJudgeFilter(assumption) ? assumption : null;
}

export async function judgeAssumptions(
  agentOutputs: ProviderResult[],
  cancel?: AbortSignal,
  userPosition?: string,
): Promise<ScoredAssumption[]> {
  assertNotCancelled(cancel);
  const payload = JSON.stringify(
    agentOutputs.map((output) => ({
      role: output.role,
      model: output.model,
      text: output.text,
    })),
  );

  const wrappedPayload = userPosition?.trim()
    ? `${payload}\n\nUser position to stress-test against agent outputs:\n${userPosition.trim()}`
    : payload;

  const result = await runAnthropic({
    role: "critic",
    system: VALIDITY_JUDGE_SYSTEM_PROMPT,
    user: wrapInterrogationContent(wrappedPayload),
    model: env.ANTHROPIC_MODEL,
    timeoutMs: MODEL_TIMEOUT_MS,
  });

  const extracted = extractJsonFromText(result.text);
  if (!extracted) {
    console.warn("[validityJudge] Failed to parse JSON; returning no assumptions");
    return [];
  }

  const parsed = extracted as RawJudgeResponse;
  const rawAssumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions : [];

  return rawAssumptions
    .map((raw) => mapRawJudgeAssumption(raw))
    .filter((assumption): assumption is ScoredAssumption => assumption !== null);
}

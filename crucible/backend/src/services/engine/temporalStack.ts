import { env } from "../../config/env.js";
import { runAnthropic } from "../../providers/anthropic.js";
import { TEMPORAL_STACK_SYSTEM_PROMPT } from "../../prompts/temporalStack.prompt.js";
import type { ScoredAssumption, TemporalStackResult } from "./types.js";
import { assertNotCancelled, MODEL_TIMEOUT_MS } from "../../utils/pipelineCancel.js";
import { wrapInterrogationContent } from "./prompts.js";

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

function clampDivergence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const HORIZONS = new Set(["90d", "2yr", "10yr"]);

export function parseTemporalStackResponse(
  text: string,
  sourceAssumptions: ScoredAssumption[],
): TemporalStackResult[] {
  const extracted = extractJsonFromText(text);
  if (!extracted || typeof extracted !== "object") {
    return fallbackTemporalStacks(sourceAssumptions);
  }

  const stacks = (extracted as { stacks?: unknown }).stacks;
  if (!Array.isArray(stacks)) {
    return fallbackTemporalStacks(sourceAssumptions);
  }

  return stacks
    .map((entry): TemporalStackResult | null => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const source = typeof raw.source_assumption === "string" ? raw.source_assumption : "";
      const variantsRaw = Array.isArray(raw.variants) ? raw.variants : [];
      const variants = variantsRaw
        .map((v) => {
          if (!v || typeof v !== "object") return null;
          const row = v as Record<string, unknown>;
          const horizon = typeof row.horizon === "string" ? row.horizon : "";
          if (!HORIZONS.has(horizon)) return null;
          return {
            horizon: horizon as "90d" | "2yr" | "10yr",
            assumption_variant: typeof row.assumption_variant === "string" ? row.assumption_variant : "",
            divergence_from_present: clampDivergence(row.divergence_from_present),
            rationale: typeof row.rationale === "string" ? row.rationale : "",
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null && v.assumption_variant.length > 0);

      if (!source.length || variants.length === 0) return null;

      const maxFromVariants = Math.max(...variants.map((v) => v.divergence_from_present));
      const max_divergence =
        raw.max_divergence == null ? maxFromVariants : Math.max(maxFromVariants, clampDivergence(raw.max_divergence));

      return { source_assumption: source, variants, max_divergence };
    })
    .filter((row): row is TemporalStackResult => row !== null);
}

function fallbackTemporalStacks(assumptions: ScoredAssumption[]): TemporalStackResult[] {
  return assumptions.slice(0, 3).map((assumption) => ({
    source_assumption: assumption.text,
    variants: [
      {
        horizon: "90d" as const,
        assumption_variant: assumption.text,
        divergence_from_present: 0.1,
        rationale: "Temporal stack parse fallback — near-term framing unchanged.",
      },
    ],
    max_divergence: 0.1,
  }));
}

/** Run temporal stack against free-text excavation output (UI pipeline). */
export async function runTemporalStackFromText(params: {
  content: string;
  framingText: string;
  assumptionText: string;
  cancel?: AbortSignal;
}): Promise<{ text: string; stacks: TemporalStackResult[] }> {
  assertNotCancelled(params.cancel);

  const pseudoAssumptions: ScoredAssumption[] = params.assumptionText
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 20)
    .slice(0, 5)
    .map((text) => ({
      text,
      type: "unknown",
      domain: "general",
      validity: 0.5,
      consequence: 0.5,
      novelty: 0.5,
      compositeScore: 0.5,
      sourceModels: [] as ScoredAssumption["sourceModels"],
    }));

  if (pseudoAssumptions.length === 0) {
    return {
      text: "Insufficient structured assumptions for temporal stack.",
      stacks: [],
    };
  }

  return runTemporalStackPass({
    content: params.content,
    framingText: params.framingText,
    assumptions: pseudoAssumptions,
    cancel: params.cancel,
  });
}

export async function runTemporalStackPass(params: {
  content: string;
  framingText: string;
  assumptions: ScoredAssumption[];
  cancel?: AbortSignal;
}): Promise<{ text: string; stacks: TemporalStackResult[] }> {
  assertNotCancelled(params.cancel);

  const top = params.assumptions
    .slice()
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 5);

  if (top.length === 0) {
    return { text: "No assumptions available for temporal stack.", stacks: [] };
  }

  const payload = JSON.stringify(
    top.map((a) => ({
      text: a.text,
      type: a.type,
      visibility: a.visibility,
      lens: a.lens,
      load_bearing: a.load_bearing,
    })),
  );

  const user = wrapInterrogationContent(
    `## Decision context\n${params.content}\n\n## Framing\n${params.framingText}\n\n## Assumptions to temporalize\n${payload}`,
  );

  const result = await runAnthropic({
    role: "critic",
    system: TEMPORAL_STACK_SYSTEM_PROMPT,
    user,
    model: env.TEMPORAL_MODEL,
    timeoutMs: MODEL_TIMEOUT_MS,
  });

  const stacks = parseTemporalStackResponse(result.text, top);
  return { text: result.text, stacks };
}

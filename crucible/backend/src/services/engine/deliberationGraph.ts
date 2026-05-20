import { randomUUID } from "node:crypto";
import type { AgentRole } from "../../providers/types.js";
import type { ScoredAssumption } from "./types.js";

const ALL_ROLES: AgentRole[] = ["advocate", "critic", "steelman", "blindspot"];

/** Normalize scoring fields for persistence and graph building. */
export function enrichAssumption(assumption: ScoredAssumption): ScoredAssumption {
  const sourceSet = new Set(assumption.sourceModels);
  const modelsAccepting = ALL_ROLES.filter((role) => !sourceSet.has(role));
  return {
    ...assumption,
    id: assumption.id ?? randomUUID(),
    modelsAccepting,
    crossModelAgreement: assumption.sourceModels.length / ALL_ROLES.length,
  };
}

const AER_ASSUMPTION_TYPES = new Set([
  "empirical",
  "causal",
  "normative",
  "strategic",
  "predictive",
  "unknown",
]);

/** Maps judge output to CHECK constraint on assumption_extraction_records.assumption_type */
export function sanitizeAssumptionType(t: string): string {
  return AER_ASSUMPTION_TYPES.has(t) ? t : "unknown";
}

/**
 * Derives a lightweight argument graph from scored assumptions + optional synthesis.
 * Edge types align with deliberation trace conventions (supports, qualifies, depends-on).
 */
function stableAssumptionId(assumption: ScoredAssumption, index: number): string {
  return assumption.id ?? `assumption-${index}`;
}

export function buildDeliberationGraphJson(params: {
  assumptions: ScoredAssumption[];
  synthesisText?: string;
}): { nodes: unknown[]; edges: unknown[] } {
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const synthId = "synthesis-root";

  if (params.synthesisText?.trim()) {
    nodes.push({
      id: synthId,
      type: "strategic",
      text: params.synthesisText.trim().slice(0, 50_000),
      metadata: {
        node_role: "synthesis",
        generated: true,
      },
    });
  }

  params.assumptions.forEach((assumption, index) => {
    const id = stableAssumptionId(assumption, index);
    nodes.push({
      id,
      type: sanitizeAssumptionType(assumption.type),
      text: assumption.text,
      metadata: {
        node_role: "assumption",
        source_models: assumption.sourceModels,
        models_accepting: assumption.modelsAccepting ?? [],
        cross_model_agreement: assumption.crossModelAgreement ?? 0,
        validity: assumption.validity,
        consequence: assumption.consequence,
        novelty: assumption.novelty,
        composite_score: assumption.compositeScore,
        canonical_id: assumption.canonicalId ?? null,
        visibility: assumption.visibility ?? null,
        lens: assumption.lens ?? null,
        load_bearing: assumption.load_bearing ?? null,
      },
    });

    if (params.synthesisText?.trim()) {
      edges.push({
        from: id,
        to: synthId,
        type: "supports",
        confidence: Math.max(0, Math.min(1, assumption.compositeScore)),
        metadata: { basis: "assumption_to_synthesis" },
      });
    }
  });

  const byConsequence = [...params.assumptions]
    .map((assumption, index) => ({ assumption, index }))
    .sort((a, b) => b.assumption.consequence - a.assumption.consequence);
  const first = byConsequence[0];
  const secondEntry = byConsequence[1];
  if (
    first &&
    secondEntry &&
    first.assumption.consequence >= 0.35 &&
    secondEntry.assumption.consequence >= 0.25
  ) {
    const fromId = stableAssumptionId(first.assumption, first.index);
    const toId = stableAssumptionId(secondEntry.assumption, secondEntry.index);
    if (fromId !== toId) {
      edges.push({
        from: fromId,
        to: toId,
        type: "qualifies",
        confidence: Math.min(first.assumption.compositeScore, secondEntry.assumption.compositeScore),
        metadata: { basis: "top_consequence_pair" },
      });
    }
  }

  return { nodes, edges };
}

/** Single scalar relevance for AER.relevance_score (no separate model output today). */
export function relevanceFromAssumption(assumption: ScoredAssumption): number {
  const v = (assumption.validity + assumption.consequence + assumption.novelty) / 3;
  return Math.max(0, Math.min(1, v));
}

export function claimTypeDistribution(assumptions: ScoredAssumption[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const assumption of assumptions) {
    const t = sanitizeAssumptionType(assumption.type);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].map(([type, count]) => [type, count / Math.max(assumptions.length, 1)]),
  );
}

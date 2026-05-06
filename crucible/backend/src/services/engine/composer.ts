import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { withTransaction } from "../../db/client.js";
import type { AgentRole, ProviderResult } from "../../providers/types.js";
import { contentHash } from "../../utils/crypto.js";
import { dispatchWebhook } from "../../webhooks/dispatcher.js";
import { canonicalizeAssumption } from "./canonicalize.js";
import type { AuthenticatedUser, GateResult, InterrogationResponse, ScoredAssumption } from "./types.js";

interface IdRow extends QueryResultRow {
  id: string;
}

function divergenceScore(results: ProviderResult[], assumptions: ScoredAssumption[]): number {
  const uniqueSources = new Set(results.map((result) => result.role));
  const averageConsequence =
    assumptions.reduce((sum, assumption) => sum + assumption.consequence, 0) / Math.max(assumptions.length, 1);
  return Math.min(1, (uniqueSources.size / 4) * 0.4 + averageConsequence * 0.6);
}

function reliabilitySignal(score: number, degradedAgents: AgentRole[]): InterrogationResponse["reliability_signal"] {
  if (degradedAgents.length > 0) return "contested";
  if (score >= 0.75) return "low";
  if (score >= 0.45) return "moderate";
  return "high";
}

const ALL_ROLES: AgentRole[] = ["advocate", "critic", "steelman", "blindspot"];

function enrichAssumption(assumption: ScoredAssumption): ScoredAssumption {
  const sourceSet = new Set(assumption.sourceModels);
  const modelsAccepting = ALL_ROLES.filter((role) => !sourceSet.has(role));
  return {
    ...assumption,
    id: assumption.id ?? randomUUID(),
    modelsAccepting,
    crossModelAgreement: assumption.sourceModels.length / ALL_ROLES.length,
  };
}

function claimTypeDistribution(assumptions: ScoredAssumption[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const assumption of assumptions) counts.set(assumption.type, (counts.get(assumption.type) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].map(([type, count]) => [type, count / Math.max(assumptions.length, 1)]),
  );
}

export async function composeAndPersist(params: {
  user: AuthenticatedUser;
  content: string;
  domain: string;
  originatingModel: string;
  sessionId?: string;
  source: "api" | "mcp";
  gate: GateResult;
  agentResults: ProviderResult[];
  degradedAgents: AgentRole[];
  assumptions: ScoredAssumption[];
  synthesisText?: string;
  signal?: AbortSignal;
}): Promise<InterrogationResponse> {
  const enriched = params.assumptions.map(enrichAssumption);
  const canonicalized = await Promise.all(
    enriched.map(async (assumption) => {
      try {
        const result = await canonicalizeAssumption(assumption, params.signal);
        return { assumption: { ...assumption, canonicalId: result.canonicalId }, embedding: result.embedding };
      } catch (error) {
        console.warn("[engine] canonicalization skipped", error);
        return { assumption, embedding: null };
      }
    }),
  );

  const score = divergenceScore(params.agentResults, enriched);
  const signal = reliabilitySignal(score, params.degradedAgents);
  const traceId = randomUUID();

  const response: InterrogationResponse = {
    interrogation_id: "",
    trace_id: traceId,
    divergence_score: score,
    reliability_signal: signal,
    assumptions: canonicalized.map((entry) => entry.assumption),
    divergence_details: {
      agent_count: params.agentResults.length,
      surfaced_assumption_count: enriched.length,
      model_agreement_map: Object.fromEntries(
        canonicalized.map((entry) => [
          entry.assumption.id,
          {
            models_flagging: entry.assumption.sourceModels,
            models_accepting: entry.assumption.modelsAccepting ?? [],
            cross_model_agreement: entry.assumption.crossModelAgreement ?? 0,
          },
        ]),
      ),
    },
    ...(params.synthesisText ? { synthesis_text: params.synthesisText } : {}),
    metadata: {
      cached: false,
      originating_model: params.originatingModel,
      domain: params.domain,
      execution_time_ms: Math.max(...params.agentResults.map((result) => result.latencyMs), 0),
      agents_completed: params.agentResults.length,
      degraded_agents: params.degradedAgents,
      model_outputs: params.agentResults.map((result) => ({
        role: result.role,
        model: result.model,
        latencyMs: result.latencyMs,
      })),
    },
  };

  const persisted = await withTransaction(async (client: PoolClient) => {
    const icr = await client.query<IdRow>(
      "INSERT INTO interrogation_context_records (user_id, trace_id, content_hash, originating_model, domain_tag, claim_type_distribution, raw_content, source, session_id, gate_stage1_passed, gate_stage2_passed, gate_reason) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12) RETURNING id",
      [
        params.user.id,
        traceId,
        contentHash(params.content),
        params.originatingModel,
        params.domain,
        JSON.stringify(claimTypeDistribution(enriched)),
        params.content,
        params.source,
        params.sessionId ?? null,
        params.gate.stage1Passed,
        params.gate.stage2Passed,
        params.gate.reason,
      ],
    );
    const icrId = icr.rows[0]!.id;

    const dt = await client.query<IdRow>(
      "INSERT INTO deliberation_traces (icr_id, graph_json, model_agreement_map, validity_scores, agent_outputs, validity_judgement, divergence_score, reliability_signal, degraded_agents, cached) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, false) RETURNING id",
      [
        icrId,
        JSON.stringify({ nodes: [], edges: [] }),
        JSON.stringify(response.divergence_details.model_agreement_map ?? {}),
        JSON.stringify({ assumptions: response.assumptions }),
        JSON.stringify(params.agentResults),
        JSON.stringify({ assumptions: response.assumptions }),
        response.divergence_score,
        response.reliability_signal,
        params.degradedAgents,
      ],
    );
    const dtId = dt.rows[0]!.id;

    for (const entry of canonicalized) {
      await client.query(
        "INSERT INTO assumption_extraction_records (dt_id, icr_id, user_id, canonical_id, raw_text, assumption_type, domain_cluster, models_flagging, models_accepting, cross_model_agreement_score, validity_score, consequence_score, novelty_score, relevance_score, composite_score, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, $15::vector)",
        [
          dtId,
          icrId,
          params.user.id,
          entry.assumption.canonicalId ?? null,
          entry.assumption.text,
          entry.assumption.type,
          entry.assumption.domain,
          entry.assumption.sourceModels,
          entry.assumption.modelsAccepting ?? [],
          entry.assumption.crossModelAgreement ?? 0,
          entry.assumption.validity,
          entry.assumption.consequence,
          entry.assumption.novelty,
          entry.assumption.compositeScore,
          entry.embedding,
        ],
      );
    }

    await client.query(
      "INSERT INTO tier2_watches (icr_id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')",
      [icrId, params.user.id],
    );

    return icrId;
  });

  const finalResponse = {
    ...response,
    interrogation_id: persisted,
  };

  for (const assumption of finalResponse.assumptions) {
    if (assumption.compositeScore > 0.8) {
      void dispatchWebhook(params.user.id, "high_consequence_flag", {
        trace_id: finalResponse.trace_id,
        assumption_text: assumption.text,
        composite_score: assumption.compositeScore,
        recommendation: "review_before_proceeding",
      });
    }
  }

  return finalResponse;
}

import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { withTransaction } from "../../db/client.js";
import type { AgentRole, ProviderResult } from "../../providers/types.js";
import { hashInterrogationContent } from "./cache.js";
import { dispatchWebhook } from "../../webhooks/dispatcher.js";
import { canonicalizeAssumption } from "./canonicalize.js";
import {
  buildDeliberationGraphJson,
  claimTypeDistribution,
  enrichAssumption,
  relevanceFromAssumption,
  sanitizeAssumptionType,
} from "./deliberationGraph.js";
import type {
  AuthenticatedUser,
  CognitiveGymPayload,
  GateResult,
  InterrogationResponse,
  PipelineAmplificationMeta,
  ScoredAssumption,
} from "./types.js";

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

export async function composeAndPersist(params: {
  user: AuthenticatedUser;
  content: string;
  userPosition?: string;
  domain: string;
  originatingModel: string;
  sessionId?: string;
  source: "api" | "mcp";
  gate: GateResult;
  agentResults: ProviderResult[];
  degradedAgents: AgentRole[];
  assumptions: ScoredAssumption[];
  synthesisText?: string;
  cognitiveGym?: CognitiveGymPayload;
  framingText?: string;
  pipelineAmplification?: PipelineAmplificationMeta;
  cancel?: AbortSignal;
}): Promise<InterrogationResponse> {
  const enriched = params.assumptions.map(enrichAssumption);
  const canonicalized = await Promise.all(
    enriched.map(async (assumption) => {
      try {
        const result = await canonicalizeAssumption(assumption, params.cancel);
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
    ...(params.cognitiveGym ? { cognitive_gym: params.cognitiveGym } : {}),
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

  const graphAssumptions = canonicalized.map((entry) => entry.assumption);
  const graphJson = buildDeliberationGraphJson({
    assumptions: graphAssumptions,
    synthesisText: params.synthesisText,
  });

  const persisted = await withTransaction(async (client: PoolClient) => {
    const icr = await client.query<IdRow>(
      "INSERT INTO interrogation_context_records (user_id, trace_id, content_hash, originating_model, domain_tag, claim_type_distribution, raw_content, source, session_id, gate_stage1_passed, gate_stage2_passed, gate_reason, user_position) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13) RETURNING id",
      [
        params.user.id,
        traceId,
        hashInterrogationContent(params.content, params.userPosition),
        params.originatingModel,
        params.domain,
        JSON.stringify(claimTypeDistribution(enriched)),
        params.content,
        params.source,
        params.sessionId ?? null,
        params.gate.stage1Passed,
        params.gate.stage2Passed,
        params.gate.reason,
        params.userPosition ?? null,
      ],
    );
    const icrId = icr.rows[0]!.id;

    const dt = await client.query<IdRow>(
      "INSERT INTO deliberation_traces (icr_id, graph_json, model_agreement_map, validity_scores, agent_outputs, validity_judgement, divergence_score, reliability_signal, degraded_agents, cached, pipeline_amplification) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, false, $10::jsonb) RETURNING id",
      [
        icrId,
        JSON.stringify(graphJson),
        JSON.stringify(response.divergence_details.model_agreement_map ?? {}),
        JSON.stringify({ assumptions: response.assumptions }),
        JSON.stringify(params.agentResults),
        JSON.stringify({ assumptions: response.assumptions }),
        response.divergence_score,
        response.reliability_signal,
        params.degradedAgents,
        JSON.stringify({
          ...(params.pipelineAmplification ?? {}),
          framing_text: params.framingText ?? params.gate.reason,
        }),
      ],
    );
    const dtId = dt.rows[0]!.id;

    for (const entry of canonicalized) {
      await client.query(
        "INSERT INTO assumption_extraction_records (dt_id, icr_id, user_id, canonical_id, raw_text, assumption_type, domain_cluster, models_flagging, models_accepting, cross_model_agreement_score, validity_score, consequence_score, novelty_score, relevance_score, composite_score, embedding, visibility, lens, load_bearing) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::vector, $17, $18, $19)",
        [
          dtId,
          icrId,
          params.user.id,
          entry.assumption.canonicalId ?? null,
          entry.assumption.text,
          sanitizeAssumptionType(entry.assumption.type),
          entry.assumption.domain,
          entry.assumption.sourceModels,
          entry.assumption.modelsAccepting ?? [],
          entry.assumption.crossModelAgreement ?? 0,
          entry.assumption.validity,
          entry.assumption.consequence,
          entry.assumption.novelty,
          relevanceFromAssumption(entry.assumption),
          entry.assumption.compositeScore,
          entry.embedding,
          entry.assumption.visibility ?? null,
          entry.assumption.lens ?? null,
          entry.assumption.load_bearing ?? null,
        ],
      );
    }

    await client.query(
      "INSERT INTO tier2_watches (icr_id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')",
      [icrId, params.user.id],
    );

    await client.query(
      "INSERT INTO resolution_artifacts (icr_id, user_id, decision, outcome, confidence, tier2_followthrough, metadata) VALUES ($1, $2, 'pipeline_completed', NULL, NULL, false, $3::jsonb)",
      [
        icrId,
        params.user.id,
        JSON.stringify({
          phase: params.pipelineAmplification?.defer_synthesis ? "deliberation_only" : "automatic",
          assumption_count: enriched.length,
          agents_completed: params.agentResults.length,
          execution_time_ms: response.metadata.execution_time_ms,
          degraded_agents: params.degradedAgents,
          synthesis_present: Boolean(params.synthesisText?.trim()),
          cognitive_gym: Boolean(params.cognitiveGym),
          user_position_present: Boolean(params.userPosition?.trim()),
        }),
      ],
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

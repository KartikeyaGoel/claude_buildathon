import type { PoolClient, QueryResultRow } from "pg";
import { env } from "../../config/env.js";
import { query, withTransaction } from "../../db/client.js";
import type { AgentRole } from "../../providers/types.js";
import { contentHash } from "../../utils/crypto.js";
import {
  buildDeliberationGraphJson,
  claimTypeDistribution,
  enrichAssumption,
  relevanceFromAssumption,
  sanitizeAssumptionType,
} from "./deliberationGraph.js";
import type { AuthenticatedUser, InterrogationResponse } from "./types.js";

interface CacheRow {
  content_hash: string;
  response_json: InterrogationResponse;
}

interface IdRow extends QueryResultRow {
  id: string;
}

const CACHE_KEY_VERSION = "interrogation:v2";

export function hashInterrogationContent(content: string, userPosition?: string): string {
  const positionSuffix = userPosition?.trim() ? `\n\n__user_position__\n${userPosition.trim()}` : "";
  return contentHash(`${CACHE_KEY_VERSION}\n\n${content}${positionSuffix}`);
}

export async function getCachedResponse(
  content: string,
  domain: string,
  originatingModel: string,
  userPosition?: string,
): Promise<InterrogationResponse | null> {
  const hash = hashInterrogationContent(content, userPosition);
  const result = await query<CacheRow>(
    "SELECT content_hash, response_json FROM interrogation_cache WHERE content_hash = $1 AND domain_tag = $2 AND originating_model = $3 AND expires_at > now()",
    [hash, domain, originatingModel],
  );
  const row = result.rows[0];
  if (!row) return null;

  await query(
    "UPDATE interrogation_cache SET hit_count = hit_count + 1, updated_at = now() WHERE content_hash = $1 AND domain_tag = $2 AND originating_model = $3",
    [row.content_hash, domain, originatingModel],
  );

  return {
    ...row.response_json,
    metadata: {
      ...row.response_json.metadata,
      cached: true,
    },
  };
}

export async function recordCacheHit(params: {
  user: AuthenticatedUser;
  content: string;
  domain: string;
  originatingModel: string;
  sessionId?: string;
  source: "api" | "mcp";
  response: InterrogationResponse;
  userPosition?: string;
}): Promise<{ interrogationId: string; traceId: string }> {
  const enriched = params.response.assumptions.map(enrichAssumption);
  const traceId = `${params.response.trace_id}:cache:${Date.now()}`;
  const graphJson = buildDeliberationGraphJson({
    assumptions: enriched,
    synthesisText: params.response.synthesis_text,
  });
  const degradedAgents = (params.response.metadata.degraded_agents ?? []) as AgentRole[];
  const modelAgreementMap = (params.response.divergence_details?.model_agreement_map ?? {}) as Record<
    string,
    unknown
  >;
  const agentOutputsPayload = {
    cache_hit: true,
    model_outputs: params.response.metadata.model_outputs,
  };

  return withTransaction(async (client: PoolClient) => {
    const icr = await client.query<IdRow>(
      "INSERT INTO interrogation_context_records (user_id, trace_id, content_hash, originating_model, domain_tag, claim_type_distribution, raw_content, source, session_id, cache_hit, gate_stage1_passed, gate_stage2_passed, gate_reason, user_position) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, true, true, true, 'cache_hit', $10) RETURNING id",
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
        params.userPosition ?? null,
      ],
    );
    const icrId = icr.rows[0]!.id;

    const dt = await client.query<IdRow>(
      "INSERT INTO deliberation_traces (icr_id, graph_json, model_agreement_map, validity_scores, agent_outputs, validity_judgement, divergence_score, reliability_signal, degraded_agents, cached) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, true) RETURNING id",
      [
        icrId,
        JSON.stringify(graphJson),
        JSON.stringify(modelAgreementMap),
        JSON.stringify({ assumptions: enriched }),
        JSON.stringify(agentOutputsPayload),
        JSON.stringify({ assumptions: enriched }),
        params.response.divergence_score,
        params.response.reliability_signal,
        degradedAgents,
      ],
    );
    const dtId = dt.rows[0]!.id;

    for (const assumption of enriched) {
      await client.query(
        "INSERT INTO assumption_extraction_records (dt_id, icr_id, user_id, canonical_id, raw_text, assumption_type, domain_cluster, models_flagging, models_accepting, cross_model_agreement_score, validity_score, consequence_score, novelty_score, relevance_score, composite_score, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::vector)",
        [
          dtId,
          icrId,
          params.user.id,
          assumption.canonicalId ?? null,
          assumption.text,
          sanitizeAssumptionType(assumption.type),
          assumption.domain,
          assumption.sourceModels,
          assumption.modelsAccepting ?? [],
          assumption.crossModelAgreement ?? 0,
          assumption.validity,
          assumption.consequence,
          assumption.novelty,
          relevanceFromAssumption(assumption),
          assumption.compositeScore,
          null,
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
          phase: "automatic",
          cache_hit: true,
          source_trace_id: params.response.trace_id,
          assumption_count: enriched.length,
          agents_completed: params.response.metadata.agents_completed,
          execution_time_ms: params.response.metadata.execution_time_ms,
          degraded_agents: degradedAgents,
          synthesis_present: Boolean(params.response.synthesis_text?.trim()),
        }),
      ],
    );

    return { interrogationId: icrId, traceId };
  });
}

export async function putCachedResponse(
  content: string,
  domain: string,
  originatingModel: string,
  traceId: string,
  response: InterrogationResponse,
  userPosition?: string,
): Promise<void> {
  await query(
    "INSERT INTO interrogation_cache (content_hash, domain_tag, originating_model, dt_id, response_json, cached_dt_json, expires_at) SELECT $1, $2, $3, dt.id, $4::jsonb, $4::jsonb, now() + ($5 || ' hours')::interval FROM deliberation_traces dt JOIN interrogation_context_records icr ON icr.id = dt.icr_id WHERE icr.trace_id = $6 ON CONFLICT (content_hash, domain_tag, originating_model) DO UPDATE SET response_json = EXCLUDED.response_json, cached_dt_json = EXCLUDED.cached_dt_json, expires_at = EXCLUDED.expires_at, updated_at = now()",
    [
      hashInterrogationContent(content, userPosition),
      domain,
      originatingModel,
      JSON.stringify(response),
      env.CACHE_TTL_HOURS,
      traceId,
    ],
  );
}

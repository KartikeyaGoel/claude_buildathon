import { env } from "../../config/env.js";
import { query } from "../../db/client.js";
import { contentHash } from "../../utils/crypto.js";
import type { AuthenticatedUser, InterrogationResponse } from "./types.js";

interface CacheRow {
  content_hash: string;
  response_json: InterrogationResponse;
}

export function hashInterrogationContent(content: string): string {
  return contentHash(content);
}

export async function getCachedResponse(
  content: string,
  domain: string,
  originatingModel: string,
): Promise<InterrogationResponse | null> {
  const hash = hashInterrogationContent(content);
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
}): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO interrogation_context_records (user_id, trace_id, content_hash, originating_model, domain_tag, raw_content, source, session_id, cache_hit, gate_stage1_passed, gate_stage2_passed, gate_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, true, 'cache_hit') RETURNING id",
    [
      params.user.id,
      `${params.response.trace_id}:cache:${Date.now()}`,
      hashInterrogationContent(params.content),
      params.originatingModel,
      params.domain,
      params.content,
      params.source,
      params.sessionId ?? null,
    ],
  );
  return result.rows[0]!.id;
}

export async function putCachedResponse(
  content: string,
  domain: string,
  originatingModel: string,
  traceId: string,
  response: InterrogationResponse,
): Promise<void> {
  await query(
    "INSERT INTO interrogation_cache (content_hash, domain_tag, originating_model, dt_id, response_json, cached_dt_json, expires_at) SELECT $1, $2, $3, dt.id, $4::jsonb, $4::jsonb, now() + ($5 || ' hours')::interval FROM deliberation_traces dt JOIN interrogation_context_records icr ON icr.id = dt.icr_id WHERE icr.trace_id = $6 ON CONFLICT (content_hash, domain_tag, originating_model) DO UPDATE SET response_json = EXCLUDED.response_json, cached_dt_json = EXCLUDED.cached_dt_json, expires_at = EXCLUDED.expires_at, updated_at = now()",
    [hashInterrogationContent(content), domain, originatingModel, JSON.stringify(response), env.CACHE_TTL_HOURS, traceId],
  );
}

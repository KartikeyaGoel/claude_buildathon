import type { FastifyInstance } from "fastify";
import { LRUCache } from "lru-cache";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";

const profileCache = new LRUCache<string, Record<string, unknown>>({ max: 500, ttl: 5 * 60_000 });

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/profile", { preHandler: requireAuth }, async (request) => {
    const cached = profileCache.get(request.user!.id);
    if (cached) return cached;

    const stats = await query(
      "SELECT u.id AS user_id, u.created_at AS member_since, COUNT(DISTINCT icr.id)::int AS total_interrogations, COALESCE(AVG(CASE WHEN ra.tier2_followthrough THEN 1 ELSE 0 END), 0)::float AS tier2_rate FROM users u LEFT JOIN interrogation_context_records icr ON icr.user_id = u.id LEFT JOIN resolution_artifacts ra ON ra.icr_id = icr.id WHERE u.id = $1 GROUP BY u.id",
      [request.user!.id],
    );
    const blindSpots = await query(
      "SELECT aer.canonical_id, COALESCE(ca.representative_text, MAX(aer.raw_text)) AS assumption_text, COUNT(*)::int AS times_flagged, COUNT(ra.id) FILTER (WHERE ra.tier2_followthrough OR ra.inline_resolution = 'yes')::int AS times_engaged, COUNT(ra.id) FILTER (WHERE ra.inline_resolution = 'no')::int AS times_dismissed FROM assumption_extraction_records aer LEFT JOIN canonical_assumptions ca ON ca.id = aer.canonical_id LEFT JOIN resolution_artifacts ra ON ra.icr_id = aer.icr_id WHERE aer.user_id = $1 GROUP BY aer.canonical_id, ca.representative_text ORDER BY times_flagged DESC LIMIT 20",
      [request.user!.id],
    );
    const moments = await query(
      "SELECT icr.id AS icr_id, icr.created_at AS date, icr.domain_tag AS domain, aer.raw_text AS assumption_text, left(ra.tier2_followthrough_prompt, 100) AS followthrough_prompt_preview FROM resolution_artifacts ra JOIN interrogation_context_records icr ON icr.id = ra.icr_id LEFT JOIN assumption_extraction_records aer ON aer.icr_id = icr.id WHERE ra.user_id = $1 AND ra.tier2_followthrough = true ORDER BY ra.created_at DESC LIMIT 10",
      [request.user!.id],
    );
    const profile = {
      ...(stats.rows[0] ?? {}),
      blind_spots: blindSpots.rows,
      model_trust_map: {},
      moments_that_mattered: moments.rows,
    };
    profileCache.set(request.user!.id, profile);
    return profile;
  });

  app.get("/dashboard/assumptions", { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 50), 100);
    const offset = Math.max(Number((request.query as { offset?: string }).offset ?? 0), 0);
    const result = await query(
      "SELECT aer.id, aer.canonical_id, aer.raw_text, aer.assumption_type, aer.domain_cluster, aer.composite_score, aer.created_at, ca.representative_text FROM assumption_extraction_records aer LEFT JOIN canonical_assumptions ca ON ca.id = aer.canonical_id WHERE aer.user_id = $1 ORDER BY aer.created_at DESC LIMIT $2 OFFSET $3",
      [request.user!.id, limit, offset],
    );
    return { items: result.rows, limit, offset };
  });

  app.get("/dashboard/percentiles", { preHandler: requireAuth }, async (request) => {
    const result = await query(
      "SELECT metric, percentile, sample_size, computed_at FROM user_percentiles WHERE user_id = $1 ORDER BY metric ASC",
      [request.user!.id],
    );
    return { items: result.rows };
  });
}

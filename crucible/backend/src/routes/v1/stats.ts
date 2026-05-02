import type { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stats", { preHandler: requireAuth }, async (request) => {
    const result = await query(
      "SELECT COUNT(DISTINCT icr.id)::int AS total_interrogations, COALESCE(jsonb_object_agg(DISTINCT icr.domain_tag, domain_counts.count) FILTER (WHERE icr.domain_tag IS NOT NULL), '{}'::jsonb) AS domains_breakdown, COALESCE(AVG(CASE WHEN ra.tier2_followthrough THEN 1 ELSE 0 END), 0)::float AS tier2_followthrough_rate, COALESCE(AVG(dt.divergence_score), 0)::float AS avg_divergence FROM interrogation_context_records icr LEFT JOIN deliberation_traces dt ON dt.icr_id = icr.id LEFT JOIN resolution_artifacts ra ON ra.icr_id = icr.id LEFT JOIN LATERAL (SELECT COUNT(*)::int AS count FROM interrogation_context_records icr2 WHERE icr2.user_id = icr.user_id AND icr2.domain_tag = icr.domain_tag) domain_counts ON true WHERE icr.user_id = $1 GROUP BY icr.user_id",
      [request.user!.id],
    );
    return (
      result.rows[0] ?? {
        total_interrogations: 0,
        domains_breakdown: {},
        tier2_followthrough_rate: 0,
        assumption_classes_engaged: [],
        assumption_classes_dismissed: [],
        model_divergence_by_domain: {},
      }
    );
  });
}

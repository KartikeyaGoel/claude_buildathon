import type { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";

export async function registerHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/history", { preHandler: requireAuth }, async (request) => {
    const queryParams = request.query as { limit?: string; offset?: string; domain?: string };
    const limit = Math.min(Number(queryParams.limit ?? 20), 100);
    const offset = Math.max(Number(queryParams.offset ?? 0), 0);
    const domain = queryParams.domain ?? null;
    const result = await query(
      "SELECT icr.id AS interrogation_id, icr.created_at, icr.domain_tag AS domain, dt.divergence_score, COUNT(aer.id)::int AS assumption_count, MAX(ra.outcome) AS resolution FROM interrogation_context_records icr LEFT JOIN deliberation_traces dt ON dt.icr_id = icr.id LEFT JOIN assumption_extraction_records aer ON aer.icr_id = icr.id LEFT JOIN resolution_artifacts ra ON ra.icr_id = icr.id WHERE icr.user_id = $1 AND ($2::text IS NULL OR icr.domain_tag = $2) GROUP BY icr.id, dt.divergence_score ORDER BY icr.created_at DESC LIMIT $3 OFFSET $4",
      [request.user!.id, domain, limit, offset],
    );
    return { items: result.rows, limit, offset };
  });
}

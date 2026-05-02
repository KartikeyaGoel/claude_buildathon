import type { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { requireAdmin } from "../../middleware/auth.js";
import { sendProblem } from "../../middleware/problemDetails.js";

export async function registerCacheRoutes(app: FastifyInstance): Promise<void> {
  app.delete("/cache/:hash", { preHandler: requireAdmin }, async (request, reply) => {
    const hash = (request.params as { hash: string }).hash;
    const result = await query("DELETE FROM interrogation_cache WHERE content_hash = $1", [hash]);
    if (result.rowCount === 0) {
      sendProblem(reply, 404, "CACHE_NOT_FOUND", "Cache entry not found");
      return;
    }

    await query(
      "INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id) VALUES ($1, 'delete', 'interrogation_cache', $2)",
      [request.user!.id, hash],
    );

    reply.status(204).send();
  });
}

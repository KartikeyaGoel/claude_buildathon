import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../middleware/auth.js";
import { query } from "../../db/client.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/ready", { preHandler: requireAdmin }, async () => {
    await query("SELECT 1");
    return { status: "ready" };
  });
}

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { sendProblem } from "../../middleware/problemDetails.js";
import { hashApiKey } from "../../utils/crypto.js";
import { encryptWebhookSecret } from "../../webhooks/crypto.js";
import { assertWebhookUrlSafe } from "../../webhooks/ssrf.js";

const webhookSchema = z.object({
  url: z.string().url(),
  event_types: z.array(z.string()).default(["high_consequence_flag"]),
});

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get("/webhooks", { preHandler: requireAuth }, async (request) => {
    const result = await query(
      "SELECT id, url, event_types, active, created_at FROM partner_webhooks WHERE user_id = $1 ORDER BY created_at DESC",
      [request.user!.id],
    );
    return { items: result.rows };
  });

  app.post("/webhooks", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      sendProblem(reply, 400, "INVALID_REQUEST", "Invalid webhook payload");
      return;
    }

    try {
      await assertWebhookUrlSafe(parsed.data.url);
    } catch (error) {
      sendProblem(reply, 400, "WEBHOOK_INVALID_URL", error instanceof Error ? error.message : "Invalid webhook URL");
      return;
    }

    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const result = await query<{ id: string }>(
      "INSERT INTO partner_webhooks (user_id, url, secret_hash, secret_ciphertext, event_types) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [request.user!.id, parsed.data.url, hashApiKey(secret), encryptWebhookSecret(secret), parsed.data.event_types],
    );

    reply.status(201).send({
      id: result.rows[0]!.id,
      secret,
      message: "Store this webhook secret now. It will not be shown again.",
    });
  });

  app.post("/webhooks/:id/rotate", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const result = await query<{ id: string }>(
      "UPDATE partner_webhooks SET secret_hash = $1, secret_ciphertext = $2, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING id",
      [hashApiKey(secret), encryptWebhookSecret(secret), id, request.user!.id],
    );
    if (result.rowCount === 0) {
      sendProblem(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook not found");
      return;
    }
    reply.send({ id, secret });
  });

  app.delete("/webhooks/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const result = await query("DELETE FROM partner_webhooks WHERE id = $1 AND user_id = $2", [id, request.user!.id]);
    if (result.rowCount === 0) {
      sendProblem(reply, 404, "WEBHOOK_NOT_FOUND", "Webhook not found");
      return;
    }
    reply.status(204).send();
  });
}

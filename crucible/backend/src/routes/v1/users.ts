import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query } from "../../db/client.js";
import { generateApiKey, hashApiKey } from "../../utils/crypto.js";
import { sendProblem } from "../../middleware/problemDetails.js";

const registerSchema = z.object({
  plan_tier: z.enum(["free", "pro"]).default("free"),
});

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.post("/users/register", async (request, reply) => {
    if (env.REGISTRATION_SECRET) {
      const secret = request.headers["x-registration-secret"];
      if (secret !== env.REGISTRATION_SECRET) {
        sendProblem(reply, 403, "REGISTRATION_FORBIDDEN", "Invalid or missing registration secret");
        return;
      }
    }

    const parsed = registerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      sendProblem(reply, 400, "INVALID_REQUEST", "Invalid registration payload");
      return;
    }

    const apiKey = generateApiKey();
    const hash = hashApiKey(apiKey);
    const result = await query<{ id: string }>(
      "INSERT INTO users (api_key_hash, api_key_prefix, plan_tier) VALUES ($1, $2, $3) RETURNING id",
      [hash, apiKey.slice(0, 12), parsed.data.plan_tier],
    );

    reply.status(201).send({
      user_id: result.rows[0]!.id,
      api_key: apiKey,
      message: "Store this API key now. It will not be shown again.",
    });
  });
}

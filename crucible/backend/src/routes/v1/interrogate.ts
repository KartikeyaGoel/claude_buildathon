import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import {
  decrementInFlight,
  enforceDailyInterrogationLimit,
  incrementInFlight,
} from "../../middleware/rateLimit.js";
import { sendProblem } from "../../middleware/problemDetails.js";
import { runInterrogation } from "../../services/engine/runInterrogation.js";
import { formatSseMessage } from "../../utils/sseHelpers.js";

const interrogateSchema = z.object({
  content: z.string().min(1),
  user_position: z.string().min(1).optional(),
  domain: z
    .enum(["financial", "medical", "legal", "technical", "policy", "personal", "other"])
    .default("other"),
  context: z.string().optional(),
  originating_model: z
    .enum(["claude", "gpt4o", "gemini", "perplexity", "mistral", "other"])
    .default("other"),
  session_id: z.string().optional(),
});

export async function registerInterrogateRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/interrogate",
    {
      preHandler: [requireAuth, enforceDailyInterrogationLimit, incrementInFlight],
    },
    async (request, reply) => {
      if (!request.user || reply.sent) return;
      try {
        const parsed = interrogateSchema.safeParse(request.body);
        if (!parsed.success) {
          sendProblem(reply, 400, "INVALID_REQUEST", "content is required");
          return;
        }

        const response = await runInterrogation({
          user: request.user,
          content: parsed.data.content,
          userPosition: parsed.data.user_position,
          domain: parsed.data.domain,
          context: parsed.data.context,
          originatingModel: parsed.data.originating_model,
          sessionId: parsed.data.session_id,
          source: "api",
        });

        const query = request.query as { stream?: string };
        if (query.stream === "true") {
          reply.raw.statusCode = 200;
          reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
          reply.raw.setHeader("Connection", "keep-alive");
          reply.raw.write(
            formatSseMessage({
              id: 1,
              event: "pipeline_complete",
              data: { finalResult: response },
            }),
          );
          reply.raw.end();
          return reply;
        }

        reply.send(response);
      } catch (error) {
        const maybe = error as { code?: string; message?: string };
        if (maybe.code === "GATE_BLOCKED") {
          reply.send({ gated: true, reason: maybe.message ?? "gate_blocked" });
          return;
        }
        throw error;
      } finally {
        await decrementInFlight(request.user.id);
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { sendProblem } from "../../middleware/problemDetails.js";

const outcomeSchema = z.object({
  trace_id: z.string().min(1).optional(),
  interrogation_id: z.string().uuid().optional(),
  decision: z.string().min(1).default("outcome_reported"),
  outcome: z.enum(["proceeded", "modified", "abandoned"]).or(z.string()).optional(),
  failure_mode: z.string().optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  followthrough_prompt: z.string().optional(),
  followthrough_detected: z.boolean().default(false),
}).refine((data) => data.trace_id || data.interrogation_id, "trace_id or interrogation_id is required");

export async function registerOutcomeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/outcome", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) return;
    const parsed = outcomeSchema.safeParse(request.body);
    if (!parsed.success) {
      sendProblem(reply, 400, "INVALID_REQUEST", "Invalid outcome payload");
      return;
    }

    const result = await query<{ id: string }>(
      "INSERT INTO resolution_artifacts (icr_id, user_id, decision, outcome, confidence, tier2_followthrough_prompt, tier2_followthrough, tier2_detected_at, metadata) SELECT id, $1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() ELSE NULL END, $7::jsonb FROM interrogation_context_records WHERE user_id = $1 AND (id = $8 OR trace_id = $9) RETURNING id, icr_id",
      [
        request.user.id,
        parsed.data.decision,
        parsed.data.outcome ?? null,
        parsed.data.confidence ?? null,
        parsed.data.followthrough_prompt ?? null,
        parsed.data.followthrough_detected,
        JSON.stringify({ notes: parsed.data.notes ?? null }),
        parsed.data.interrogation_id ?? null,
        parsed.data.trace_id ?? null,
      ],
    );

    if (result.rowCount === 0) {
      sendProblem(reply, 404, "INTERROGATION_NOT_FOUND", "Interrogation not found");
      return;
    }

    if (parsed.data.failure_mode) {
      await query(
        "INSERT INTO execution_failure_records (user_id, icr_id, trace_id, action_taken, execution_succeeded, failure_mode, outcome_reported_at, failure_type, error_message) SELECT $1, id, trace_id, $2, false, $3, now(), 'outcome_reported_failure', $3 FROM interrogation_context_records WHERE user_id = $1 AND (id = $4 OR trace_id = $5)",
        [
          request.user.id,
          parsed.data.decision,
          parsed.data.failure_mode,
          parsed.data.interrogation_id ?? null,
          parsed.data.trace_id ?? null,
        ],
      );
    }

    reply.status(201).send({ recorded: true, id: result.rows[0]!.id });
  });
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { sendProblem } from "./problemDetails.js";

interface RateRow {
  daily_reset_at: Date;
}

export async function enforceDailyInterrogationLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) {
    sendProblem(reply, 401, "INVALID_API_KEY", "Authentication is required");
    return;
  }

  if (user.planTier === "pro" || user.planTier === "admin") return;

  const result = await query<RateRow>(
    "UPDATE users SET daily_interrogation_count = CASE WHEN now() >= daily_reset_at THEN 1 ELSE daily_interrogation_count + 1 END, daily_reset_at = CASE WHEN now() >= daily_reset_at THEN date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day' ELSE daily_reset_at END, updated_at = now() WHERE id = $1 AND deleted_at IS NULL AND (now() >= daily_reset_at OR daily_interrogation_count < $2) RETURNING daily_reset_at",
    [user.id, env.FREE_TIER_DAILY_LIMIT],
  );

  const row = result.rows[0];
  if (!row) {
    sendProblem(reply, 429, "RATE_LIMIT_EXCEEDED", "Daily interrogation limit exceeded");
    return;
  }

  reply.header("X-RateLimit-Reset", row.daily_reset_at.toISOString());
}

export async function incrementInFlight(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user;
  if (!user) return;
  const result = await query<{ id: string }>(
    "UPDATE users SET in_flight_count = in_flight_count + 1 WHERE id = $1 AND in_flight_count < $2 RETURNING id",
    [user.id, env.MAX_CONCURRENT_INTERROGATIONS],
  );
  if (result.rowCount === 0) {
    sendProblem(reply, 429, "TOO_MANY_CONCURRENT_INTERROGATIONS", "Too many concurrent interrogations");
  }
}

export async function decrementInFlight(userId: string): Promise<void> {
  await query("UPDATE users SET in_flight_count = GREATEST(in_flight_count - 1, 0) WHERE id = $1", [userId]);
}

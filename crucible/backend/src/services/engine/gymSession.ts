import { query } from "../../db/client.js";
import type { DeliberationSnapshot, GymSessionStatus } from "./types.js";

const ABANDON_AFTER_HOURS = 24;

export interface GymSessionRow {
  id: string;
  trace_id: string;
  icr_id: string;
  user_id: string;
  status: GymSessionStatus;
  user_position: string;
  user_judgment: string | null;
  final_position: string | null;
  disagreement_question: string | null;
  deliberation_snapshot: DeliberationSnapshot;
  synthesis_snapshot: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export async function markStaleGymSessionsAbandoned(userId: string): Promise<number> {
  const result = await query(
    `UPDATE cognitive_gym_sessions
     SET status = 'abandoned', updated_at = now()
     WHERE user_id = $1
       AND status IN ('awaiting_judgment', 'awaiting_recommitment')
       AND expires_at < now()`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function createGymSession(params: {
  traceId: string;
  icrId: string;
  userId: string;
  userPosition: string;
  disagreementQuestion: string;
  deliberationSnapshot: DeliberationSnapshot;
}): Promise<GymSessionRow> {
  const result = await query<GymSessionRow>(
    `INSERT INTO cognitive_gym_sessions (
       trace_id, icr_id, user_id, status, user_position,
       disagreement_question, deliberation_snapshot, expires_at
     ) VALUES ($1, $2, $3, 'awaiting_judgment', $4, $5, $6::jsonb, now() + ($7 || ' hours')::interval)
     RETURNING *`,
    [
      params.traceId,
      params.icrId,
      params.userId,
      params.userPosition,
      params.disagreementQuestion,
      JSON.stringify(params.deliberationSnapshot),
      String(ABANDON_AFTER_HOURS),
    ],
  );
  return result.rows[0]!;
}

export async function getGymSessionForUser(
  traceId: string,
  userId: string,
): Promise<GymSessionRow | null> {
  const result = await query<GymSessionRow>(
    "SELECT * FROM cognitive_gym_sessions WHERE trace_id = $1 AND user_id = $2",
    [traceId, userId],
  );
  return result.rows[0] ?? null;
}

export async function recordUserJudgment(params: {
  traceId: string;
  userId: string;
  userJudgment: string;
  synthesisSnapshot: Record<string, unknown>;
}): Promise<GymSessionRow> {
  const result = await query<GymSessionRow>(
    `UPDATE cognitive_gym_sessions
     SET status = 'awaiting_recommitment',
         user_judgment = $3,
         synthesis_snapshot = $4::jsonb,
         updated_at = now(),
         expires_at = now() + ($5 || ' hours')::interval
     WHERE trace_id = $1 AND user_id = $2 AND status = 'awaiting_judgment'
     RETURNING *`,
    [
      params.traceId,
      params.userId,
      params.userJudgment,
      JSON.stringify(params.synthesisSnapshot),
      String(ABANDON_AFTER_HOURS),
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Session not found or not awaiting judgment");
  }
  return row;
}

export async function completeGymSession(params: {
  traceId: string;
  userId: string;
  finalPosition: string;
}): Promise<GymSessionRow> {
  const result = await query<GymSessionRow>(
    `UPDATE cognitive_gym_sessions
     SET status = 'complete',
         final_position = $3,
         updated_at = now()
     WHERE trace_id = $1 AND user_id = $2 AND status = 'awaiting_recommitment'
     RETURNING *`,
    [params.traceId, params.userId, params.finalPosition],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Session not found or not awaiting recommitment");
  }
  return row;
}

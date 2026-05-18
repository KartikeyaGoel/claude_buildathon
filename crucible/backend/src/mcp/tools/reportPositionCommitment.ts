import { z } from "zod";
import { query } from "../../db/client.js";
import { getMcpActingUser } from "../authContext.js";

export const reportPositionCommitmentInputSchema = {
  trace_id: z.string().min(1),
  final_position: z.string().min(1),
  notes: z.string().optional(),
};

export async function reportPositionCommitmentTool(args: {
  trace_id: string;
  final_position: string;
  notes?: string;
}) {
  const user = await getMcpActingUser();
  const finalPosition = args.final_position.trim();
  if (!finalPosition) {
    throw new Error("final_position is required and cannot be empty");
  }

  const icr = await query<{ id: string; user_position: string | null }>(
    "SELECT id, user_position FROM interrogation_context_records WHERE trace_id = $1 AND user_id = $2",
    [args.trace_id, user.id],
  );

  const row = icr.rows[0];
  if (!row) throw new Error("Interrogation not found for this MCP user");

  const initialPosition = row.user_position?.trim();
  if (!initialPosition) {
    throw new Error("This interrogation has no recorded initial user_position");
  }

  await query(
    "INSERT INTO cognitive_position_commitments (icr_id, user_id, trace_id, initial_position, final_position, source, metadata) VALUES ($1, $2, $3, $4, $5, 'mcp', $6::jsonb)",
    [row.id, user.id, args.trace_id, initialPosition, finalPosition, JSON.stringify({ notes: args.notes ?? null })],
  );

  return {
    content: [
      {
        type: "text" as const,
        text: "Position commitment recorded. This pair (initial → final) is stored for cognitive gym tracking.",
      },
    ],
  };
}

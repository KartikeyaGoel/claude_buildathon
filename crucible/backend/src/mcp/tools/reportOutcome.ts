import { z } from "zod";
import { query } from "../../db/client.js";
import { getMcpActingUser } from "../authContext.js";

export const reportOutcomeInputSchema = {
  trace_id: z.string().min(1),
  outcome: z.enum(["proceeded", "modified", "abandoned"]),
  notes: z.string().optional(),
};

export async function reportOutcomeTool(args: {
  trace_id: string;
  outcome: "proceeded" | "modified" | "abandoned";
  notes?: string;
}) {
  const user = await getMcpActingUser();
  const result = await query<{ id: string }>(
    "INSERT INTO resolution_artifacts (icr_id, user_id, decision, outcome, metadata) SELECT id, $1, 'mcp_outcome_reported', $2, $3::jsonb FROM interrogation_context_records WHERE trace_id = $4 AND user_id = $1 RETURNING id",
    [user.id, args.outcome, JSON.stringify({ notes: args.notes ?? null }), args.trace_id],
  );

  if (result.rowCount === 0) throw new Error("Interrogation not found for this MCP user");

  return {
    content: [
      {
        type: "text" as const,
        text: "Outcome recorded. This improves Crucible's calibration for future interrogations.",
      },
    ],
  };
}

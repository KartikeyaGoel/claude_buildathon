import { z } from "zod";
import { getMcpActingUser } from "../authContext.js";
import { formatCommitResponse } from "../formatters.js";
import { runGymCommit } from "../../services/engine/stagedGym.js";

export const commitInputSchema = {
  trace_id: z.string().min(1),
  final_position: z.string().min(1, "final_position is required — the user's stated belief after synthesis"),
  outcome: z.enum(["proceeded", "modified", "abandoned"]).optional(),
  notes: z.string().optional(),
};

export async function commitTool(args: {
  trace_id: string;
  final_position: string;
  outcome?: "proceeded" | "modified" | "abandoned";
  notes?: string;
}) {
  const user = await getMcpActingUser();
  const result = await runGymCommit({
    user,
    traceId: args.trace_id,
    finalPosition: args.final_position,
    outcome: args.outcome,
    notes: args.notes,
  });

  return {
    content: [{ type: "text" as const, text: formatCommitResponse(result) }],
  };
}

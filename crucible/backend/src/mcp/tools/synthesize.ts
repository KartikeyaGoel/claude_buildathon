import { z } from "zod";
import { getMcpActingUser } from "../authContext.js";
import { formatSynthesizeResponse } from "../formatters.js";
import { runGymSynthesis } from "../../services/engine/stagedGym.js";

export const synthesizeInputSchema = {
  trace_id: z.string().min(1),
  user_judgment: z.string().min(1, "user_judgment is required — the user's answer to the disagreement question"),
};

export async function synthesizeTool(args: { trace_id: string; user_judgment: string }) {
  const user = await getMcpActingUser();
  const result = await runGymSynthesis({
    user,
    traceId: args.trace_id,
    userJudgment: args.user_judgment,
  });

  return {
    content: [{ type: "text" as const, text: formatSynthesizeResponse(result) }],
  };
}

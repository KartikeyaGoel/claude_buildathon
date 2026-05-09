import { z } from "zod";
import { query } from "../../db/client.js";
import { openAiEmbeddings, toPgVector } from "../../providers/embeddings.js";
import { getMcpActingUser } from "../authContext.js";

const followupMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool", "system"]).default("user"),
  content: z.string().min(1),
});

export const reportFollowupContextInputSchema = {
  trace_id: z.string().min(1),
  messages: z.array(followupMessageSchema).min(1).max(12),
  final_answer: z.string().optional(),
  outcome: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
};

export async function reportFollowupContextTool(args: {
  trace_id: string;
  messages: Array<{ role?: "user" | "assistant" | "tool" | "system"; content: string }>;
  final_answer?: string;
  outcome?: string;
  confidence?: number;
  notes?: string;
}) {
  const user = await getMcpActingUser();
  const transcript = [
    ...args.messages.map((message) => `${message.role ?? "user"}: ${message.content}`),
    args.final_answer ? `assistant_final_answer: ${args.final_answer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let vector: string | null = null;
  try {
    const embedding = await openAiEmbeddings.embed(transcript);
    if (embedding.length > 0) vector = toPgVector(embedding);
  } catch (error) {
    console.warn("[mcp] followup embedding skipped", error);
  }

  const result = await query<{ id: string }>(
    "INSERT INTO conversation_followup_records (icr_id, user_id, trace_id, source, messages, final_answer, outcome, confidence, output_embedding, metadata) SELECT id, $1, trace_id, 'mcp', $2::jsonb, $3, $4, $5, $6::vector, $7::jsonb FROM interrogation_context_records WHERE trace_id = $8 AND user_id = $1 RETURNING id",
    [
      user.id,
      JSON.stringify(args.messages),
      args.final_answer ?? null,
      args.outcome ?? null,
      args.confidence ?? null,
      vector,
      JSON.stringify({ notes: args.notes ?? null }),
      args.trace_id,
    ],
  );

  if (result.rowCount === 0) throw new Error("Interrogation not found for this MCP user");

  return {
    content: [
      {
        type: "text" as const,
        text: "Follow-up context recorded. This helps Crucible evaluate whether the synthesis changed downstream reasoning or action.",
      },
    ],
  };
}


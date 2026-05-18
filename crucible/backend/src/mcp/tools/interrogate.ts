import { z } from "zod";
import { getMcpActingUser } from "../authContext.js";
import { formatCognitiveGymInterrogation } from "../formatters.js";
import { runInterrogation } from "../../services/engine/runInterrogation.js";

export const interrogateInputSchema = {
  content: z.string().min(1),
  user_position: z.string().min(1, "user_position is required and cannot be empty"),
  domain: z.enum(["financial", "medical", "legal", "technical", "policy", "personal", "other"]).optional(),
  context: z.string().optional(),
  originating_model: z.enum(["claude", "gpt4o", "gemini", "perplexity", "mistral", "other"]).optional(),
};

export async function interrogateTool(args: {
  content: string;
  user_position: string;
  domain?: "financial" | "medical" | "legal" | "technical" | "policy" | "personal" | "other";
  context?: string;
  originating_model?: "claude" | "gpt4o" | "gemini" | "perplexity" | "mistral" | "other";
}) {
  const userPosition = args.user_position.trim();
  if (!userPosition) {
    throw new Error("user_position is required and cannot be empty");
  }

  const user = await getMcpActingUser();
  const content = args.context
    ? `${args.content}\n\nContext:\n${args.context}`
    : args.content;
  const response = await runInterrogation({
    user,
    content,
    userPosition,
    domain: args.domain ?? "other",
    context: args.context,
    originatingModel: args.originating_model ?? "other",
    source: "mcp",
  });

  const payload = response.cognitive_gym;
  if (!payload) {
    throw new Error("Cognitive Gym deliberation payload was not produced");
  }

  return {
    content: [
      {
        type: "text" as const,
        text: formatCognitiveGymInterrogation(response),
      },
    ],
  };
}

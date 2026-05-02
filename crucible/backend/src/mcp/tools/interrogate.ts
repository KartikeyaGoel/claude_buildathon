import { z } from "zod";
import { getMcpActingUser } from "../authContext.js";
import { formatInterrogation } from "../formatters.js";
import { runInterrogation } from "../../services/engine/runInterrogation.js";

export const interrogateInputSchema = {
  content: z.string().min(1),
  domain: z.enum(["financial", "medical", "legal", "technical", "policy", "personal", "other"]).optional(),
  context: z.string().optional(),
  originating_model: z.enum(["claude", "gpt4o", "gemini", "perplexity", "mistral", "other"]).optional(),
};

export async function interrogateTool(args: {
  content: string;
  domain?: "financial" | "medical" | "legal" | "technical" | "policy" | "personal" | "other";
  context?: string;
  originating_model?: "claude" | "gpt4o" | "gemini" | "perplexity" | "mistral" | "other";
}) {
  const user = await getMcpActingUser();
  const content = args.context
    ? `${args.content}\n\nContext:\n${args.context}`
    : args.content;
  const response = await runInterrogation({
    user,
    content,
    domain: args.domain ?? "other",
    context: args.context,
    originatingModel: args.originating_model ?? "other",
    source: "mcp",
  });

  return {
    content: [
      {
        type: "text" as const,
        text: formatInterrogation(response),
      },
    ],
  };
}

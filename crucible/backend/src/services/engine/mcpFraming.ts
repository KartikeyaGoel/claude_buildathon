import { runAnthropic } from "../../providers/anthropic.js";
import { env } from "../../config/env.js";
import { MCP_FRAMING_SYSTEM_PROMPT } from "../../prompts/mcpFraming.prompt.js";
import { formatContextBundleForPrompt } from "./contextBundle.js";
import { wrapInterrogationContent } from "./prompts.js";
import type { ContextBundle } from "./types.js";

export async function runLightweightFraming(params: {
  content: string;
  userPosition?: string;
  contextBundle?: ContextBundle;
  signal: AbortSignal;
}): Promise<string> {
  const sections = ["## Submitted content", params.content];

  const bundleText = params.contextBundle ? formatContextBundleForPrompt(params.contextBundle) : "";
  if (bundleText) {
    sections.push("", bundleText);
  }

  if (params.userPosition?.trim()) {
    sections.push("", "## User position", params.userPosition.trim());
  }

  const result = await runAnthropic({
    role: "critic",
    system: MCP_FRAMING_SYSTEM_PROMPT,
    user: wrapInterrogationContent(sections.join("\n")),
    model: env.MODEL_ID,
    timeoutMs: 30_000,
    signal: params.signal,
  });

  return result.text.trim() || "Framing agent returned empty output.";
}

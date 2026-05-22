import { runAnthropic } from "../../providers/anthropic.js";
import { env } from "../../config/env.js";
import { ASSUMPTION_SYSTEM_PROMPT } from "../../prompts/assumption.prompt.js";
import type { ProviderResult } from "../../providers/types.js";
import { assertNotCancelled, MODEL_TIMEOUT_MS } from "../../utils/pipelineCancel.js";
import { formatContextBundleForPrompt } from "./contextBundle.js";
import { wrapInterrogationContent } from "./prompts.js";
import type { ContextBundle } from "./types.js";

export async function runLayeredAssumptionExcavation(params: {
  content: string;
  framingText: string;
  userPosition?: string;
  contextBundle?: ContextBundle;
  cancel?: AbortSignal;
}): Promise<ProviderResult> {
  assertNotCancelled(params.cancel);
  const bundleText = params.contextBundle ? formatContextBundleForPrompt(params.contextBundle) : "";

  const sections = [
    "## Decision (submitted content)",
    params.content,
    "",
    "## Framing",
    params.framingText,
  ];

  if (bundleText) {
    sections.push("", bundleText);
  }

  if (params.userPosition?.trim()) {
    sections.push("", "## User position", params.userPosition.trim());
  }

  sections.push("", "## Task", "Perform layered assumption excavation per your system instructions.");

  const startedAt = Date.now();
  const result = await runAnthropic({
    role: "critic",
    system: ASSUMPTION_SYSTEM_PROMPT,
    user: wrapInterrogationContent(sections.join("\n")),
    model: env.EXCAVATION_MODEL,
    timeoutMs: MODEL_TIMEOUT_MS,
  });
  // MCP stdio uses stdout for JSON-RPC only — log to stderr.
  console.error(`[layeredExcavation] latency_ms=${Date.now() - startedAt}`);

  return result;
}

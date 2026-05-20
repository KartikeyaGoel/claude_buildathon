import { runAnthropic } from "../../providers/anthropic.js";
import { env } from "../../config/env.js";
import { ASSUMPTION_SYSTEM_PROMPT } from "../../prompts/assumption.prompt.js";
import type { ProviderResult } from "../../providers/types.js";
import { formatContextBundleForPrompt } from "./contextBundle.js";
import { wrapInterrogationContent } from "./prompts.js";
import type { ContextBundle } from "./types.js";

const MAX_EXCAVATION_ITERATIONS = 2;

export async function runLayeredAssumptionExcavation(params: {
  content: string;
  framingText: string;
  userPosition?: string;
  contextBundle?: ContextBundle;
  signal: AbortSignal;
}): Promise<ProviderResult> {
  const bundleText = params.contextBundle ? formatContextBundleForPrompt(params.contextBundle) : "";
  let previousOutput: string | null = null;
  let lastResult: ProviderResult | null = null;

  for (let iteration = 1; iteration <= MAX_EXCAVATION_ITERATIONS; iteration++) {
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

    if (iteration > 1 && previousOutput) {
      sections.push(
        "",
        "## Previous excavation output",
        previousOutput,
        "",
        "## Task",
        "Deepen layered excavation; surface implicit bedrock assumptions with full taxonomy tags.",
      );
    } else {
      sections.push("", "## Task", "Perform layered assumption excavation per your system instructions.");
    }

    const result = await runAnthropic({
      role: "critic",
      system: ASSUMPTION_SYSTEM_PROMPT,
      user: wrapInterrogationContent(sections.join("\n")),
      model: env.MODEL_ID,
      timeoutMs: 60_000,
      signal: params.signal,
    });

    previousOutput = result.text;
    lastResult = result;
  }

  return lastResult!;
}

import { env } from "../../config/env.js";
import { runAnthropic } from "../../providers/anthropic.js";
import { NEGATIVE_SPACE_SYSTEM_PROMPT } from "../../prompts/negativeSpace.prompt.js";
import { assertNotCancelled, MODEL_TIMEOUT_MS } from "../../utils/pipelineCancel.js";
import { wrapInterrogationContent } from "./prompts.js";

export async function runNegativeSpacePass(params: {
  content: string;
  framingText: string;
  userPosition?: string;
  contextBundleText?: string;
  cancel?: AbortSignal;
}): Promise<string> {
  assertNotCancelled(params.cancel);
  const sections = [
    "## Submitted content",
    params.content,
    "",
    "## Framing",
    params.framingText,
  ];

  if (params.contextBundleText?.trim()) {
    sections.push("", params.contextBundleText.trim());
  }

  if (params.userPosition?.trim()) {
    sections.push("", "## User position", params.userPosition.trim());
  }

  sections.push("", "## Task", "Surface negative-space absences per your system instructions.");

  const result = await runAnthropic({
    role: "blindspot",
    system: NEGATIVE_SPACE_SYSTEM_PROMPT,
    user: wrapInterrogationContent(sections.join("\n")),
    model: env.ANTHROPIC_MODEL,
    timeoutMs: MODEL_TIMEOUT_MS,
  });

  return result.text;
}

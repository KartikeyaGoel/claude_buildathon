import { runAnthropic } from "../../providers/anthropic.js";
import { NEGATIVE_SPACE_SYSTEM_PROMPT } from "../../prompts/negativeSpace.prompt.js";
import { wrapInterrogationContent } from "./prompts.js";

export async function runNegativeSpacePass(params: {
  content: string;
  framingText: string;
  userPosition?: string;
  contextBundleText?: string;
  signal: AbortSignal;
}): Promise<string> {
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
    timeoutMs: 45_000,
    signal: params.signal,
  });

  return result.text;
}

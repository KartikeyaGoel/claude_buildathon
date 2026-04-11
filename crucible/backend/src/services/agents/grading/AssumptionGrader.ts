import type { StageGrade } from "@crucible/shared";
import { env } from "../../../config/env.js";
import { anthropic, withRetries } from "../../../config/anthropic.js";
import { ASSUMPTION_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/assumptionGrader.prompt.js";
import { extractJsonObject } from "../jsonExtract.js";
import { messageTextContent } from "../BaseAgent.js";

function enforcedPass(scores: {
  depth: number;
  coverage: number;
  independence: number;
}): boolean {
  return scores.depth >= 4 && scores.coverage >= 4 && scores.independence >= 3;
}

export async function gradeAssumptionOutput(
  params: {
    decisionText: string;
    framingText: string;
    agentOutput: string;
    signal: AbortSignal;
  },
): Promise<Extract<StageGrade, { stage: "assumption" }>> {
  const { decisionText, framingText, agentOutput, signal } = params;
  const userContent = `## Decision (user)\n${decisionText}\n\n## Framing (prior stage)\n${framingText}\n\n## Assumption excavation output to grade\n${agentOutput}`;

  const msg = await withRetries(
    async () =>
      await anthropic.messages.create(
        {
          model: env.MODEL_ID,
          max_tokens: 2048,
          system: ASSUMPTION_GRADER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        },
        { signal },
      ),
    { signal, label: "grade assumption" },
  );

  const raw = messageTextContent(msg);
  const parsed = extractJsonObject(raw) as {
    passed?: boolean;
    scores?: { depth?: number; coverage?: number; independence?: number };
    failureReasons?: string[];
    feedback?: string;
  };
  const scores = {
    depth: Number(parsed.scores?.depth ?? 0),
    coverage: Number(parsed.scores?.coverage ?? 0),
    independence: Number(parsed.scores?.independence ?? 0),
  };
  const grade: Extract<StageGrade, { stage: "assumption" }> = {
    stage: "assumption",
    scores,
    passed: enforcedPass(scores),
    failureReasons: Array.isArray(parsed.failureReasons)
      ? parsed.failureReasons.map(String)
      : [],
    feedback: String(parsed.feedback ?? ""),
  };
  return grade;
}

export function sumAssumptionScores(grade: Extract<StageGrade, { stage: "assumption" }>): number {
  return grade.scores.depth + grade.scores.coverage + grade.scores.independence;
}

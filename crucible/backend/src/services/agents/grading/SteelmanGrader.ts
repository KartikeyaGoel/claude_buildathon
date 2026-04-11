import type { StageGrade } from "@crucible/shared";
import { env } from "../../../config/env.js";
import { anthropic, withRetries } from "../../../config/anthropic.js";
import { STEELMAN_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/steelmanGrader.prompt.js";
import { extractJsonObject } from "../jsonExtract.js";
import { messageTextContent } from "../BaseAgent.js";

function enforcedPass(scores: {
  strength: number;
  specificity: number;
  novelty: number;
}): boolean {
  return scores.strength >= 4 && scores.specificity >= 4 && scores.novelty >= 3;
}

export async function gradeSteelmanOutput(
  params: {
    decisionText: string;
    framingText: string;
    agentOutput: string;
    signal: AbortSignal;
  },
): Promise<Extract<StageGrade, { stage: "steelman" }>> {
  const { decisionText, framingText, agentOutput, signal } = params;
  const userContent = `## Decision (user)\n${decisionText}\n\n## Framing (prior stage)\n${framingText}\n\n## Steelman output to grade\n${agentOutput}`;

  const msg = await withRetries(
    async () =>
      await anthropic.messages.create(
        {
          model: env.MODEL_ID,
          max_tokens: 2048,
          system: STEELMAN_GRADER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        },
        { signal },
      ),
    { signal, label: "grade steelman" },
  );

  const raw = messageTextContent(msg);
  const parsed = extractJsonObject(raw) as {
    passed?: boolean;
    scores?: { strength?: number; specificity?: number; novelty?: number };
    failureReasons?: string[];
    feedback?: string;
  };
  const scores = {
    strength: Number(parsed.scores?.strength ?? 0),
    specificity: Number(parsed.scores?.specificity ?? 0),
    novelty: Number(parsed.scores?.novelty ?? 0),
  };
  return {
    stage: "steelman",
    scores,
    passed: enforcedPass(scores),
    failureReasons: Array.isArray(parsed.failureReasons)
      ? parsed.failureReasons.map(String)
      : [],
    feedback: String(parsed.feedback ?? ""),
  };
}

export function sumSteelmanScores(grade: Extract<StageGrade, { stage: "steelman" }>): number {
  return grade.scores.strength + grade.scores.specificity + grade.scores.novelty;
}

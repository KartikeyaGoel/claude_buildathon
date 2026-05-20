import type { StageGrade } from "@crucible/shared";
import { env } from "../../../config/env.js";
import { anthropic, messageTextContent, withRetries } from "../../../config/anthropic.js";
import { ASSUMPTION_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/assumptionGrader.prompt.js";
import { STEELMAN_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/steelmanGrader.prompt.js";
import { SYNTHESIS_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/synthesisGrader.prompt.js";
import { extractJsonObject } from "../jsonExtract.js";

async function runGraderModel(params: {
  system: string;
  userContent: string;
  signal: AbortSignal;
  label: string;
}): Promise<string> {
  const msg = await withRetries(
    async () =>
      await anthropic.messages.create(
        {
          model: env.MODEL_ID,
          max_tokens: 2048,
          system: params.system,
          messages: [{ role: "user", content: params.userContent }],
        },
        { signal: params.signal },
      ),
    { signal: params.signal, label: params.label },
  );
  return messageTextContent(msg);
}

type ParsedCommon = {
  passed?: boolean;
  failureReasons?: unknown;
  feedback?: unknown;
  scores?: Record<string, number | undefined>;
};

function strArray(x: unknown): string[] {
  return Array.isArray(x) ? x.map(String) : [];
}

// --- Assumption

function assumptionEnforcedPass(scores: {
  depth: number;
  coverage: number;
  independence: number;
  implicitness: number;
  contextualGrounding: number;
}): boolean {
  return (
    scores.depth >= 4 &&
    scores.coverage >= 4 &&
    scores.independence >= 3 &&
    scores.implicitness >= 3 &&
    scores.contextualGrounding >= 3
  );
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
  const raw = await runGraderModel({
    system: ASSUMPTION_GRADER_SYSTEM_PROMPT,
    userContent,
    signal,
    label: "grade assumption",
  });
  const parsed = extractJsonObject(raw) as ParsedCommon;
  const s = parsed.scores ?? {};
  const scores = {
    depth: Number(s.depth ?? 0),
    coverage: Number(s.coverage ?? 0),
    independence: Number(s.independence ?? 0),
    implicitness: Number(s.implicitness ?? 0),
    contextualGrounding: Number(s.contextualGrounding ?? 0),
  };
  return {
    stage: "assumption",
    scores,
    passed: assumptionEnforcedPass(scores),
    failureReasons: strArray(parsed.failureReasons),
    feedback: String(parsed.feedback ?? ""),
  };
}

export function sumAssumptionScores(grade: Extract<StageGrade, { stage: "assumption" }>): number {
  return (
    grade.scores.depth +
    grade.scores.coverage +
    grade.scores.independence +
    grade.scores.implicitness +
    grade.scores.contextualGrounding
  );
}

// --- Steelman

function steelmanEnforcedPass(scores: {
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
  const raw = await runGraderModel({
    system: STEELMAN_GRADER_SYSTEM_PROMPT,
    userContent,
    signal,
    label: "grade steelman",
  });
  const parsed = extractJsonObject(raw) as ParsedCommon;
  const s = parsed.scores ?? {};
  const scores = {
    strength: Number(s.strength ?? 0),
    specificity: Number(s.specificity ?? 0),
    novelty: Number(s.novelty ?? 0),
  };
  return {
    stage: "steelman",
    scores,
    passed: steelmanEnforcedPass(scores),
    failureReasons: strArray(parsed.failureReasons),
    feedback: String(parsed.feedback ?? ""),
  };
}

export function sumSteelmanScores(grade: Extract<StageGrade, { stage: "steelman" }>): number {
  return grade.scores.strength + grade.scores.specificity + grade.scores.novelty;
}

// --- Synthesis

function synthesisEnforcedPass(scores: {
  traceability: number;
  intellectualHonesty: number;
  completeness: number;
}): boolean {
  return (
    scores.traceability >= 4 && scores.intellectualHonesty >= 4 && scores.completeness >= 4
  );
}

export async function gradeSynthesisOutput(
  params: {
    decisionText: string;
    framingText: string;
    assumptionText: string;
    steelmanText: string;
    agentOutput: string;
    signal: AbortSignal;
  },
): Promise<Extract<StageGrade, { stage: "synthesis" }>> {
  const { decisionText, framingText, assumptionText, steelmanText, agentOutput, signal } =
    params;
  const userContent = `## Decision (user)\n${decisionText}\n\n## Framing\n${framingText}\n\n## Assumption excavation\n${assumptionText}\n\n## Steelman\n${steelmanText}\n\n## Synthesis output to grade\n${agentOutput}`;
  const raw = await runGraderModel({
    system: SYNTHESIS_GRADER_SYSTEM_PROMPT,
    userContent,
    signal,
    label: "grade synthesis",
  });
  const parsed = extractJsonObject(raw) as ParsedCommon;
  const s = parsed.scores ?? {};
  const scores = {
    traceability: Number(s.traceability ?? 0),
    intellectualHonesty: Number(s.intellectualHonesty ?? 0),
    completeness: Number(s.completeness ?? 0),
  };
  return {
    stage: "synthesis",
    scores,
    passed: synthesisEnforcedPass(scores),
    failureReasons: strArray(parsed.failureReasons),
    feedback: String(parsed.feedback ?? ""),
  };
}

export function sumSynthesisScores(grade: Extract<StageGrade, { stage: "synthesis" }>): number {
  return (
    grade.scores.traceability + grade.scores.intellectualHonesty + grade.scores.completeness
  );
}

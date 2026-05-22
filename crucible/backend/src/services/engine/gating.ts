import { env } from "../../config/env.js";
import { runAnthropic } from "../../providers/anthropic.js";
import { GATE_TIMEOUT_MS, assertNotCancelled } from "../../utils/pipelineCancel.js";
import { wrapInterrogationContent, GATE_SYSTEM_PROMPT } from "./prompts.js";
import type { GateResult } from "./types.js";

const PREDICTIVE_TERMS = /\b(will|should|likely|unlikely|forecast|predict|expect|assume|because|therefore|market|growth|risk|launch|scale|revenue|users|customers)\b/i;
const NUMERIC_CLAIMS = /\b\d+(\.\d+)?\s*(%|percent|x|times|users|customers|days|weeks|months|years|dollars|\$)\b/i;
const DOMAIN_TERMS = /\b(startup|pricing|sales|product|security|database|api|infrastructure|model|ai|fundraising|churn|retention|conversion)\b/i;

export function stage1Gate(content: string): { passed: boolean; reason: string } {
  const trimmed = content.trim();
  const signals = [
    trimmed.split(/\s+/).length > 200,
    PREDICTIVE_TERMS.test(trimmed),
    NUMERIC_CLAIMS.test(trimmed),
    DOMAIN_TERMS.test(trimmed),
  ];
  const count = signals.filter(Boolean).length;
  return {
    passed: count >= 1,
    reason: `heuristic_signals=${count}`,
  };
}

export async function runGate(
  content: string,
  cancel?: AbortSignal,
  userPosition?: string,
): Promise<GateResult> {
  assertNotCancelled(cancel);
  const stage1 = stage1Gate(content);
  if (!stage1.passed) {
    return {
      passed: false,
      stage1Passed: false,
      stage2Passed: null,
      reason: stage1.reason,
    };
  }

  const result = await runAnthropic({
    role: "critic",
    system: GATE_SYSTEM_PROMPT,
    user: wrapInterrogationContent(content, userPosition),
    model: env.ANTHROPIC_GATE_MODEL,
    timeoutMs: GATE_TIMEOUT_MS,
  });

  try {
    const parsed = JSON.parse(result.text) as { pass?: unknown; reason?: unknown };
    const stage2Passed = parsed.pass === true;
    return {
      passed: stage2Passed,
      stage1Passed: true,
      stage2Passed,
      reason: typeof parsed.reason === "string" ? parsed.reason : "gate_no_reason",
    };
  } catch {
    // Some providers sometimes wrap JSON in extra text or code fences.
    // Best-effort extraction so the gate doesn't hard-fail the whole pipeline.
    const raw = result.text.trim();
    const jsonCandidate = raw.match(/\{[\s\S]*\}/);
    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(jsonCandidate[0]) as { pass?: unknown; reason?: unknown };
        const stage2Passed = parsed.pass === true;
        return {
          passed: stage2Passed,
          stage1Passed: true,
          stage2Passed,
          reason: typeof parsed.reason === "string" ? parsed.reason : "gate_no_reason",
        };
      } catch {
        // fall through to regex parsing
      }
    }

    const passMatch = raw.match(/\bpass\s*[:=]\s*(true|false)\b/i);
    if (passMatch) {
      const stage2Passed = passMatch[1].toLowerCase() === "true";
      return {
        passed: stage2Passed,
        stage1Passed: true,
        stage2Passed,
        reason: "gate_parse_fallback",
      };
    }

    return {
      passed: false,
      stage1Passed: true,
      stage2Passed: false,
      reason: "gate_parse_error",
    };
  }
}

export function assertContentLength(content: string): void {
  if (content.length > env.MAX_CONTENT_CHARS) {
    const error = new Error(`Content exceeds ${env.MAX_CONTENT_CHARS} characters`);
    (error as Error & { statusCode: number; code: string }).statusCode = 413;
    (error as Error & { statusCode: number; code: string }).code = "CONTENT_TOO_LARGE";
    throw error;
  }
}

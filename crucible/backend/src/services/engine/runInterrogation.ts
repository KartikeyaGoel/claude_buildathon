import { getCachedResponse, putCachedResponse, recordCacheHit } from "./cache.js";
import { composeAndPersist } from "./composer.js";
import { assertContentLength, runGate } from "./gating.js";
import { runParallelAgents } from "./parallelAgents.js";
import { detectTier2Followthrough } from "./tier2.js";
import { judgeAssumptions } from "./validityJudge.js";
import { synthesizeFinalRecommendation } from "./synthesizeFinalRecommendation.js";
import type { InterrogationResponse, RunInterrogationInput } from "./types.js";

function makeController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

export async function runInterrogation(input: RunInterrogationInput): Promise<InterrogationResponse> {
  assertContentLength(input.content);

  const controller = makeController(input.signal);
  const domain = input.domain ?? "other";
  const originatingModel = input.originatingModel ?? "other";
  await detectTier2Followthrough(input.user, input.content, controller.signal);
  const cached = await getCachedResponse(input.content, domain, originatingModel);
  if (cached) {
    const { interrogationId, traceId } = await recordCacheHit({
      user: input.user,
      content: input.content,
      domain,
      originatingModel,
      sessionId: input.sessionId,
      source: input.source,
      response: cached,
    });
    if (cached.synthesis_text) {
      return {
        ...cached,
        interrogation_id: interrogationId,
        trace_id: traceId,
      };
    }

    // Backfill synthesis_text for older cached rows (before the synthesis stage was wired in).
    const steelmanText =
      cached.metadata.model_outputs.find((m) => m.role === "steelman")?.role != null
        ? "Raw steelman output unavailable because this cache row predates persisted synthesis_text."
        : "STEELMAN stage not available in this cached run.";

    const synthesisText = await synthesizeFinalRecommendation({
      decisionText: input.content,
      framingText: "Framing heuristics (gate reasoning) not persisted in cache; synthesizing from scored assumptions only.",
      assumptions: cached.assumptions,
      steelmanText,
      agentOutputs: [],
      signal: controller.signal,
    });

    return {
      ...cached,
      synthesis_text: synthesisText,
      interrogation_id: interrogationId,
      trace_id: traceId,
    };
  }

  const gate = await runGate(input.content, controller.signal);
  if (!gate.passed) {
    const error = new Error(gate.reason);
    (error as Error & { code: string; statusCode: number }).code = "GATE_BLOCKED";
    (error as Error & { code: string; statusCode: number }).statusCode = 422;
    throw error;
  }

  const agents = await runParallelAgents(input.content, controller.signal);
  const assumptions = await judgeAssumptions(agents.results, controller.signal);

  // Stage-4 style final recommendation for REST callers.
  const synthesisText = await synthesizeFinalRecommendation({
    decisionText: input.content,
    framingText: gate.reason,
    assumptions,
    steelmanText:
      agents.results.find((r) => r.role === "steelman")?.text ??
      "STEELMAN stage not available in this run.",
    agentOutputs: agents.results,
    signal: controller.signal,
  });

  const response = await composeAndPersist({
    user: input.user,
    content: input.content,
    domain,
    originatingModel,
    sessionId: input.sessionId,
    source: input.source,
    gate,
    agentResults: agents.results,
    degradedAgents: agents.degradedAgents,
    assumptions,
    synthesisText,
    signal: controller.signal,
  });

  await putCachedResponse(input.content, domain, originatingModel, response.trace_id, response);
  return response;
}

export type { AuthenticatedUser, InterrogationResponse, RunInterrogationInput } from "./types.js";

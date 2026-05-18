import { getCachedResponse, putCachedResponse, recordCacheHit } from "./cache.js";
import { composeAndPersist } from "./composer.js";
import { buildCognitiveGymPayload, formatSynthesisText } from "./cognitiveGym.js";
import { assertContentLength, runGate } from "./gating.js";
import { runParallelAgents } from "./parallelAgents.js";
import { detectTier2Followthrough } from "./tier2.js";
import { judgeAssumptions } from "./validityJudge.js";
import {
  synthesizeCognitiveGym,
  synthesizeFinalRecommendation,
} from "./synthesizeFinalRecommendation.js";
import type { InterrogationResponse, RunInterrogationInput } from "./types.js";

function makeController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

function assertUserPositionForMcp(source: RunInterrogationInput["source"], userPosition?: string): string | undefined {
  const trimmed = userPosition?.trim();
  if (source === "mcp" && !trimmed) {
    const error = new Error("user_position is required and cannot be empty");
    (error as Error & { code: string; statusCode: number }).code = "USER_POSITION_REQUIRED";
    (error as Error & { code: string; statusCode: number }).statusCode = 400;
    throw error;
  }
  return trimmed;
}

export async function runInterrogation(input: RunInterrogationInput): Promise<InterrogationResponse> {
  assertContentLength(input.content);

  const userPosition = assertUserPositionForMcp(input.source, input.userPosition);
  const controller = makeController(input.signal);
  const domain = input.domain ?? "other";
  const originatingModel = input.originatingModel ?? "other";
  await detectTier2Followthrough(input.user, input.content, controller.signal);
  const cached = await getCachedResponse(input.content, domain, originatingModel, userPosition);
  if (cached) {
    const { interrogationId, traceId } = await recordCacheHit({
      user: input.user,
      content: input.content,
      domain,
      originatingModel,
      sessionId: input.sessionId,
      source: input.source,
      response: cached,
      userPosition,
    });
    if (cached.synthesis_text || cached.cognitive_gym) {
      return {
        ...cached,
        interrogation_id: interrogationId,
        trace_id: traceId,
      };
    }

    const steelmanText =
      cached.metadata.model_outputs.find((m) => m.role === "steelman")?.role != null
        ? "Raw steelman output unavailable because this cache row predates persisted synthesis_text."
        : "STEELMAN stage not available in this cached run.";

    if (userPosition) {
      const synthesis = await synthesizeCognitiveGym({
        decisionText: input.content,
        userPosition,
        framingText:
          "Framing heuristics (gate reasoning) not persisted in cache; synthesizing from scored assumptions only.",
        assumptions: cached.assumptions,
        steelmanText,
        agentOutputs: [],
        fallbackDivergence: cached.divergence_score,
        signal: controller.signal,
      });

      return {
        ...cached,
        synthesis_text: formatSynthesisText(synthesis),
        cognitive_gym: buildCognitiveGymPayload({
          userPosition,
          framingText:
            "Framing heuristics (gate reasoning) not persisted in cache; synthesizing from scored assumptions only.",
          agentResults: [],
          synthesis,
        }),
        interrogation_id: interrogationId,
        trace_id: traceId,
      };
    }

    const synthesisText = await synthesizeFinalRecommendation({
      decisionText: input.content,
      framingText:
        "Framing heuristics (gate reasoning) not persisted in cache; synthesizing from scored assumptions only.",
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

  const gate = await runGate(input.content, controller.signal, userPosition);
  if (!gate.passed) {
    const error = new Error(gate.reason);
    (error as Error & { code: string; statusCode: number }).code = "GATE_BLOCKED";
    (error as Error & { code: string; statusCode: number }).statusCode = 422;
    throw error;
  }

  const agents = await runParallelAgents(input.content, controller.signal, userPosition);
  const assumptions = await judgeAssumptions(agents.results, controller.signal, userPosition);

  const steelmanText =
    agents.results.find((result) => result.role === "steelman")?.text ??
    "STEELMAN stage not available in this run.";

  let synthesisText: string | undefined;
  let cognitiveGym;

  if (userPosition) {
    const preliminaryDivergence = Math.min(
      1,
      agents.results.length / 4 + assumptions.reduce((sum, a) => sum + a.consequence, 0) / Math.max(assumptions.length, 1) / 2,
    );
    const synthesis = await synthesizeCognitiveGym({
      decisionText: input.content,
      userPosition,
      framingText: gate.reason,
      assumptions,
      steelmanText,
      agentOutputs: agents.results,
      fallbackDivergence: preliminaryDivergence,
      signal: controller.signal,
    });
    synthesisText = formatSynthesisText(synthesis);
    cognitiveGym = buildCognitiveGymPayload({
      userPosition,
      framingText: gate.reason,
      agentResults: agents.results,
      synthesis,
    });
  } else {
    synthesisText = await synthesizeFinalRecommendation({
      decisionText: input.content,
      framingText: gate.reason,
      assumptions,
      steelmanText,
      agentOutputs: agents.results,
      signal: controller.signal,
    });
  }

  const response = await composeAndPersist({
    user: input.user,
    content: input.content,
    userPosition,
    domain,
    originatingModel,
    sessionId: input.sessionId,
    source: input.source,
    gate,
    agentResults: agents.results,
    degradedAgents: agents.degradedAgents,
    assumptions,
    synthesisText,
    cognitiveGym,
    signal: controller.signal,
  });

  await putCachedResponse(input.content, domain, originatingModel, response.trace_id, response, userPosition);
  return response;
}

export type { AuthenticatedUser, InterrogationResponse, RunInterrogationInput } from "./types.js";

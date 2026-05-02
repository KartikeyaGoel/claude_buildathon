import { getCachedResponse, putCachedResponse, recordCacheHit } from "./cache.js";
import { composeAndPersist } from "./composer.js";
import { assertContentLength, runGate } from "./gating.js";
import { runParallelAgents } from "./parallelAgents.js";
import { detectTier2Followthrough } from "./tier2.js";
import { judgeAssumptions } from "./validityJudge.js";
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
    const interrogationId = await recordCacheHit({
      user: input.user,
      content: input.content,
      domain,
      originatingModel,
      sessionId: input.sessionId,
      source: input.source,
      response: cached,
    });
    return {
      ...cached,
      interrogation_id: interrogationId,
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
    signal: controller.signal,
  });

  await putCachedResponse(input.content, domain, originatingModel, response.trace_id, response);
  return response;
}

export type { AuthenticatedUser, InterrogationResponse, RunInterrogationInput } from "./types.js";

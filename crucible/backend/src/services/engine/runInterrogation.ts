import { getCachedResponse, putCachedResponse, recordCacheHit } from "./cache.js";
import { composeAndPersist } from "./composer.js";
import { buildCognitiveGymPayload, formatSynthesisText } from "./cognitiveGym.js";
import { formatContextBundleForPrompt, loadContextBundle } from "./contextBundle.js";
import { assertContentLength, runGate } from "./gating.js";
import { runLayeredAssumptionExcavation } from "./layeredExcavation.js";
import { runLightweightFraming } from "./mcpFraming.js";
import { runNegativeSpacePass } from "./negativeSpace.js";
import { runParallelAgents } from "./parallelAgents.js";
import { runTemporalStackPass } from "./temporalStack.js";
import { detectTier2Followthrough } from "./tier2.js";
import { judgeAssumptions } from "./validityJudge.js";
import {
  synthesizeCognitiveGym,
  synthesizeFinalRecommendation,
} from "./synthesizeFinalRecommendation.js";
import type { InterrogationResponse, PipelineAmplificationMeta, RunInterrogationInput } from "./types.js";
import type { DeliberationOnlyPayload } from "./types.js";
import { buildDeliberationOnlyPayload } from "./cognitiveGym.js";
import { assertNotCancelled } from "../../utils/pipelineCancel.js";

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
  const cancel = input.signal;
  const domain = input.domain ?? "other";
  const originatingModel = input.originatingModel ?? "other";
  const useMcpPipeline = input.source === "mcp";

  assertNotCancelled(cancel);
  await detectTier2Followthrough(input.user, input.content, cancel);
  const cached = await getCachedResponse(input.content, domain, originatingModel, userPosition);
  if (cached) {
    if (input.deferSynthesis && (!cached.deliberation || !cached.staged_meta)) {
      // MCP stdio uses stdout for JSON-RPC only — log to stderr.
      console.error("[engine] cache entry cannot satisfy staged deliberation; running full pipeline");
    } else {
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

      if (input.deferSynthesis && cached.deliberation && cached.staged_meta) {
        return {
          ...cached,
          interrogation_id: interrogationId,
          trace_id: traceId,
          deliberation: cached.deliberation,
          staged_meta: cached.staged_meta,
        };
      }

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
          cancel,
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
        cancel,
      });

      return {
        ...cached,
        synthesis_text: synthesisText,
        interrogation_id: interrogationId,
        trace_id: traceId,
      };
    }
  }

  assertNotCancelled(cancel);
  const gate = await runGate(input.content, cancel, userPosition);
  if (!gate.passed) {
    const error = new Error(gate.reason);
    (error as Error & { code: string; statusCode: number }).code = "GATE_BLOCKED";
    (error as Error & { code: string; statusCode: number }).statusCode = 422;
    throw error;
  }

  const contextBundle =
    input.contextBundle ?? (await loadContextBundle(input.user.id));
  const contextBundleText = formatContextBundleForPrompt(contextBundle);

  const amplification: PipelineAmplificationMeta = {
    context_bundle_loaded: contextBundleText.length > 0,
    mcp_framing: useMcpPipeline,
    layered_excavation: useMcpPipeline,
  };

  assertNotCancelled(cancel);

  const framingText = useMcpPipeline
    ? await runLightweightFraming({
        content: input.content,
        userPosition,
        contextBundle,
        cancel,
      })
    : gate.reason;

  const [agents, negativeSpaceText, layeredExcavation] = await Promise.all([
    runParallelAgents(input.content, userPosition),
    runNegativeSpacePass({
      content: input.content,
      framingText,
      userPosition,
      contextBundleText,
      cancel,
    }),
    useMcpPipeline
      ? runLayeredAssumptionExcavation({
          content: input.content,
          framingText,
          userPosition,
          contextBundle,
          cancel,
        })
      : Promise.resolve(null),
  ]);

  amplification.negative_space_output = negativeSpaceText;

  const judgeInputs = [...agents.results];
  if (negativeSpaceText.trim()) {
    judgeInputs.push({
      role: "blindspot",
      model: "negative-space",
      text: `NEGATIVE SPACE PASS:\n${negativeSpaceText}`,
      latencyMs: 0,
      timedOut: false,
    });
  }
  if (layeredExcavation) {
    judgeInputs.push(layeredExcavation);
  }

  assertNotCancelled(cancel);
  const assumptions = await judgeAssumptions(judgeInputs, cancel, userPosition);

  assertNotCancelled(cancel);
  const { text: temporalStackText, stacks: temporalStacks } = await runTemporalStackPass({
    content: input.content,
    framingText,
    assumptions,
    cancel,
  });
  amplification.temporal_stack = temporalStacks;

  const steelmanText =
    agents.results.find((result) => result.role === "steelman")?.text ??
    "STEELMAN stage not available in this run.";

  let synthesisText: string | undefined;
  let cognitiveGym;
  let deliberationOnly: DeliberationOnlyPayload | undefined;

  const gymAgentResults = layeredExcavation ? [...agents.results, layeredExcavation] : agents.results;
  const preliminaryDivergence = Math.min(
    1,
    agents.results.length / 4 +
      assumptions.reduce((sum, a) => sum + a.consequence, 0) / Math.max(assumptions.length, 1) / 2,
  );

  if (userPosition && input.deferSynthesis) {
    deliberationOnly = buildDeliberationOnlyPayload({
      userPosition,
      framingText,
      agentResults: gymAgentResults,
      negativeSpaceText,
      temporalStackText: temporalStackText,
      temporalStacks,
    });
  } else if (userPosition) {
    const synthesis = await synthesizeCognitiveGym({
      decisionText: input.content,
      userPosition,
      framingText,
      assumptions,
      steelmanText,
      agentOutputs: gymAgentResults,
      negativeSpaceText,
      temporalStackText,
      contextBundleText,
      fallbackDivergence: preliminaryDivergence,
      cancel,
    });
    synthesisText = formatSynthesisText(synthesis);
    cognitiveGym = buildCognitiveGymPayload({
      userPosition,
      framingText,
      agentResults: gymAgentResults,
      synthesis,
      negativeSpaceText,
      temporalStackText,
      temporalStacks,
    });
  } else {
    synthesisText = await synthesizeFinalRecommendation({
      decisionText: input.content,
      framingText,
      assumptions,
      steelmanText,
      agentOutputs: gymAgentResults,
      contextBundleText,
      negativeSpaceText,
      temporalStackText,
      cancel,
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
    framingText,
    agentResults: gymAgentResults,
    degradedAgents: agents.degradedAgents,
    assumptions,
    synthesisText,
    cognitiveGym,
    pipelineAmplification: {
      ...amplification,
      framing_text: framingText,
      steelman_text: steelmanText,
      negative_space_output: negativeSpaceText,
      temporal_stack: temporalStacks,
      context_bundle_text: contextBundleText,
      preliminary_divergence: preliminaryDivergence,
      defer_synthesis: Boolean(input.deferSynthesis),
    },
    cancel,
  });

  if (input.deferSynthesis && deliberationOnly) {
    const stagedResponse = {
      ...response,
      deliberation: deliberationOnly,
      staged_meta: {
        framingText,
        steelmanText,
        negativeSpaceText,
        temporalStackText,
        temporalStacks,
        contextBundleText,
        preliminaryDivergence,
        agentResults: gymAgentResults.map((r) => ({
          role: r.role,
          model: r.model,
          text: r.text,
          latencyMs: r.latencyMs,
        })),
      },
    };
    await putCachedResponse(input.content, domain, originatingModel, response.trace_id, stagedResponse, userPosition);
    return stagedResponse;
  }

  await putCachedResponse(input.content, domain, originatingModel, response.trace_id, response, userPosition);
  return response;
}

export type { AuthenticatedUser, InterrogationResponse, RunInterrogationInput } from "./types.js";

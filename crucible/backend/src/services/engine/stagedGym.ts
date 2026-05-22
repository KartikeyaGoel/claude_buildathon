import type { ProviderResult } from "../../providers/types.js";
import {
  formatSynthesisText,
} from "./cognitiveGym.js";
import { findSignificantDisagreement } from "./cognitiveGymPresentation.js";
import {
  completeGymSession,
  createGymSession,
  getGymSessionForUser,
  markStaleGymSessionsAbandoned,
  recordUserJudgment,
} from "./gymSession.js";
import { query } from "../../db/client.js";
import { runInterrogation } from "./runInterrogation.js";
import { synthesizeCognitiveGym } from "./synthesizeFinalRecommendation.js";
import type {
  AuthenticatedUser,
  CognitiveGymSynthesis,
  DeliberationResponse,
  DeliberationSnapshot,
  GymSessionStatus,
  InterrogationResponse,
} from "./types.js";

function makeSignal(signal?: AbortSignal): AbortSignal {
  if (signal) return signal;
  return new AbortController().signal;
}

function buildSnapshot(
  response: InterrogationResponse,
  content: string,
  domain: string,
  userPosition: string,
): DeliberationSnapshot {
  const meta = response.staged_meta!;
  return {
    content,
    domain,
    user_position: userPosition,
    framing_text: meta.framingText,
    assumptions: response.assumptions,
    agent_results: meta.agentResults,
    steelman_text: meta.steelmanText,
    negative_space_text: meta.negativeSpaceText,
    temporal_stack_text: meta.temporalStackText,
    temporal_stacks: meta.temporalStacks,
    context_bundle_text: meta.contextBundleText,
    preliminary_divergence: meta.preliminaryDivergence,
    deliberation_stages: response.deliberation!,
  };
}

export async function runDeliberation(input: {
  user: AuthenticatedUser;
  content: string;
  userPosition: string;
  domain?: string;
  context?: string;
  originatingModel?: string;
  signal?: AbortSignal;
}): Promise<DeliberationResponse> {
  await markStaleGymSessionsAbandoned(input.user.id);

  const response = (await runInterrogation({
    user: input.user,
    content: input.content,
    userPosition: input.userPosition,
    domain: input.domain,
    context: input.context,
    originatingModel: input.originatingModel,
    source: "mcp",
    signal: input.signal,
    deferSynthesis: true,
  })) as InterrogationResponse;

  if (!response.deliberation || !response.staged_meta) {
    throw new Error("Deliberation payload missing — deferSynthesis pipeline failed");
  }

  const disagreement = findSignificantDisagreement(response.deliberation);

  const snapshot = buildSnapshot(
    response,
    input.content,
    input.domain ?? "other",
    input.userPosition,
  );

  await createGymSession({
    traceId: response.trace_id,
    icrId: response.interrogation_id,
    userId: input.user.id,
    userPosition: input.userPosition,
    disagreementQuestion: disagreement.question,
    deliberationSnapshot: snapshot,
  });

  return {
    ...response,
    deliberation: response.deliberation,
    disagreement,
    gym_session_status: "awaiting_judgment",
  };
}

export async function runGymSynthesis(input: {
  user: AuthenticatedUser;
  traceId: string;
  userJudgment: string;
  signal?: AbortSignal;
}): Promise<{
  trace_id: string;
  synthesis: CognitiveGymSynthesis;
  synthesis_text: string;
  gym_session_status: GymSessionStatus;
  closing_question: string;
}> {
  const judgment = input.userJudgment.trim();
  if (!judgment) {
    throw new Error("user_judgment is required and cannot be empty");
  }

  const session = await getGymSessionForUser(input.traceId, input.user.id);
  if (!session) throw new Error("Cognitive Gym session not found");
  if (session.status === "abandoned") {
    throw new Error("This session has expired. Start a new deliberate call.");
  }
  if (session.status !== "awaiting_judgment") {
    throw new Error(`Session is not awaiting judgment (status: ${session.status})`);
  }

  const snap = session.deliberation_snapshot;
  const synthesis = await synthesizeCognitiveGym({
    decisionText: snap.content,
    userPosition: snap.user_position,
    framingText: snap.framing_text,
    assumptions: snap.assumptions,
    steelmanText: snap.steelman_text,
    agentOutputs: snap.agent_results.map(
      (r): ProviderResult => ({
        role: r.role as ProviderResult["role"],
        model: r.model,
        text: r.text,
        latencyMs: r.latencyMs,
        timedOut: false,
      }),
    ),
    negativeSpaceText: snap.negative_space_text,
    temporalStackText: snap.temporal_stack_text,
    contextBundleText: snap.context_bundle_text,
    userJudgment: judgment,
    fallbackDivergence: snap.preliminary_divergence,
    cancel: makeSignal(input.signal),
  });

  await recordUserJudgment({
    traceId: input.traceId,
    userId: input.user.id,
    userJudgment: judgment,
    synthesisSnapshot: synthesis as unknown as Record<string, unknown>,
  });

  await query(
    `UPDATE deliberation_traces dt
     SET pipeline_amplification = COALESCE(dt.pipeline_amplification, '{}'::jsonb) || $1::jsonb
     FROM interrogation_context_records icr
     WHERE dt.icr_id = icr.id AND icr.trace_id = $2 AND icr.user_id = $3`,
    [
      JSON.stringify({ synthesis_deferred: true, user_judgment: judgment, synthesis }),
      input.traceId,
      input.user.id,
    ],
  );

  const closingQuestion =
    "Given everything that surfaced — your position held here, cracked here, and you missed this — what do you now believe? Has your position changed, and if so, where specifically?";

  return {
    trace_id: input.traceId,
    synthesis,
    synthesis_text: formatSynthesisText(synthesis),
    gym_session_status: "awaiting_recommitment",
    closing_question: closingQuestion,
  };
}

export async function runGymCommit(input: {
  user: AuthenticatedUser;
  traceId: string;
  finalPosition: string;
  outcome?: "proceeded" | "modified" | "abandoned";
  notes?: string;
}): Promise<{
  trace_id: string;
  initial_position: string;
  final_position: string;
  position_changed: boolean;
  gym_session_status: GymSessionStatus;
}> {
  const finalPosition = input.finalPosition.trim();
  if (!finalPosition) {
    throw new Error("final_position is required and cannot be empty");
  }

  const session = await getGymSessionForUser(input.traceId, input.user.id);
  if (!session) throw new Error("Cognitive Gym session not found");
  if (session.status === "abandoned") {
    throw new Error("This session has expired. Start a new deliberate call.");
  }
  if (session.status !== "awaiting_recommitment") {
    throw new Error(`Session is not awaiting recommitment (status: ${session.status})`);
  }

  await completeGymSession({
    traceId: input.traceId,
    userId: input.user.id,
    finalPosition,
  });

  await query(
    "INSERT INTO cognitive_position_commitments (icr_id, user_id, trace_id, initial_position, final_position, source, metadata) VALUES ($1, $2, $3, $4, $5, 'mcp', $6::jsonb)",
    [
      session.icr_id,
      input.user.id,
      input.traceId,
      session.user_position,
      finalPosition,
      JSON.stringify({
        user_judgment: session.user_judgment,
        notes: input.notes ?? null,
        staged_flow: true,
      }),
    ],
  );

  if (input.outcome) {
    await query(
      "INSERT INTO resolution_artifacts (icr_id, user_id, decision, outcome, metadata) VALUES ($1, $2, 'gym_commit', $3, $4::jsonb)",
      [
        session.icr_id,
        input.user.id,
        input.outcome,
        JSON.stringify({ notes: input.notes ?? null, staged_flow: true }),
      ],
    );
  }

  return {
    trace_id: input.traceId,
    initial_position: session.user_position,
    final_position: finalPosition,
    position_changed: session.user_position.trim().toLowerCase() !== finalPosition.toLowerCase(),
    gym_session_status: "complete",
  };
}

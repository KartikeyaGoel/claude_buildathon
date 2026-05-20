import type { DeliberationResponse } from "../services/engine/types.js";
import type { CognitiveGymSynthesis, GymSessionStatus } from "../services/engine/types.js";

export function formatDeliberateResponse(response: DeliberationResponse): string {
  const payload = {
    trace_id: response.trace_id,
    interrogation_id: response.interrogation_id,
    status: response.gym_session_status,
    user_position_echo: response.deliberation.user_position_echo,
    deliberation: {
      framing: response.deliberation.framing,
      assumption_excavation: response.deliberation.assumption_excavation,
      steelman: response.deliberation.steelman,
      negative_space: response.deliberation.negative_space,
      temporal_stack: response.deliberation.temporal_stack,
    },
    assumptions: response.assumptions,
    disagreement_question: response.disagreement.question,
    divergence: response.divergence_score,
    reliability: response.reliability_signal,
  };

  return [
    "CRUCIBLE COGNITIVE GYM — STEP 1: DELIBERATION",
    "==============================================",
    "",
    "STRUCTURED_PAYLOAD_JSON",
    JSON.stringify(payload, null, 2),
    "",
    "MANDATORY PRESENTATION (do not skip)",
    "1. Do NOT dump raw JSON to the user.",
    "2. Do NOT present synthesis — it does not exist yet. Synthesis is locked until the user answers.",
    "3. Summarize the most important tensions from deliberation in 2–4 sentences max.",
    "4. Ask the user EXACTLY this one question and STOP:",
    response.disagreement.question,
    "",
    "5. Wait for the user's answer. Then call `synthesize` with trace_id and user_judgment (their answer).",
    "6. Do NOT call `interrogate` for follow-up steps — use the staged tools.",
    "",
    `trace_id: ${response.trace_id}`,
    `session_status: ${response.gym_session_status}`,
  ].join("\n");
}

export function formatSynthesizeResponse(result: {
  trace_id: string;
  synthesis: CognitiveGymSynthesis;
  synthesis_text: string;
  gym_session_status: GymSessionStatus;
  closing_question: string;
}): string {
  const payload = {
    trace_id: result.trace_id,
    status: result.gym_session_status,
    synthesis: result.synthesis,
  };

  return [
    "CRUCIBLE COGNITIVE GYM — STEP 2: SYNTHESIS",
    "==========================================",
    "",
    "STRUCTURED_PAYLOAD_JSON",
    JSON.stringify(payload, null, 2),
    "",
    "MANDATORY PRESENTATION",
    "1. Present synthesis: position_held, position_cracked, position_missed.",
    "2. If implicit_assumptions_surfaced is present, list each with lens, why_implicit, and test.",
    "3. Ask the user EXACTLY this closing question:",
    `"${result.closing_question}"`,
    "4. Wait for the user's answer. Then call `commit` with trace_id and final_position (their words).",
    "",
    `trace_id: ${result.trace_id}`,
    `session_status: ${result.gym_session_status}`,
  ].join("\n");
}

export function formatCommitResponse(result: {
  trace_id: string;
  initial_position: string;
  final_position: string;
  position_changed: boolean;
  gym_session_status: GymSessionStatus;
}): string {
  return [
    "CRUCIBLE COGNITIVE GYM — COMPLETE",
    "=================================",
    "",
    JSON.stringify(result, null, 2),
    "",
    "The cognitive gym loop is complete. Position delta recorded.",
    result.position_changed
      ? "The user's position changed during this session."
      : "The user's position did not materially change.",
    "",
    `trace_id: ${result.trace_id}`,
    `session_status: ${result.gym_session_status}`,
  ].join("\n");
}

/** @deprecated Use formatDeliberateResponse / staged tools instead. */
export function formatInterrogation(response: import("../services/engine/types.js").InterrogationResponse): string {
  if (response.deliberation) {
    return formatDeliberateResponse(response as DeliberationResponse);
  }

  const assumptions = response.assumptions
    .sort((a, b) => b.consequence - a.consequence)
    .map((assumption, index) => {
      const flaggedBy = assumption.sourceModels.length > 0 ? assumption.sourceModels.join(", ") : "unknown";
      return `[${index + 1}] [${assumption.type}] ${assumption.text}\n    Flagged by: ${flaggedBy}\n    Score: ${assumption.compositeScore.toFixed(2)}`;
    })
    .join("\n");

  return [
    "CRUCIBLE INTERROGATION (legacy)",
    "---------------------",
    `DIVERGENCE: ${response.reliability_signal} (${response.divergence_score.toFixed(2)})`,
    "",
    "FINAL SYNTHESIS",
    response.synthesis_text || "No synthesis was produced for this interrogation.",
    "",
    "ASSUMPTIONS SURFACED",
    assumptions || "None surfaced.",
    "",
    `trace_id: ${response.trace_id}`,
    `interrogation_id: ${response.interrogation_id}`,
  ].join("\n");
}

/** @deprecated Synthesis is no longer returned in step 1. */
export function formatCognitiveGymInterrogation(
  response: import("../services/engine/types.js").InterrogationResponse,
): string {
  return formatInterrogation(response);
}

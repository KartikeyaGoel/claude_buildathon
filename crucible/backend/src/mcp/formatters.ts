import type { InterrogationResponse } from "../services/engine/types.js";

export function formatInterrogation(response: InterrogationResponse): string {
  const assumptions = response.assumptions
    .sort((a, b) => b.consequence - a.consequence)
    .map((assumption, index) => {
      const flaggedBy = assumption.sourceModels.length > 0 ? assumption.sourceModels.join(", ") : "unknown";
      return `[${index + 1}] [${assumption.type}] ${assumption.text}\n    Flagged by: ${flaggedBy}\n    Score: ${assumption.compositeScore.toFixed(2)}`;
    })
    .join("\n");

  return [
    "CRUCIBLE INTERROGATION",
    "---------------------",
    `DIVERGENCE: ${response.reliability_signal} (${response.divergence_score.toFixed(2)})`,
    "",
    "ASSUMPTIONS SURFACED",
    assumptions || "None surfaced.",
    "",
    `trace_id: ${response.trace_id}`,
    `interrogation_id: ${response.interrogation_id}`,
  ].join("\n");
}

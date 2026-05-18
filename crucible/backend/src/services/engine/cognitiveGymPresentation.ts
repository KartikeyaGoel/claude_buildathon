import type { CognitiveGymPayload } from "./types.js";

function summarizeAgentText(text: string, maxLength = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function pickContrastingPair(outputs: string[]): { sideA: string; sideB: string } | null {
  if (outputs.length < 2) return null;

  let bestPair: { sideA: string; sideB: string; distance: number } | null = null;
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      const a = outputs[i]!;
      const b = outputs[j]!;
      const distance = Math.abs(a.length - b.length) + (a === b ? 0 : 40);
      if (!bestPair || distance > bestPair.distance) {
        bestPair = { sideA: a, sideB: b, distance };
      }
    }
  }

  return bestPair ? { sideA: bestPair.sideA, sideB: bestPair.sideB } : null;
}

export function findSignificantDisagreement(gym: CognitiveGymPayload): {
  question: string;
  sideA: string;
  sideB: string;
} {
  const stages: Array<{ name: string; outputs: string[]; divergence: number }> = [
    { name: "assumption excavation", outputs: gym.assumption_excavation.agent_outputs, divergence: gym.assumption_excavation.divergence_score },
    { name: "steelman", outputs: gym.steelman.agent_outputs, divergence: gym.steelman.divergence_score },
    { name: "framing", outputs: gym.framing.agent_outputs, divergence: gym.framing.divergence_score },
  ];

  const ranked = stages
    .filter((stage) => stage.outputs.length >= 2)
    .sort((a, b) => b.divergence - a.divergence);

  const stage = ranked[0] ?? stages[0]!;
  const pair = pickContrastingPair(stage.outputs) ?? {
    sideA: stage.outputs[0] ?? "No agent output",
    sideB: stage.outputs[1] ?? gym.synthesis.position_cracked,
  };

  return {
    question: `The agents split during ${stage.name}. Which crack matters more to your position — "${summarizeAgentText(pair.sideA)}" or "${summarizeAgentText(pair.sideB)}" — and why?`,
    sideA: summarizeAgentText(pair.sideA),
    sideB: summarizeAgentText(pair.sideB),
  };
}

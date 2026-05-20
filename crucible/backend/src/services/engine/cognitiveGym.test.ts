import { describe, expect, it } from "vitest";
import {
  computeStageDivergence,
  isNoPriorPosition,
  NO_PRIOR_POSITION_PHRASE,
  parseCognitiveGymSynthesis,
} from "./cognitiveGym.js";

describe("cognitiveGym", () => {
  it("detects no prior position phrase", () => {
    expect(isNoPriorPosition(NO_PRIOR_POSITION_PHRASE)).toBe(true);
    expect(isNoPriorPosition("  No Prior Position, Approaching Fresh  ")).toBe(true);
    expect(isNoPriorPosition("I believe the launch will succeed")).toBe(false);
  });

  it("parses structured synthesis JSON", () => {
    const parsed = parseCognitiveGymSynthesis(
      JSON.stringify({
        position_held: "held",
        position_cracked: "cracked",
        position_missed: "missed",
        overall_confidence: 0.8,
        overall_divergence: 0.4,
        implicit_assumptions_surfaced: [
          {
            assumption: "Market stays liquid",
            lens: "temporal",
            visibility: "implicit",
            why_implicit: "Never stated",
            test: "Check bid-ask spreads",
          },
        ],
      }),
      0.2,
    );

    expect(parsed.position_held).toBe("held");
    expect(parsed.position_cracked).toBe("cracked");
    expect(parsed.position_missed).toBe("missed");
    expect(parsed.overall_confidence).toBe(0.8);
    expect(parsed.overall_divergence).toBe(0.4);
    expect(parsed.implicit_assumptions_surfaced).toHaveLength(1);
    expect(parsed.implicit_assumptions_surfaced![0]!.test).toContain("bid-ask");
  });

  it("computes higher divergence when agent confidences diverge", () => {
    const low = computeStageDivergence([
      '{"confidence":0.9}',
      '{"confidence":0.88}',
    ]);
    const high = computeStageDivergence([
      '{"confidence":0.9}',
      '{"confidence":0.2}',
    ]);
    expect(high).toBeGreaterThan(low);
  });
});

import { describe, expect, it } from "vitest";
import { parseTemporalStackResponse } from "./temporalStack.js";
import type { ScoredAssumption } from "./types.js";

const sampleAssumptions: ScoredAssumption[] = [
  {
    text: "Demand will grow",
    type: "predictive",
    domain: "general",
    validity: 0.5,
    consequence: 0.8,
    novelty: 0.4,
    compositeScore: 0.6,
    sourceModels: ["advocate"],
  },
];

describe("temporalStack", () => {
  it("parses structured temporal stack JSON", () => {
    const raw = JSON.stringify({
      stacks: [
        {
          source_assumption: "Demand will grow",
          variants: [
            {
              horizon: "90d",
              assumption_variant: "Demand flat in Q1",
              divergence_from_present: 0.3,
              rationale: "Near-term",
            },
            {
              horizon: "2yr",
              assumption_variant: "Demand doubles",
              divergence_from_present: 0.7,
              rationale: "Medium-term",
            },
            {
              horizon: "10yr",
              assumption_variant: "Category commoditized",
              divergence_from_present: 0.9,
              rationale: "Long-term",
            },
          ],
          max_divergence: 0.9,
        },
      ],
    });

    const stacks = parseTemporalStackResponse(raw, sampleAssumptions);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.variants).toHaveLength(3);
    expect(stacks[0]!.max_divergence).toBe(0.9);
  });

  it("falls back when JSON is invalid", () => {
    const stacks = parseTemporalStackResponse("not json", sampleAssumptions);
    expect(stacks.length).toBeGreaterThan(0);
    expect(stacks[0]!.source_assumption).toBe("Demand will grow");
  });
});

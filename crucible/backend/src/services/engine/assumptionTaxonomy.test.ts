import { describe, expect, it } from "vitest";
import { passesValidityJudgeFilter, parseTaxonomyFromRaw } from "./assumptionTaxonomy.js";
import { mapRawJudgeAssumption as mapFromJudge } from "./validityJudge.js";

describe("assumptionTaxonomy", () => {
  it("parses taxonomy fields from raw objects", () => {
    const parsed = parseTaxonomyFromRaw({
      visibility: "implicit",
      lens: "temporal",
      load_bearing: true,
    });
    expect(parsed.visibility).toBe("implicit");
    expect(parsed.lens).toBe("temporal");
    expect(parsed.load_bearing).toBe(true);
  });

  it("passes filter when composite >= 0.4", () => {
    expect(passesValidityJudgeFilter({ compositeScore: 0.4, novelty: 0.1 })).toBe(true);
    expect(passesValidityJudgeFilter({ compositeScore: 0.39, novelty: 0.1 })).toBe(false);
  });

  it("passes filter when novelty >= 0.7", () => {
    expect(passesValidityJudgeFilter({ compositeScore: 0.1, novelty: 0.7 })).toBe(true);
  });

  it("passes filter when visibility is implicit regardless of scores", () => {
    expect(
      passesValidityJudgeFilter({ compositeScore: 0.1, novelty: 0.1, visibility: "implicit" }),
    ).toBe(true);
  });
});

describe("validityJudge mapRawJudgeAssumption", () => {
  it("retains implicit low-score assumptions", () => {
    const mapped = mapFromJudge({
      assumption_text: "Market will remain liquid",
      validity: 0.2,
      consequence: 0.2,
      novelty: 0.2,
      composite_score: 0.2,
      visibility: "implicit",
      lens: "temporal",
      load_bearing: true,
    });
    expect(mapped?.visibility).toBe("implicit");
    expect(mapped?.text).toContain("liquid");
  });

  it("drops low-score explicit assumptions", () => {
    const mapped = mapFromJudge({
      assumption_text: "Minor detail",
      validity: 0.2,
      consequence: 0.2,
      novelty: 0.2,
      composite_score: 0.2,
      visibility: "explicit",
    });
    expect(mapped).toBeNull();
  });
});

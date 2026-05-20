import { describe, expect, it } from "vitest";
import { formatContextBundleForPrompt } from "./contextBundle.js";
import type { ContextBundle } from "./types.js";

describe("contextBundle", () => {
  it("returns empty string for empty bundle", () => {
    expect(
      formatContextBundleForPrompt({
        position_commitments: [],
        recurring_assumptions: [],
        prior_session_summaries: [],
      }),
    ).toBe("");
  });

  it("formats all bundle sections", () => {
    const bundle: ContextBundle = {
      position_commitments: [
        {
          initial_position: "Ship in Q1",
          final_position: "Delay to Q2",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      recurring_assumptions: [
        { text: "Team velocity is stable", times_flagged: 3, canonical_id: "ca-1" },
      ],
      prior_session_summaries: [
        {
          trace_id: "t-1",
          domain: "technical",
          summary: "High divergence on launch timing",
          created_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    };

    const formatted = formatContextBundleForPrompt(bundle);
    expect(formatted).toContain("Cognitive context bundle");
    expect(formatted).toContain("Ship in Q1");
    expect(formatted).toContain("Team velocity");
    expect(formatted).toContain("launch timing");
  });
});

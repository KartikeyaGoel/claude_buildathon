import { describe, expect, it } from "vitest";
import { assertContentLength, stage1Gate } from "./gating.js";

describe("stage1Gate", () => {
  it("passes consequential predictive content", () => {
    const result = stage1Gate("Our startup will grow 20% in 2025 because AI adoption is accelerating in the market.");
    expect(result.passed).toBe(true);
  });

  it("blocks low-signal content", () => {
    const result = stage1Gate("hello there");
    expect(result.passed).toBe(false);
  });
});

describe("assertContentLength", () => {
  it("throws a structured 413 when content is too long", () => {
    expect(() => assertContentLength("x".repeat(50_001))).toThrow(/exceeds/);
  });
});

import { describe, expect, it } from "vitest";
import { constantTimeEqual, contentHash, generateApiKey, normalizeForCache } from "./crypto.js";

describe("crypto helpers", () => {
  it("normalizes cache keys with trim, lowercase, and NFKC", () => {
    expect(normalizeForCache("  ＡI Market  ")).toBe("ai market");
    expect(contentHash("  ＡI Market  ")).toBe(contentHash("ai market"));
  });

  it("generates high-entropy prefixed API keys", () => {
    expect(generateApiKey()).toMatch(/^crk_live_[A-Za-z0-9_-]+$/);
  });

  it("compares equal-length secrets in constant time", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

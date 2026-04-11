import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./jsonExtract.js";

describe("extractJsonObject", () => {
  it("parses JSON from prose wrapper", () => {
    const raw = `Here is the result:
{"passed":true,"scores":{"depth":4}}
Thanks.`;
    expect(extractJsonObject(raw)).toEqual({ passed: true, scores: { depth: 4 } });
  });

  it("uses outermost object when nested", () => {
    const raw = `{"outer":{"inner":1}}`;
    expect(extractJsonObject(raw)).toEqual({ outer: { inner: 1 } });
  });

  it("throws when no object", () => {
    expect(() => extractJsonObject("no json")).toThrow(/No JSON object/);
  });
});

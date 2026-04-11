import { describe, expect, it } from "vitest";
import { formatSseMessage, pushEventBuffer, replaySince, type BufferedSseEvent } from "./sseHelpers.js";

describe("sseHelpers", () => {
  it("formatSseMessage embeds id in JSON payload and SSE id line", () => {
    const evt: BufferedSseEvent = {
      id: 7,
      event: "stage_start",
      data: { stage: "framing" },
    };
    const s = formatSseMessage(evt);
    expect(s).toContain("id: 7\n");
    expect(s).toContain('event: stage_start\n');
    expect(s).toMatch(/"id":7/);
    expect(s).toMatch(/"stage":"framing"/);
  });

  it("replaySince returns events strictly after Last-Event-ID", () => {
    const buf: BufferedSseEvent[] = [
      { id: 1, event: "stage_start", data: { stage: "framing" } },
      { id: 2, event: "agent_chunk", data: { stage: "framing", text: "a" } },
      { id: 3, event: "agent_chunk", data: { stage: "framing", text: "b" } },
    ];
    expect(replaySince(buf, "1")).toEqual(buf.slice(1));
    expect(replaySince(buf, "3")).toEqual([]);
    expect(replaySince(buf, undefined)).toEqual([]);
    expect(replaySince(buf, "not-a-number")).toEqual([]);
  });

  it("pushEventBuffer keeps at most 100 events (FIFO)", () => {
    const buf: BufferedSseEvent[] = [];
    for (let i = 1; i <= 105; i++) {
      pushEventBuffer(buf, { id: i, event: "agent_chunk", data: { stage: "framing", text: "" } });
    }
    expect(buf.length).toBe(100);
    expect(buf[0]!.id).toBe(6);
    expect(buf[99]!.id).toBe(105);
  });
});

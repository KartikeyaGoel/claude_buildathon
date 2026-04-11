import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "./SessionStore.js";

describe("SessionStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts stale sessions when the 5-minute cleanup tick runs", () => {
    const store = new SessionStore(30);
    const s = store.create("decision");
    store.startCleanupInterval();
    vi.advanceTimersByTime(31 * 60_000);
    vi.advanceTimersByTime(5 * 60_000);
    expect(store.get(s.id)).toBeUndefined();
  });

  it("get refreshes activity so a session survives past idle threshold", () => {
    const store = new SessionStore(30);
    const s = store.create("x");
    store.startCleanupInterval();
    vi.advanceTimersByTime(20 * 60_000);
    expect(store.get(s.id)).toBeDefined();
    vi.advanceTimersByTime(20 * 60_000);
    vi.advanceTimersByTime(5 * 60_000);
    expect(store.get(s.id)).toBeDefined();
  });
});

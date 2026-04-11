import { env } from "../config/env.js";
import { CrucibleSession } from "./CrucibleSession.js";

export class SessionStore {
  private readonly sessions = new Map<string, CrucibleSession>();
  private readonly ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMinutes: number = env.SESSION_TTL_MINUTES) {
    this.ttlMs = ttlMinutes * 60_000;
  }

  startCleanupInterval(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.evictStale(), 5 * 60_000);
    this.cleanupTimer.unref?.();
  }

  create(decisionText: string): CrucibleSession {
    const session = new CrucibleSession(decisionText);
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): CrucibleSession | undefined {
    const s = this.sessions.get(id);
    if (s) s.touch();
    return s;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityMs > this.ttlMs) {
        session.abortController.abort();
        this.sessions.delete(id);
      }
    }
  }
}

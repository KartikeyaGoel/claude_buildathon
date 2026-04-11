import { env } from "../config/env.js";
import { CrucibleSession } from "./CrucibleSession.js";
export class SessionStore {
    sessions = new Map();
    ttlMs;
    cleanupTimer = null;
    constructor(ttlMinutes = env.SESSION_TTL_MINUTES) {
        this.ttlMs = ttlMinutes * 60_000;
    }
    startCleanupInterval() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => this.evictStale(), 5 * 60_000);
        this.cleanupTimer.unref?.();
    }
    create(decisionText) {
        const session = new CrucibleSession(decisionText);
        this.sessions.set(session.id, session);
        return session;
    }
    get(id) {
        const s = this.sessions.get(id);
        if (s)
            s.touch();
        return s;
    }
    delete(id) {
        this.sessions.delete(id);
    }
    evictStale() {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivityMs > this.ttlMs) {
                session.abortController.abort();
                this.sessions.delete(id);
            }
        }
    }
}
//# sourceMappingURL=SessionStore.js.map
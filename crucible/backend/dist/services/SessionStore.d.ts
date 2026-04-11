import { CrucibleSession } from "./CrucibleSession.js";
export declare class SessionStore {
    private readonly sessions;
    private readonly ttlMs;
    private cleanupTimer;
    constructor(ttlMinutes?: number);
    startCleanupInterval(): void;
    create(decisionText: string): CrucibleSession;
    get(id: string): CrucibleSession | undefined;
    delete(id: string): void;
    private evictStale;
}
//# sourceMappingURL=SessionStore.d.ts.map
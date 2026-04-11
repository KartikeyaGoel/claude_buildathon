import { v4 as uuidv4 } from "uuid";
import { pushEventBuffer, replaySince, writeSse, } from "../utils/sseHelpers.js";
export class CrucibleSession {
    id;
    decisionText;
    framingText = null;
    assumptionText = null;
    steelmanText = null;
    synthesisText = null;
    phase = "framing_running";
    lastCompletedStage = null;
    lastActivityMs;
    abortController;
    nextEventId = 0;
    eventBuffer = [];
    subscribers = new Set();
    /** Serialized pipeline work (framing + post-confirm) */
    pipelineChain = Promise.resolve();
    constructor(decisionText) {
        this.id = uuidv4();
        this.decisionText = decisionText;
        this.lastActivityMs = Date.now();
        this.abortController = new AbortController();
    }
    touch() {
        this.lastActivityMs = Date.now();
    }
    isCancelled() {
        return this.phase === "cancelled";
    }
    replaceAbortController() {
        this.abortController = new AbortController();
    }
    emit(event, data) {
        this.touch();
        this.nextEventId += 1;
        const id = this.nextEventId;
        const evt = { id, event, data: { ...data } };
        pushEventBuffer(this.eventBuffer, evt);
        for (const res of this.subscribers) {
            try {
                writeSse(res, evt);
            }
            catch {
                this.subscribers.delete(res);
            }
        }
    }
    attachSse(res, lastEventIdHeader) {
        this.touch();
        res.flushHeaders?.();
        for (const evt of replaySince(this.eventBuffer, lastEventIdHeader)) {
            writeSse(res, evt);
        }
        this.subscribers.add(res);
    }
    detachSse(res) {
        this.subscribers.delete(res);
    }
    getReplayBuffer() {
        return [...this.eventBuffer];
    }
}
//# sourceMappingURL=CrucibleSession.js.map
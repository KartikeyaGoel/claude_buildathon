import type { Response } from "express";
import type { PipelineStage, SseEventName } from "@crucible/shared";
import { type BufferedSseEvent } from "../utils/sseHelpers.js";
export type SessionPhase = "framing_running" | "awaiting_framing_confirm" | "pipeline_running" | "complete" | "error" | "cancelled";
export declare class CrucibleSession {
    readonly id: string;
    decisionText: string;
    framingText: string | null;
    assumptionText: string | null;
    steelmanText: string | null;
    synthesisText: string | null;
    phase: SessionPhase;
    lastCompletedStage: PipelineStage | null;
    lastActivityMs: number;
    abortController: AbortController;
    private nextEventId;
    private readonly eventBuffer;
    private readonly subscribers;
    /** Serialized pipeline work (framing + post-confirm) */
    pipelineChain: Promise<void>;
    constructor(decisionText: string);
    touch(): void;
    isCancelled(): boolean;
    replaceAbortController(): void;
    emit(event: SseEventName, data: Record<string, unknown>): void;
    attachSse(res: Response, lastEventIdHeader: string | undefined): void;
    detachSse(res: Response): void;
    getReplayBuffer(): BufferedSseEvent[];
}
//# sourceMappingURL=CrucibleSession.d.ts.map
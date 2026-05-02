import type { ServerResponse } from "node:http";
import { v4 as uuidv4 } from "uuid";
import type { PipelineStage, SseEventName } from "@crucible/shared";
import {
  pushEventBuffer,
  replaySince,
  writeSse,
  type BufferedSseEvent,
} from "../utils/sseHelpers.js";

export type SessionPhase =
  | "framing_running"
  | "awaiting_framing_confirm"
  | "pipeline_running"
  | "complete"
  | "error"
  | "cancelled";

export class CrucibleSession {
  readonly id: string;
  decisionText: string;
  framingText: string | null = null;
  assumptionText: string | null = null;
  steelmanText: string | null = null;
  synthesisText: string | null = null;
  phase: SessionPhase = "framing_running";
  lastCompletedStage: PipelineStage | null = null;
  lastActivityMs: number;
  abortController: AbortController;
  private nextEventId = 0;
  private readonly eventBuffer: BufferedSseEvent[] = [];
  private readonly subscribers = new Set<ServerResponse>();
  /** Serialized pipeline work (framing + post-confirm) */
  pipelineChain: Promise<void> = Promise.resolve();

  constructor(decisionText: string) {
    this.id = uuidv4();
    this.decisionText = decisionText;
    this.lastActivityMs = Date.now();
    this.abortController = new AbortController();
  }

  touch(): void {
    this.lastActivityMs = Date.now();
  }

  isCancelled(): boolean {
    return this.phase === "cancelled";
  }

  replaceAbortController(): void {
    this.abortController = new AbortController();
  }

  emit(event: SseEventName, data: Record<string, unknown>): void {
    this.touch();
    this.nextEventId += 1;
    const id = this.nextEventId;
    const evt: BufferedSseEvent = { id, event, data: { ...data } };
    pushEventBuffer(this.eventBuffer, evt);
    for (const res of this.subscribers) {
      try {
        writeSse(res, evt);
      } catch {
        this.subscribers.delete(res);
      }
    }
  }

  attachSse(res: ServerResponse, lastEventIdHeader: string | undefined): void {
    this.touch();
    res.flushHeaders?.();
    for (const evt of replaySince(this.eventBuffer, lastEventIdHeader)) {
      writeSse(res, evt);
    }
    this.subscribers.add(res);
  }

  detachSse(res: ServerResponse): void {
    this.subscribers.delete(res);
  }

  getReplayBuffer(): BufferedSseEvent[] {
    return [...this.eventBuffer];
  }
}

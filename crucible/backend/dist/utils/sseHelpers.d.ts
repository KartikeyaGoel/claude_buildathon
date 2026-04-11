import type { Response } from "express";
import type { SseEventName } from "@crucible/shared";
export interface BufferedSseEvent {
    id: number;
    event: SseEventName;
    data: Record<string, unknown>;
}
export declare function formatSseMessage(evt: BufferedSseEvent): string;
export declare function writeSse(res: Response, evt: BufferedSseEvent): void;
export declare function pushEventBuffer(buffer: BufferedSseEvent[], evt: BufferedSseEvent): void;
export declare function replaySince(buffer: BufferedSseEvent[], lastEventIdHeader: string | undefined): BufferedSseEvent[];
//# sourceMappingURL=sseHelpers.d.ts.map
import type { Response } from "express";
import type { SseEventName } from "@crucible/shared";

export interface BufferedSseEvent {
  id: number;
  event: SseEventName;
  data: Record<string, unknown>;
}

const SSE_BUFFER_SIZE = 100;

export function formatSseMessage(evt: BufferedSseEvent): string {
  const payload = { ...evt.data, id: evt.id };
  return `id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function writeSse(res: Response, evt: BufferedSseEvent): void {
  res.write(formatSseMessage(evt));
}

export function pushEventBuffer(
  buffer: BufferedSseEvent[],
  evt: BufferedSseEvent,
): void {
  buffer.push(evt);
  while (buffer.length > SSE_BUFFER_SIZE) buffer.shift();
}

export function replaySince(
  buffer: BufferedSseEvent[],
  lastEventIdHeader: string | undefined,
): BufferedSseEvent[] {
  if (lastEventIdHeader == null || lastEventIdHeader === "") return [];
  const lastId = Number(lastEventIdHeader);
  if (!Number.isFinite(lastId)) return [];
  return buffer.filter((e) => e.id > lastId);
}

import type { SseEnvelope, SseEventName } from "@crucible/shared";
import { useCallback, useEffect, useRef } from "react";
import { getApiBase, getSessionStreamPath } from "../api/crucibleApi";
import { useSessionStore } from "../stores/sessionStore";

function parseSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const idx = buffer.indexOf("\n\n");
  if (idx === -1) return { blocks: [], rest: buffer };
  const blocks: string[] = [];
  let cur = buffer;
  let sep: number;
  while ((sep = cur.indexOf("\n\n")) !== -1) {
    blocks.push(cur.slice(0, sep));
    cur = cur.slice(sep + 2);
  }
  return { blocks, rest: cur };
}

function parseBlock(block: string): { id?: string; event?: string; data: string } {
  const lines = block.split("\n");
  let id: string | undefined;
  let event: string | undefined;
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataParts.push(line.slice(5).trimStart());
  }
  return { id, event, data: dataParts.join("\n") };
}

function parseEnvelope(block: string): SseEnvelope | null {
  const { id, event, data } = parseBlock(block);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      "event" in parsed &&
      "data" in parsed
    ) {
      return parsed as SseEnvelope;
    }
    const idNum = id != null ? Number(id) : 0;
    const ev = (event ?? "message") as SseEventName;
    return { id: Number.isFinite(idNum) ? idNum : 0, event: ev, data: parsed };
  } catch {
    return null;
  }
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 16000, 30000];

export interface UseSSEStreamResult {
  disconnect: () => void;
}

/**
 * Maintains a fetch-based SSE connection with exponential backoff reconnect.
 * Sends `Last-Event-ID` on reconnect when a prior event id was received.
 */
export function useSSEStream(sessionId: string | null, enabled = true): UseSSEStreamResult {
  const applySseEnvelope = useSessionStore((s) => s.applySseEnvelope);
  const setSessionMeta = useSessionStore((s) => s.setSessionMeta);
  const lastEventIdRef = useRef<number>(-1);
  const reconnectAttemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setSessionMeta({ connectionStatus: "closed" });
  }, [setSessionMeta]);

  useEffect(() => {
    lastEventIdRef.current = useSessionStore.getState().lastEventId;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !enabled) {
      disconnect();
      return;
    }

    let cancelled = false;
    const bufferRef = { value: "" };
    runningRef.current = true;

    const runLoop = async () => {
      while (!cancelled && runningRef.current) {
        const attempt = reconnectAttemptRef.current;
        if (attempt > 0) {
          setSessionMeta({ connectionStatus: "reconnecting", connectionError: null });
          const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
          await new Promise((r) => setTimeout(r, delay));
          if (cancelled || !runningRef.current) break;
        } else {
          setSessionMeta({ connectionStatus: "connecting", connectionError: null });
        }

        const path = getSessionStreamPath(sessionId);
        const base = getApiBase();
        const url = base ? `${base}${path}` : path;

        const headers: Record<string, string> = {
          Accept: "text/event-stream",
        };
        const lastId = lastEventIdRef.current;
        if (lastId >= 0) {
          headers["Last-Event-ID"] = String(lastId);
        }

        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(url, {
            method: "GET",
            headers,
            signal: ac.signal,
            cache: "no-store",
          });

          if (!res.ok || !res.body) {
            throw new Error(`stream ${res.status}`);
          }

          reconnectAttemptRef.current = 0;
          setSessionMeta({ connectionStatus: "open", connectionError: null });

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          bufferRef.value = "";

          let streamEndedCleanly = false;
          while (!cancelled && runningRef.current) {
            const { done, value } = await reader.read();
            if (done) {
              streamEndedCleanly = true;
              break;
            }
            bufferRef.value += decoder.decode(value, { stream: true });
            const { blocks, rest } = parseSseBlocks(bufferRef.value);
            bufferRef.value = rest;
            for (const block of blocks) {
              const env = parseEnvelope(block);
              if (!env) continue;
              lastEventIdRef.current = env.id;
              applySseEnvelope(env);
            }
          }

          if (streamEndedCleanly && useSessionStore.getState().pipelineComplete) {
            setSessionMeta({ connectionStatus: "closed", connectionError: null });
            break;
          }
          if (streamEndedCleanly && !cancelled && runningRef.current) {
            reconnectAttemptRef.current += 1;
          }
        } catch (e) {
          if (cancelled || ac.signal.aborted) break;
          const msg = e instanceof Error ? e.message : "stream error";
          setSessionMeta({ connectionStatus: "error", connectionError: msg });
          reconnectAttemptRef.current += 1;
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
        }
      }
    };

    void runLoop();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [sessionId, enabled, applySseEnvelope, setSessionMeta, disconnect]);

  return { disconnect };
}

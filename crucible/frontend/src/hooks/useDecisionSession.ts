import { useCallback, useEffect, useRef } from "react";
import { cancelSession, confirmFraming } from "../api/crucibleApi";
import { useSessionStore } from "../stores/sessionStore";
import { useSSEStream } from "./useSSEStream";

/**
 * Binds a session id from the URL to the SSE stream and framing actions.
 */
export function useDecisionSession(sessionId: string | undefined) {
  const reset = useSessionStore((s) => s.reset);
  const setSessionMeta = useSessionStore((s) => s.setSessionMeta);
  const setFramingConfirmed = useSessionStore((s) => s.setFramingConfirmed);
  const pipelineComplete = useSessionStore((s) => s.pipelineComplete);
  const pipelineError = useSessionStore((s) => s.pipelineError);
  const prevIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    if (prevIdRef.current !== sessionId) {
      prevIdRef.current = sessionId;
      reset();
      setSessionMeta({ sessionId, connectionError: null });
    }
  }, [sessionId, reset, setSessionMeta]);

  const streamEnabled = Boolean(sessionId) && !pipelineComplete && !pipelineError;
  const { disconnect } = useSSEStream(sessionId ?? null, streamEnabled);

  const confirm = useCallback(
    async (feedback?: string) => {
      if (!sessionId) return;
      const trimmed = feedback?.trim();
      await confirmFraming(sessionId, { feedback: trimmed || undefined });
      if (!trimmed) setFramingConfirmed(true);
    },
    [sessionId, setFramingConfirmed],
  );

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      await cancelSession(sessionId);
    } finally {
      disconnect();
      setSessionMeta({ connectionStatus: "closed" });
    }
  }, [sessionId, disconnect, setSessionMeta]);

  return { confirm, cancel, disconnect };
}

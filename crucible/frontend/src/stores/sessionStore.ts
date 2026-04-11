import type {
  FinalPipelineResult,
  LoopCompleteResult,
  PipelineStage,
  SseEnvelope,
  SseEventName,
  StageGrade,
} from "@crucible/shared";
import { create } from "zustand";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

export interface LoopIterationView {
  iteration: number;
  result?: LoopCompleteResult;
  grade?: StageGrade;
  maxIterationsReached?: boolean;
}

export interface LoopStageState {
  active: boolean;
  complete: boolean;
  waitingForPeer: boolean;
  currentIteration: number;
  maxIterations: number;
  streamingText: string;
  finalText: string;
  iterations: LoopIterationView[];
}

function emptyLoopState(): LoopStageState {
  return {
    active: false,
    complete: false,
    waitingForPeer: false,
    currentIteration: 0,
    maxIterations: 4,
    streamingText: "",
    finalText: "",
    iterations: [],
  };
}

export interface SessionState {
  sessionId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  lastEventId: number;

  framingStreaming: string;
  framingFinal: string;
  framingAwaitingConfirm: boolean;
  framingConfirmed: boolean;

  assumption: LoopStageState;
  steelman: LoopStageState;
  synthesis: LoopStageState;

  pipelineComplete: boolean;
  finalResult: FinalPipelineResult | null;

  stageErrors: { stage: PipelineStage; error: string; retryable: boolean }[];
  pipelineError: { error: string; lastCompletedStage: PipelineStage | null } | null;

  stageProgress: 1 | 2 | 3 | 4;

  reset: () => void;
  setSessionMeta: (partial: Partial<Pick<SessionState, "sessionId" | "connectionStatus" | "connectionError">>) => void;
  setLastEventId: (id: number) => void;
  setFramingConfirmed: (confirmed: boolean) => void;
  applySseEnvelope: (envelope: SseEnvelope) => void;
}

function cloneLoopStage(ls: LoopStageState): LoopStageState {
  return {
    ...ls,
    iterations: ls.iterations.map((i) => ({ ...i })),
  };
}

function recomputeWaitingFlags(assumption: LoopStageState, steelman: LoopStageState): {
  assumption: LoopStageState;
  steelman: LoopStageState;
} {
  const a = { ...assumption };
  const st = { ...steelman };
  if (a.complete && !st.complete) {
    a.waitingForPeer = true;
    st.waitingForPeer = false;
  } else if (st.complete && !a.complete) {
    st.waitingForPeer = true;
    a.waitingForPeer = false;
  } else {
    a.waitingForPeer = false;
    st.waitingForPeer = false;
  }
  return { assumption: a, steelman: st };
}

function recomputeProgress(s: {
  pipelineComplete: boolean;
  synthesis: LoopStageState;
  framingConfirmed: boolean;
  assumption: LoopStageState;
  steelman: LoopStageState;
}): 1 | 2 | 3 | 4 {
  if (s.pipelineComplete) return 4;
  if (
    s.synthesis.active ||
    s.synthesis.complete ||
    s.synthesis.streamingText.length > 0 ||
    s.synthesis.iterations.length > 0
  ) {
    return 3;
  }
  if (
    s.framingConfirmed ||
    s.assumption.active ||
    s.steelman.active ||
    s.assumption.complete ||
    s.steelman.complete ||
    s.assumption.iterations.length > 0 ||
    s.steelman.iterations.length > 0
  ) {
    return 2;
  }
  return 1;
}

function textFromStageResult(result: unknown, fallback: string): string {
  if (typeof result === "string") return result;
  if (
    result &&
    typeof result === "object" &&
    "text" in result &&
    typeof (result as { text: unknown }).text === "string"
  ) {
    return (result as { text: string }).text;
  }
  return fallback;
}

function ensureIterationRow(stage: LoopStageState, iteration: number): LoopIterationView {
  let row = stage.iterations.find((i) => i.iteration === iteration);
  if (!row) {
    row = { iteration };
    stage.iterations = [...stage.iterations, row].sort((x, y) => x.iteration - y.iteration);
  }
  return row;
}

const initialState = (): Omit<
  SessionState,
  "reset" | "setSessionMeta" | "setLastEventId" | "setFramingConfirmed" | "applySseEnvelope"
> => ({
  sessionId: null,
  connectionStatus: "idle",
  connectionError: null,
  lastEventId: -1,

  framingStreaming: "",
  framingFinal: "",
  framingAwaitingConfirm: false,
  framingConfirmed: false,

  assumption: emptyLoopState(),
  steelman: emptyLoopState(),
  synthesis: emptyLoopState(),

  pipelineComplete: false,
  finalResult: null,

  stageErrors: [],
  pipelineError: null,

  stageProgress: 1,
});

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState(),

  reset: () => set(initialState()),

  setSessionMeta: (partial) => set(partial),

  setLastEventId: (id) => set({ lastEventId: id }),

  setFramingConfirmed: (confirmed) =>
    set((s) => ({
      framingConfirmed: confirmed,
      framingAwaitingConfirm: confirmed ? false : s.framingAwaitingConfirm,
      stageProgress: recomputeProgress({ ...s, framingConfirmed: confirmed }),
    })),

  applySseEnvelope: (envelope) => {
    const { event, data, id } = envelope;

    set((state) => {
      let framingStreaming = state.framingStreaming;
      let framingFinal = state.framingFinal;
      let framingAwaitingConfirm = state.framingAwaitingConfirm;
      let assumption = cloneLoopStage(state.assumption);
      let steelman = cloneLoopStage(state.steelman);
      let synthesis = cloneLoopStage(state.synthesis);
      let pipelineComplete = state.pipelineComplete;
      let finalResult = state.finalResult;
      const stageErrors = [...state.stageErrors];
      let pipelineError = state.pipelineError;

      const loopFor = (stage: PipelineStage): LoopStageState | null => {
        if (stage === "assumption") return assumption;
        if (stage === "steelman") return steelman;
        if (stage === "synthesis") return synthesis;
        return null;
      };

      const handle = (name: SseEventName) => {
        switch (name) {
          case "stage_start": {
            const d = data as { stage: PipelineStage };
            if (d.stage === "framing") {
              framingStreaming = "";
              framingFinal = "";
              framingAwaitingConfirm = false;
            } else {
              const ls = loopFor(d.stage);
              if (ls) {
                ls.active = true;
                ls.complete = false;
                ls.streamingText = "";
              }
            }
            break;
          }
          case "loop_start": {
            const d = data as { stage: PipelineStage; iteration: number; maxIterations: number };
            const ls = loopFor(d.stage);
            if (ls) {
              ls.currentIteration = d.iteration;
              ls.maxIterations = d.maxIterations;
              ls.streamingText = "";
              ensureIterationRow(ls, d.iteration);
            }
            break;
          }
          case "agent_chunk": {
            const d = data as { stage: PipelineStage; text: string };
            if (d.stage === "framing") {
              framingStreaming += d.text;
            } else {
              const ls = loopFor(d.stage);
              if (ls) ls.streamingText += d.text;
            }
            break;
          }
          case "loop_complete": {
            const d = data as { stage: PipelineStage; iteration: number; result: LoopCompleteResult };
            const ls = loopFor(d.stage);
            if (ls) {
              const row = ensureIterationRow(ls, d.iteration);
              row.result = { ...d.result };
            }
            break;
          }
          case "grade_result": {
            const d = data as { stage: PipelineStage; iteration: number; grade: StageGrade };
            const ls = loopFor(d.stage);
            if (ls) {
              const row = ensureIterationRow(ls, d.iteration);
              row.grade = d.grade;
            }
            break;
          }
          case "stage_complete": {
            const d = data as { stage: PipelineStage; result: unknown };
            if (d.stage === "framing") {
              const text = typeof d.result === "string" ? d.result : framingStreaming;
              framingFinal = text;
              framingStreaming = "";
              framingAwaitingConfirm = true;
            } else {
              const ls = loopFor(d.stage);
              if (ls) {
                ls.complete = true;
                ls.active = false;
                const text = textFromStageResult(
                  d.result,
                  ls.streamingText || ls.iterations.at(-1)?.result?.text || "",
                );
                ls.finalText = text;
                ls.streamingText = "";
              }
            }
            break;
          }
          case "pipeline_complete": {
            const d = data as { finalResult: FinalPipelineResult };
            pipelineComplete = true;
            finalResult = d.finalResult;
            synthesis.complete = true;
            synthesis.active = false;
            assumption = { ...assumption, waitingForPeer: false };
            steelman = { ...steelman, waitingForPeer: false };
            break;
          }
          case "stage_error": {
            const d = data as { stage: PipelineStage; error: string; retryable: boolean };
            stageErrors.push({ stage: d.stage, error: d.error, retryable: d.retryable });
            break;
          }
          case "pipeline_error": {
            const d = data as { error: string; lastCompletedStage?: PipelineStage | null };
            pipelineError = {
              error: d.error,
              lastCompletedStage: d.lastCompletedStage ?? null,
            };
            break;
          }
          case "max_iterations_reached": {
            const d = data as { stage: PipelineStage; bestScore: number };
            const ls = loopFor(d.stage);
            if (ls) {
              const row = ls.iterations.find((i) => i.iteration === ls.currentIteration);
              if (row) row.maxIterationsReached = true;
              void d.bestScore;
            }
            break;
          }
          default:
            break;
        }
      };

      handle(event);

      const merged = recomputeWaitingFlags(assumption, steelman);
      assumption = merged.assumption;
      steelman = merged.steelman;

      const stageProgress = recomputeProgress({
        pipelineComplete,
        synthesis,
        framingConfirmed: state.framingConfirmed,
        assumption,
        steelman,
      });

      return {
        ...state,
        lastEventId: id,
        framingStreaming,
        framingFinal,
        framingAwaitingConfirm,
        assumption,
        steelman,
        synthesis,
        pipelineComplete,
        finalResult,
        stageErrors,
        pipelineError,
        stageProgress,
      };
    });
  },
}));

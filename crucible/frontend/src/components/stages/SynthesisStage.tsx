import { GitMerge } from "lucide-react";
import { LoopIterationCard } from "../loops/LoopIterationCard";
import { LoopProgressIndicator } from "../loops/LoopProgressIndicator";
import { StreamingText } from "../streaming/StreamingText";
import { ThinkingIndicator } from "../streaming/ThinkingIndicator";
import type { LoopStageState } from "../../stores/sessionStore";
import { StageCard } from "./StageCard";

interface SynthesisStageProps {
  state: LoopStageState;
}

export function SynthesisStage({ state }: SynthesisStageProps) {
  const showThinking = state.active && !state.streamingText && !state.finalText;

  return (
    <StageCard
      title="Synthesis"
      subtitle="Honest recommendation with traceability"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-200">
          <GitMerge className="h-3.5 w-3.5" aria-hidden />
          Stage 4
        </span>
      }
    >
      {(state.active || state.iterations.length > 0) ? (
        <div className="mb-4">
          <LoopProgressIndicator iteration={state.currentIteration || 1} maxIterations={state.maxIterations} />
        </div>
      ) : null}

      {showThinking ? <ThinkingIndicator label="Synthesizing" /> : null}
      {state.streamingText ? <StreamingText text={state.streamingText} active={state.active} /> : null}
      {state.complete && state.finalText ? <StreamingText text={state.finalText} className="mt-2" /> : null}

      {state.iterations.length > 0 ? (
        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Iterations</h3>
          {state.iterations.map((row) => (
            <LoopIterationCard key={row.iteration} row={row} stageLabel="Synthesis" />
          ))}
        </div>
      ) : null}
    </StageCard>
  );
}

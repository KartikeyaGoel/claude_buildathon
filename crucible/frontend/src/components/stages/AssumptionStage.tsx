import { Pickaxe } from "lucide-react";
import { LoopIterationCard } from "../loops/LoopIterationCard";
import { LoopProgressIndicator } from "../loops/LoopProgressIndicator";
import { StreamingText } from "../streaming/StreamingText";
import { ThinkingIndicator } from "../streaming/ThinkingIndicator";
import type { LoopStageState } from "../../stores/sessionStore";
import { StageCard } from "./StageCard";

interface AssumptionStageProps {
  state: LoopStageState;
  peerComplete: boolean;
}

export function AssumptionStage({ state, peerComplete }: AssumptionStageProps) {
  const showThinking = state.active && !state.streamingText && !state.finalText;
  const waiting = state.complete && !peerComplete;

  return (
    <StageCard
      title="Assumption excavation"
      subtitle="Adversarial layers down to bedrock"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-950/60 px-2.5 py-1 text-xs font-medium text-violet-200">
          <Pickaxe className="h-3.5 w-3.5" aria-hidden />
          Stage 2
        </span>
      }
    >
      {waiting ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-100/90">
          Waiting for steelman stage to finish…
        </div>
      ) : null}

      {(state.active || state.iterations.length > 0) && !waiting ? (
        <div className="mb-4">
          <LoopProgressIndicator iteration={state.currentIteration || 1} maxIterations={state.maxIterations} />
        </div>
      ) : null}

      {showThinking ? <ThinkingIndicator label="Excavating assumptions" /> : null}
      {state.streamingText ? <StreamingText text={state.streamingText} active={state.active} /> : null}
      {state.complete && state.finalText ? <StreamingText text={state.finalText} className="mt-2" /> : null}

      {state.iterations.length > 0 ? (
        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Iterations</h3>
          {state.iterations.map((row) => (
            <LoopIterationCard key={row.iteration} row={row} stageLabel="Assumption" />
          ))}
        </div>
      ) : null}
    </StageCard>
  );
}

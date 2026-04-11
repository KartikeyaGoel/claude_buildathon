import type { LoopIterationView } from "../../stores/sessionStore";
import { GradeDisplay } from "./GradeDisplay";

interface LoopIterationCardProps {
  row: LoopIterationView;
  stageLabel: string;
}

export function LoopIterationCard({ row, stageLabel }: LoopIterationCardProps) {
  return (
    <div className="rounded-lg border border-stone-700/60 bg-stone-900/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
        <span className="font-medium text-stone-300">
          {stageLabel} · iteration {row.iteration}
        </span>
        {row.maxIterationsReached ? (
          <span className="rounded bg-amber-950/80 px-2 py-0.5 text-amber-200">Max iterations</span>
        ) : null}
        {row.result?.passedGrading === false && !row.maxIterationsReached ? (
          <span className="rounded bg-stone-800 px-2 py-0.5 text-stone-300">Refining</span>
        ) : null}
      </div>
      {row.grade ? <GradeDisplay grade={row.grade} /> : null}
      {row.result?.text ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs text-amber-600/90 hover:text-amber-500">
            View output snapshot
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-stone-800 bg-stone-950/80 p-2 font-mono text-[11px] text-stone-400 whitespace-pre-wrap">
            {row.result.text}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

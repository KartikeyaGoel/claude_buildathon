interface LoopProgressIndicatorProps {
  iteration: number;
  maxIterations: number;
}

export function LoopProgressIndicator({ iteration, maxIterations }: LoopProgressIndicatorProps) {
  const safeMax = Math.max(1, maxIterations);
  const pct = Math.min(100, (iteration / safeMax) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] uppercase tracking-wide text-stone-500">
        <span>Loop</span>
        <span className="font-mono text-stone-400">
          {iteration} / {maxIterations}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

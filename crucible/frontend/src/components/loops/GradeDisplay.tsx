import type { StageGrade } from "@crucible/shared";

function scoreRows(grade: StageGrade): { label: string; value: number }[] {
  if (grade.stage === "assumption") {
    return [
      { label: "Depth", value: grade.scores.depth },
      { label: "Coverage", value: grade.scores.coverage },
      { label: "Independence", value: grade.scores.independence },
    ];
  }
  if (grade.stage === "steelman") {
    return [
      { label: "Strength", value: grade.scores.strength },
      { label: "Specificity", value: grade.scores.specificity },
      { label: "Novelty", value: grade.scores.novelty },
    ];
  }
  return [
    { label: "Traceability", value: grade.scores.traceability },
    { label: "Intellectual honesty", value: grade.scores.intellectualHonesty },
    { label: "Completeness", value: grade.scores.completeness },
  ];
}

export function GradeDisplay({ grade }: { grade: StageGrade }) {
  const rows = scoreRows(grade);
  return (
    <div className="rounded-lg border border-stone-700/80 bg-stone-900/50 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-stone-300">Grader</span>
        <span
          className={
            grade.passed
              ? "rounded-full bg-emerald-950 px-2 py-0.5 text-emerald-400"
              : "rounded-full bg-rose-950 px-2 py-0.5 text-rose-300"
          }
        >
          {grade.passed ? "Passed" : "Revise"}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-stone-400">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[10px] uppercase tracking-wide text-stone-500">{r.label}</dt>
            <dd className="font-mono text-stone-200">{r.value}/5</dd>
          </div>
        ))}
      </dl>
      {grade.failureReasons.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-rose-200/90">
          {grade.failureReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {grade.feedback ? (
        <p className="mt-2 border-t border-stone-700/60 pt-2 text-stone-400">{grade.feedback}</p>
      ) : null}
    </div>
  );
}

import type { StageGrade } from "@crucible/shared";
export declare function gradeAssumptionOutput(params: {
    decisionText: string;
    framingText: string;
    agentOutput: string;
    signal: AbortSignal;
}): Promise<Extract<StageGrade, {
    stage: "assumption";
}>>;
export declare function sumAssumptionScores(grade: Extract<StageGrade, {
    stage: "assumption";
}>): number;
//# sourceMappingURL=AssumptionGrader.d.ts.map
import type { StageGrade } from "@crucible/shared";
export declare function gradeSynthesisOutput(params: {
    decisionText: string;
    framingText: string;
    assumptionText: string;
    steelmanText: string;
    agentOutput: string;
    signal: AbortSignal;
}): Promise<Extract<StageGrade, {
    stage: "synthesis";
}>>;
export declare function sumSynthesisScores(grade: Extract<StageGrade, {
    stage: "synthesis";
}>): number;
//# sourceMappingURL=SynthesisGrader.d.ts.map
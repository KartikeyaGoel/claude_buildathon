import type { StageGrade } from "@crucible/shared";
export declare function gradeSteelmanOutput(params: {
    decisionText: string;
    framingText: string;
    agentOutput: string;
    signal: AbortSignal;
}): Promise<Extract<StageGrade, {
    stage: "steelman";
}>>;
export declare function sumSteelmanScores(grade: Extract<StageGrade, {
    stage: "steelman";
}>): number;
//# sourceMappingURL=SteelmanGrader.d.ts.map
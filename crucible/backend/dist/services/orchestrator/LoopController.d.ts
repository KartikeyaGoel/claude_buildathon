import type { LoopCompleteResult, SseEventName, StageGrade } from "@crucible/shared";
export type SessionEmit = (event: SseEventName, data: Record<string, unknown>) => void;
export declare class LoopController {
    private readonly maxIterations;
    constructor(maxIterations: number);
    runLoop<G extends StageGrade>(options: {
        stage: G["stage"];
        signal: AbortSignal;
        emit: SessionEmit;
        runAgent: (args: {
            iteration: number;
            previousOutput: string | null;
            graderFeedback: string | null;
            onChunk: (text: string) => void;
        }) => Promise<string>;
        grade: (output: string) => Promise<G>;
        sumScores: (grade: G) => number;
    }): Promise<LoopCompleteResult>;
}
//# sourceMappingURL=LoopController.d.ts.map
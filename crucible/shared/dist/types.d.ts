/** Shared types for Crucible SSE, grading, and session state */
export type PipelineStage = "framing" | "assumption" | "steelman" | "synthesis";
export type SseEventName = "stage_start" | "loop_start" | "agent_chunk" | "loop_complete" | "grade_result" | "stage_complete" | "pipeline_complete" | "stage_error" | "pipeline_error" | "max_iterations_reached";
export interface AssumptionScores {
    depth: number;
    coverage: number;
    independence: number;
}
export interface SteelmanScores {
    strength: number;
    specificity: number;
    novelty: number;
}
export interface SynthesisScores {
    traceability: number;
    intellectualHonesty: number;
    completeness: number;
}
export type StageGrade = {
    stage: "assumption";
    scores: AssumptionScores;
    passed: boolean;
    failureReasons: string[];
    feedback: string;
} | {
    stage: "steelman";
    scores: SteelmanScores;
    passed: boolean;
    failureReasons: string[];
    feedback: string;
} | {
    stage: "synthesis";
    scores: SynthesisScores;
    passed: boolean;
    failureReasons: string[];
    feedback: string;
};
export interface LoopCompleteResult {
    text: string;
    passedGrading: boolean;
    iterationsUsed: number;
    maxIterationsReached?: boolean;
}
export interface FinalPipelineResult {
    framing: string;
    assumption: string;
    steelman: string;
    synthesis: string;
}
/** Base shape for all outbound SSE payloads */
export interface SseEnvelope<T = unknown> {
    id: number;
    event: SseEventName;
    data: T;
}
export type SsePayload = {
    stage: PipelineStage;
} | {
    stage: PipelineStage;
    iteration: number;
    maxIterations: number;
} | {
    stage: PipelineStage;
    text: string;
} | {
    stage: PipelineStage;
    iteration: number;
    result: LoopCompleteResult;
} | {
    stage: PipelineStage;
    iteration: number;
    grade: StageGrade;
} | {
    stage: PipelineStage;
    result: unknown;
} | {
    finalResult: FinalPipelineResult;
} | {
    stage: PipelineStage;
    error: string;
    retryable: boolean;
} | {
    error: string;
    lastCompletedStage?: PipelineStage | null;
} | {
    stage: PipelineStage;
    bestScore: number;
};
export interface CreateSessionBody {
    decisionText: string;
}
export interface ConfirmFramingBody {
    feedback?: string;
}
//# sourceMappingURL=types.d.ts.map
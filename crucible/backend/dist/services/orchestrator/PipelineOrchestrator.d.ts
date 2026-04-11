import type { ConfirmFramingBody } from "@crucible/shared";
import type { CrucibleSession } from "../CrucibleSession.js";
export declare class PipelineOrchestrator {
    private readonly maxLoopIterations;
    constructor(maxLoopIterations: number);
    runInitialFraming(session: CrucibleSession): Promise<void>;
    handleConfirmFraming(session: CrucibleSession, body: ConfirmFramingBody): Promise<void>;
    private runFramingRevision;
    private runPostFramingPipeline;
}
//# sourceMappingURL=PipelineOrchestrator.d.ts.map
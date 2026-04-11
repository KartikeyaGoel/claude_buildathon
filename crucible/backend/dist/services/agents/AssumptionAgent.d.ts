export declare function runAssumptionIteration(params: {
    decisionText: string;
    framingText: string;
    iteration: number;
    previousOutput: string | null;
    graderFeedback: string | null;
    signal: AbortSignal;
    onChunk: (text: string) => void;
}): Promise<string>;
//# sourceMappingURL=AssumptionAgent.d.ts.map
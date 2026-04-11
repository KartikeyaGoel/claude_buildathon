export declare function runSynthesisIteration(params: {
    decisionText: string;
    framingText: string;
    assumptionText: string;
    steelmanText: string;
    iteration: number;
    previousOutput: string | null;
    graderFeedback: string | null;
    signal: AbortSignal;
    onChunk: (text: string) => void;
}): Promise<string>;
//# sourceMappingURL=SynthesisAgent.d.ts.map
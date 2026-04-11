export declare function runSteelmanIteration(params: {
    decisionText: string;
    framingText: string;
    iteration: number;
    previousOutput: string | null;
    graderFeedback: string | null;
    signal: AbortSignal;
    onChunk: (text: string) => void;
}): Promise<string>;
//# sourceMappingURL=SteelmanAgent.d.ts.map
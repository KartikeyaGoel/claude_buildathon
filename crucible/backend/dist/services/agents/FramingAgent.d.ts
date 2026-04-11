export declare function runFramingInitial(params: {
    decisionText: string;
    signal: AbortSignal;
    onChunk: (text: string) => void;
}): Promise<string>;
export declare function runFramingRevision(params: {
    decisionText: string;
    priorFraming: string;
    userFeedback: string;
    signal: AbortSignal;
    onChunk: (text: string) => void;
}): Promise<string>;
//# sourceMappingURL=FramingAgent.d.ts.map
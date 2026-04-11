import type { PipelineStage } from "@crucible/shared";
import type { Message, MessageParam } from "@anthropic-ai/sdk/resources/messages";
export interface StreamAgentParams {
    system: string;
    messages: MessageParam[];
    signal: AbortSignal;
    stage: PipelineStage;
    onChunk: (chunk: string, stage: PipelineStage) => void;
}
export declare function streamAgentCompletion(params: StreamAgentParams): Promise<string>;
export declare function messageTextContent(msg: Message): string;
//# sourceMappingURL=BaseAgent.d.ts.map
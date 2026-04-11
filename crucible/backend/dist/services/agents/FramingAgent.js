import { FRAMING_SYSTEM_PROMPT } from "../../prompts/framing.prompt.js";
import { streamAgentCompletion } from "./BaseAgent.js";
export async function runFramingInitial(params) {
    const { decisionText, signal, onChunk } = params;
    const messages = [{ role: "user", content: decisionText }];
    return streamAgentCompletion({
        system: FRAMING_SYSTEM_PROMPT,
        messages,
        signal,
        stage: "framing",
        onChunk: (t) => onChunk(t),
    });
}
export async function runFramingRevision(params) {
    const { decisionText, priorFraming, userFeedback, signal, onChunk } = params;
    const messages = [
        { role: "user", content: decisionText },
        { role: "assistant", content: priorFraming },
        {
            role: "user",
            content: `The user reviewed your framing and provided this feedback:\n\n${userFeedback}\n\nProduce a revised framing following the same structure and requirements as before.`,
        },
    ];
    return streamAgentCompletion({
        system: FRAMING_SYSTEM_PROMPT,
        messages,
        signal,
        stage: "framing",
        onChunk: (t) => onChunk(t),
    });
}
//# sourceMappingURL=FramingAgent.js.map
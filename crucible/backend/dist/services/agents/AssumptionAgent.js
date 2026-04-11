import { ASSUMPTION_SYSTEM_PROMPT } from "../../prompts/assumption.prompt.js";
import { streamAgentCompletion } from "./BaseAgent.js";
function buildUserContent(params) {
    const { decisionText, framingText, iteration, previousOutput, graderFeedback } = params;
    let body = `## Decision (user)\n${decisionText}\n\n## Framing (confirmed)\n${framingText}\n\n## Your task\nPerform layered assumption excavation as specified in your system instructions.`;
    if (iteration > 1 && previousOutput != null) {
        body += `\n\n## Previous iteration output\n${previousOutput}\n\n## GRADER FEEDBACK\n${graderFeedback ?? ""}\n\nRevise and strengthen your excavation; address the feedback above. Only the latest feedback applies.`;
    }
    return body;
}
export async function runAssumptionIteration(params) {
    const messages = [
        {
            role: "user",
            content: buildUserContent({
                decisionText: params.decisionText,
                framingText: params.framingText,
                iteration: params.iteration,
                previousOutput: params.previousOutput,
                graderFeedback: params.graderFeedback,
            }),
        },
    ];
    return streamAgentCompletion({
        system: ASSUMPTION_SYSTEM_PROMPT,
        messages,
        signal: params.signal,
        stage: "assumption",
        onChunk: (t) => params.onChunk(t),
    });
}
//# sourceMappingURL=AssumptionAgent.js.map
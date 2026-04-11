import { SYNTHESIS_SYSTEM_PROMPT } from "../../prompts/synthesis.prompt.js";
import { streamAgentCompletion } from "./BaseAgent.js";
function buildUserContent(params) {
    const { decisionText, framingText, assumptionText, steelmanText, iteration, previousOutput, graderFeedback, } = params;
    let body = `## Decision (user)\n${decisionText}\n\n## Framing\n${framingText}\n\n## Assumption excavation\n${assumptionText}\n\n## Steelman\n${steelmanText}\n\n## Your task\nProduce the synthesis output in the required format.`;
    if (iteration > 1 && previousOutput != null) {
        body += `\n\n## Previous iteration output\n${previousOutput}\n\n## GRADER FEEDBACK\n${graderFeedback ?? ""}\n\nRevise your synthesis; address the feedback above. Only the latest feedback applies.`;
    }
    return body;
}
export async function runSynthesisIteration(params) {
    const messages = [
        {
            role: "user",
            content: buildUserContent({
                decisionText: params.decisionText,
                framingText: params.framingText,
                assumptionText: params.assumptionText,
                steelmanText: params.steelmanText,
                iteration: params.iteration,
                previousOutput: params.previousOutput,
                graderFeedback: params.graderFeedback,
            }),
        },
    ];
    return streamAgentCompletion({
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages,
        signal: params.signal,
        stage: "synthesis",
        onChunk: (t) => params.onChunk(t),
    });
}
//# sourceMappingURL=SynthesisAgent.js.map
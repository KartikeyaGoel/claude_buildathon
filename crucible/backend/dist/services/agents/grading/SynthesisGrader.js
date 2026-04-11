import { env } from "../../../config/env.js";
import { anthropic, withRetries } from "../../../config/anthropic.js";
import { SYNTHESIS_GRADER_SYSTEM_PROMPT } from "../../../prompts/grading/synthesisGrader.prompt.js";
import { extractJsonObject } from "../jsonExtract.js";
import { messageTextContent } from "../BaseAgent.js";
function enforcedPass(scores) {
    return (scores.traceability >= 4 &&
        scores.intellectualHonesty >= 4 &&
        scores.completeness >= 4);
}
export async function gradeSynthesisOutput(params) {
    const { decisionText, framingText, assumptionText, steelmanText, agentOutput, signal } = params;
    const userContent = `## Decision (user)\n${decisionText}\n\n## Framing\n${framingText}\n\n## Assumption excavation\n${assumptionText}\n\n## Steelman\n${steelmanText}\n\n## Synthesis output to grade\n${agentOutput}`;
    const msg = await withRetries(async () => await anthropic.messages.create({
        model: env.MODEL_ID,
        max_tokens: 2048,
        system: SYNTHESIS_GRADER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
    }, { signal }), { signal, label: "grade synthesis" });
    const raw = messageTextContent(msg);
    const parsed = extractJsonObject(raw);
    const scores = {
        traceability: Number(parsed.scores?.traceability ?? 0),
        intellectualHonesty: Number(parsed.scores?.intellectualHonesty ?? 0),
        completeness: Number(parsed.scores?.completeness ?? 0),
    };
    return {
        stage: "synthesis",
        scores,
        passed: enforcedPass(scores),
        failureReasons: Array.isArray(parsed.failureReasons)
            ? parsed.failureReasons.map(String)
            : [],
        feedback: String(parsed.feedback ?? ""),
    };
}
export function sumSynthesisScores(grade) {
    return (grade.scores.traceability +
        grade.scores.intellectualHonesty +
        grade.scores.completeness);
}
//# sourceMappingURL=SynthesisGrader.js.map
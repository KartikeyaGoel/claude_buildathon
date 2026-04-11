import { env } from "../../config/env.js";
import { anthropic, withRetries } from "../../config/anthropic.js";
import { anySignal, timeoutSignal } from "../../utils/abort.js";
export async function streamAgentCompletion(params) {
    const { system, messages, signal, stage, onChunk } = params;
    const combined = anySignal([signal, timeoutSignal(120_000)]);
    const stream = await withRetries(async () => await anthropic.messages.create({
        model: env.MODEL_ID,
        max_tokens: 8192,
        system,
        messages,
        stream: true,
    }, { signal: combined }), { signal, label: `stream ${stage}` });
    let full = "";
    for await (const event of stream) {
        if (combined.aborted)
            break;
        if (event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            "text" in event.delta) {
            const piece = event.delta.text;
            full += piece;
            onChunk(piece, stage);
        }
    }
    if (combined.aborted && !signal.aborted) {
        throw new Error("Anthropic call timed out after 120s");
    }
    return full;
}
export function messageTextContent(msg) {
    return msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
}
//# sourceMappingURL=BaseAgent.js.map
import { runFramingInitial, runFramingRevision } from "../agents/FramingAgent.js";
import { runAssumptionIteration } from "../agents/AssumptionAgent.js";
import { runSteelmanIteration } from "../agents/SteelmanAgent.js";
import { runSynthesisIteration } from "../agents/SynthesisAgent.js";
import { gradeAssumptionOutput, sumAssumptionScores, } from "../agents/grading/AssumptionGrader.js";
import { gradeSteelmanOutput, sumSteelmanScores, } from "../agents/grading/SteelmanGrader.js";
import { gradeSynthesisOutput, sumSynthesisScores, } from "../agents/grading/SynthesisGrader.js";
import { LoopController } from "./LoopController.js";
function isAbortError(e) {
    return (e instanceof Error &&
        (e.name === "AbortError" || e.message === "Aborted" || e.message === "The operation was aborted"));
}
function errorMessage(e) {
    if (e instanceof Error)
        return e.message;
    return String(e);
}
export class PipelineOrchestrator {
    maxLoopIterations;
    constructor(maxLoopIterations) {
        this.maxLoopIterations = maxLoopIterations;
    }
    async runInitialFraming(session) {
        if (session.phase === "cancelled")
            return;
        session.phase = "framing_running";
        session.emit("stage_start", { stage: "framing" });
        try {
            const text = await runFramingInitial({
                decisionText: session.decisionText,
                signal: session.abortController.signal,
                onChunk: (t) => session.emit("agent_chunk", { stage: "framing", text: t }),
            });
            if (session.isCancelled())
                return;
            session.framingText = text;
            session.lastCompletedStage = "framing";
            session.phase = "awaiting_framing_confirm";
            session.emit("stage_complete", { stage: "framing", result: text });
        }
        catch (e) {
            if (isAbortError(e)) {
                return;
            }
            const msg = errorMessage(e);
            session.emit("stage_error", { stage: "framing", error: msg, retryable: true });
            session.emit("pipeline_error", {
                error: msg,
                lastCompletedStage: session.lastCompletedStage,
            });
            session.phase = "error";
        }
    }
    async handleConfirmFraming(session, body) {
        if (session.phase === "cancelled")
            return;
        const feedback = body.feedback?.trim() ?? "";
        if (feedback.length > 0) {
            if (session.phase !== "awaiting_framing_confirm") {
                session.emit("pipeline_error", {
                    error: "Framing revision is only allowed while awaiting framing confirmation.",
                    lastCompletedStage: session.lastCompletedStage,
                });
                return;
            }
            await this.runFramingRevision(session, feedback);
            return;
        }
        if (session.phase !== "awaiting_framing_confirm") {
            session.emit("pipeline_error", {
                error: "Framing is not awaiting confirmation.",
                lastCompletedStage: session.lastCompletedStage,
            });
            return;
        }
        if (!session.framingText) {
            session.emit("pipeline_error", {
                error: "Framing output missing.",
                lastCompletedStage: session.lastCompletedStage,
            });
            session.phase = "error";
            return;
        }
        await this.runPostFramingPipeline(session);
    }
    async runFramingRevision(session, feedback) {
        session.phase = "framing_running";
        session.emit("stage_start", { stage: "framing" });
        try {
            const prior = session.framingText ?? "";
            const text = await runFramingRevision({
                decisionText: session.decisionText,
                priorFraming: prior,
                userFeedback: feedback,
                signal: session.abortController.signal,
                onChunk: (t) => session.emit("agent_chunk", { stage: "framing", text: t }),
            });
            if (session.isCancelled())
                return;
            session.framingText = text;
            session.lastCompletedStage = "framing";
            session.phase = "awaiting_framing_confirm";
            session.emit("stage_complete", { stage: "framing", result: text });
        }
        catch (e) {
            if (isAbortError(e)) {
                return;
            }
            const msg = errorMessage(e);
            session.emit("stage_error", { stage: "framing", error: msg, retryable: true });
            session.emit("pipeline_error", {
                error: msg,
                lastCompletedStage: session.lastCompletedStage,
            });
            session.phase = "error";
        }
    }
    async runPostFramingPipeline(session) {
        if (session.phase === "cancelled")
            return;
        session.phase = "pipeline_running";
        const framing = session.framingText;
        const lc = new LoopController(this.maxLoopIterations);
        try {
            session.emit("stage_start", { stage: "assumption" });
            session.emit("stage_start", { stage: "steelman" });
            const [assumptionResult, steelmanResult] = await Promise.all([
                lc.runLoop({
                    stage: "assumption",
                    signal: session.abortController.signal,
                    emit: (ev, data) => session.emit(ev, data),
                    runAgent: ({ iteration, previousOutput, graderFeedback, onChunk }) => runAssumptionIteration({
                        decisionText: session.decisionText,
                        framingText: framing,
                        iteration,
                        previousOutput,
                        graderFeedback,
                        signal: session.abortController.signal,
                        onChunk,
                    }),
                    grade: (text) => gradeAssumptionOutput({
                        decisionText: session.decisionText,
                        framingText: framing,
                        agentOutput: text,
                        signal: session.abortController.signal,
                    }),
                    sumScores: (g) => sumAssumptionScores(g),
                }),
                lc.runLoop({
                    stage: "steelman",
                    signal: session.abortController.signal,
                    emit: (ev, data) => session.emit(ev, data),
                    runAgent: ({ iteration, previousOutput, graderFeedback, onChunk }) => runSteelmanIteration({
                        decisionText: session.decisionText,
                        framingText: framing,
                        iteration,
                        previousOutput,
                        graderFeedback,
                        signal: session.abortController.signal,
                        onChunk,
                    }),
                    grade: (text) => gradeSteelmanOutput({
                        decisionText: session.decisionText,
                        framingText: framing,
                        agentOutput: text,
                        signal: session.abortController.signal,
                    }),
                    sumScores: (g) => sumSteelmanScores(g),
                }),
            ]);
            session.assumptionText = assumptionResult.text;
            session.steelmanText = steelmanResult.text;
            session.lastCompletedStage = "assumption";
            session.emit("stage_complete", {
                stage: "assumption",
                result: assumptionResult,
            });
            session.lastCompletedStage = "steelman";
            session.emit("stage_complete", {
                stage: "steelman",
                result: steelmanResult,
            });
            session.emit("stage_start", { stage: "synthesis" });
            const synthesisResult = await lc.runLoop({
                stage: "synthesis",
                signal: session.abortController.signal,
                emit: (ev, data) => session.emit(ev, data),
                runAgent: ({ iteration, previousOutput, graderFeedback, onChunk }) => runSynthesisIteration({
                    decisionText: session.decisionText,
                    framingText: framing,
                    assumptionText: assumptionResult.text,
                    steelmanText: steelmanResult.text,
                    iteration,
                    previousOutput,
                    graderFeedback,
                    signal: session.abortController.signal,
                    onChunk,
                }),
                grade: (text) => gradeSynthesisOutput({
                    decisionText: session.decisionText,
                    framingText: framing,
                    assumptionText: assumptionResult.text,
                    steelmanText: steelmanResult.text,
                    agentOutput: text,
                    signal: session.abortController.signal,
                }),
                sumScores: (g) => sumSynthesisScores(g),
            });
            session.synthesisText = synthesisResult.text;
            session.lastCompletedStage = "synthesis";
            session.emit("stage_complete", {
                stage: "synthesis",
                result: synthesisResult,
            });
            session.emit("pipeline_complete", {
                finalResult: {
                    framing,
                    assumption: assumptionResult.text,
                    steelman: steelmanResult.text,
                    synthesis: synthesisResult.text,
                },
            });
            session.phase = "complete";
        }
        catch (e) {
            if (isAbortError(e)) {
                return;
            }
            const msg = errorMessage(e);
            session.emit("pipeline_error", {
                error: msg,
                lastCompletedStage: session.lastCompletedStage,
            });
            session.phase = "error";
        }
    }
}
//# sourceMappingURL=PipelineOrchestrator.js.map
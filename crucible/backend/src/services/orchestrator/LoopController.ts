import type { LoopCompleteResult, SseEventName, StageGrade } from "@crucible/shared";

export type SessionEmit = (
  event: SseEventName,
  data: Record<string, unknown>,
) => void;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }
}

export class LoopController {
  constructor(private readonly maxIterations: number) {}

  async runLoop<G extends StageGrade>(options: {
    stage: G["stage"];
    signal: AbortSignal;
    emit: SessionEmit;
    runAgent: (args: {
      iteration: number;
      previousOutput: string | null;
      graderFeedback: string | null;
      onChunk: (text: string) => void;
    }) => Promise<string>;
    grade: (output: string) => Promise<G>;
    sumScores: (grade: G) => number;
  }): Promise<LoopCompleteResult> {
    const { stage, signal, emit, runAgent, grade, sumScores } = options;
    let previousOutput: string | null = null;
    let graderFeedback: string | null = null;
    let bestText = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (signal.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }

      emit("loop_start", {
        stage,
        iteration,
        maxIterations: this.maxIterations,
      });

      const text = await runAgent({
        iteration,
        previousOutput,
        graderFeedback,
        onChunk: (chunk) => emit("agent_chunk", { stage, text: chunk }),
      });
      throwIfAborted(signal);

      const loopResult: LoopCompleteResult = {
        text,
        passedGrading: false,
        iterationsUsed: iteration,
      };
      emit("loop_complete", { stage, iteration, result: loopResult });

      const gradeResult = await grade(text);
      emit("grade_result", { stage, iteration, grade: gradeResult });
      throwIfAborted(signal);

      const total = sumScores(gradeResult);
      if (total > bestScore) {
        bestScore = total;
        bestText = text;
      }

      if (gradeResult.passed) {
        return {
          text,
          passedGrading: true,
          iterationsUsed: iteration,
        };
      }

      previousOutput = text;
      graderFeedback = gradeResult.feedback;
    }

    emit("max_iterations_reached", { stage, bestScore });
    return {
      text: bestText,
      passedGrading: false,
      iterationsUsed: this.maxIterations,
      maxIterationsReached: true,
    };
  }
}

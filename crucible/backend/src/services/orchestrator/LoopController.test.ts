import { describe, expect, it, vi } from "vitest";
import type { StageGrade } from "@crucible/shared";
import { LoopController } from "./LoopController.js";

type AssumptionGrade = Extract<StageGrade, { stage: "assumption" }>;

function makeGrade(passed: boolean, scores: AssumptionGrade["scores"]): AssumptionGrade {
  return {
    stage: "assumption",
    passed,
    scores,
    failureReasons: passed ? [] : ["not yet"],
    feedback: passed ? "" : "improve",
  };
}

function sumAssumption(g: AssumptionGrade): number {
  return g.scores.depth + g.scores.coverage + g.scores.independence;
}

describe("LoopController", () => {
  it("returns immediately when grading passes on first iteration", async () => {
    const emit = vi.fn();
    const controller = new LoopController(4);
    const runAgent = vi.fn().mockResolvedValueOnce("out1");
    const grade = vi
      .fn()
      .mockResolvedValueOnce(makeGrade(true, { depth: 4, coverage: 4, independence: 3 }));

    const result = await controller.runLoop<AssumptionGrade>({
      stage: "assumption",
      signal: new AbortController().signal,
      emit,
      runAgent,
      grade,
      sumScores: sumAssumption,
    });

    expect(result).toEqual({
      text: "out1",
      passedGrading: true,
      iterationsUsed: 1,
    });
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(grade).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalledWith(
      "max_iterations_reached",
      expect.anything(),
    );
  });

  it("feeds back only the latest grader output on the next iteration", async () => {
    const emit = vi.fn();
    const controller = new LoopController(4);
    const runAgent = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    const grade = vi
      .fn()
      .mockResolvedValueOnce(
        makeGrade(false, { depth: 2, coverage: 2, independence: 2 }),
      )
      .mockResolvedValueOnce(makeGrade(true, { depth: 4, coverage: 4, independence: 3 }));

    await controller.runLoop<AssumptionGrade>({
      stage: "assumption",
      signal: new AbortController().signal,
      emit,
      runAgent,
      grade,
      sumScores: sumAssumption,
    });

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(runAgent.mock.calls[1]![0]).toMatchObject({
      iteration: 2,
      previousOutput: "a",
      graderFeedback: "improve",
    });
  });

  it("emits max_iterations_reached and returns best-scoring output when never passing", async () => {
    const emit = vi.fn();
    const max = 3;
    const controller = new LoopController(max);
    const runAgent = vi
      .fn()
      .mockResolvedValueOnce("low")
      .mockResolvedValueOnce("mid")
      .mockResolvedValueOnce("high");
    const grade = vi
      .fn()
      .mockResolvedValueOnce(makeGrade(false, { depth: 1, coverage: 1, independence: 1 })) // sum 3
      .mockResolvedValueOnce(makeGrade(false, { depth: 2, coverage: 2, independence: 2 })) // sum 6
      .mockResolvedValueOnce(makeGrade(false, { depth: 2, coverage: 2, independence: 1 })); // sum 5

    const result = await controller.runLoop<AssumptionGrade>({
      stage: "assumption",
      signal: new AbortController().signal,
      emit,
      runAgent,
      grade,
      sumScores: sumAssumption,
    });

    expect(result.text).toBe("mid");
    expect(result.passedGrading).toBe(false);
    expect(result.iterationsUsed).toBe(max);
    expect(result.maxIterationsReached).toBe(true);
    expect(emit).toHaveBeenCalledWith("max_iterations_reached", {
      stage: "assumption",
      bestScore: 6,
    });
  });

  it("propagates abort before starting a new iteration", async () => {
    const emit = vi.fn();
    const controller = new LoopController(4);
    const ac = new AbortController();
    const runAgent = vi.fn().mockImplementation(async () => {
      ac.abort();
      return "x";
    });
    const grade = vi.fn().mockResolvedValue(makeGrade(false, { depth: 1, coverage: 1, independence: 1 }));

    await expect(
      controller.runLoop<AssumptionGrade>({
        stage: "assumption",
        signal: ac.signal,
        emit,
        runAgent,
        grade,
        sumScores: sumAssumption,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

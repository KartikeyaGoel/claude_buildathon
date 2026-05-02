import { runAnthropic, runGemini, runOpenAI, runPerplexity } from "../../providers/index.js";
import { errorText } from "../../providers/retry.js";
import type { AgentRole, Provider, ProviderFailure, ProviderResult } from "../../providers/types.js";
import { roleSystemPrompt, wrapUserContent } from "./prompts.js";

const PROVIDERS: Record<AgentRole, Provider> = {
  advocate: runAnthropic,
  critic: runOpenAI,
  steelman: runGemini,
  blindspot: runPerplexity,
};

function makeAbortController(signal?: AbortSignal, timeoutMs = 30_000): AbortController {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller;
}

export interface ParallelAgentResult {
  results: ProviderResult[];
  failures: ProviderFailure[];
  degradedAgents: AgentRole[];
}

export async function runParallelAgents(content: string, signal?: AbortSignal): Promise<ParallelAgentResult> {
  const controller = makeAbortController(signal);
  const user = wrapUserContent(content);

  const settled = await Promise.allSettled(
    (Object.entries(PROVIDERS) as Array<[AgentRole, Provider]>).map(([role, provider]) =>
      provider({
        role,
        system: roleSystemPrompt(role),
        user,
        timeoutMs: 30_000,
        signal: controller.signal,
      }),
    ),
  );

  const results: ProviderResult[] = [];
  const failures: ProviderFailure[] = [];

  settled.forEach((entry, index) => {
    const role = (Object.keys(PROVIDERS) as AgentRole[])[index]!;
    if (entry.status === "fulfilled") {
      results.push(entry.value);
    } else {
      failures.push({
        role,
        provider: role,
        error: errorText(entry.reason),
        retryable: true,
      });
    }
  });

  if (results.length < 3) {
    const error = new Error("At least three model agents must succeed");
    (error as Error & { code: string; statusCode: number; failures: ProviderFailure[] }).code =
      "PIPELINE_INSUFFICIENT_AGENTS";
    (error as Error & { code: string; statusCode: number; failures: ProviderFailure[] }).statusCode = 503;
    (error as Error & { code: string; statusCode: number; failures: ProviderFailure[] }).failures = failures;
    throw error;
  }

  return {
    results,
    failures,
    degradedAgents: failures.map((failure) => failure.role),
  };
}

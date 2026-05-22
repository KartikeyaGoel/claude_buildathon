import { runAnthropic, runOpenAI, runPerplexity } from "../../providers/index.js";
import { errorText } from "../../providers/retry.js";
import type { AgentRole, Provider, ProviderFailure, ProviderResult } from "../../providers/types.js";
import { modelTimeoutMs } from "../../utils/pipelineCancel.js";
import { roleSystemPrompt, wrapInterrogationContent } from "./prompts.js";
import { env } from "../../config/env.js";

function enabledProviders(): Array<[AgentRole, Provider]> {
  const entries: Array<[AgentRole, Provider]> = [];

  entries.push(["advocate", runAnthropic]);
  entries.push(["steelman", runAnthropic]);

  if (env.OPENAI_API_KEY) entries.push(["critic", runOpenAI]);
  if (env.PERPLEXITY_API_KEY) entries.push(["blindspot", runPerplexity]);

  return entries;
}

export interface ParallelAgentResult {
  results: ProviderResult[];
  failures: ProviderFailure[];
  degradedAgents: AgentRole[];
}

export async function runParallelAgents(
  content: string,
  userPosition?: string,
): Promise<ParallelAgentResult> {
  const user = wrapInterrogationContent(content, userPosition);
  const providers = enabledProviders();

  const settled = await Promise.allSettled(
    providers.map(([role, provider]) =>
      provider({
        role,
        system: roleSystemPrompt(role),
        user,
        ...(provider === runAnthropic ? { model: env.ANTHROPIC_MODEL } : {}),
        timeoutMs: modelTimeoutMs(role),
      }),
    ),
  );

  const results: ProviderResult[] = [];
  const failures: ProviderFailure[] = [];

  settled.forEach((entry, index) => {
    const role = providers[index]![0]!;
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

  const requiredSuccess = Math.min(3, providers.length);
  if (results.length < requiredSuccess) {
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

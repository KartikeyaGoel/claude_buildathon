export type AgentRole = "advocate" | "critic" | "steelman" | "blindspot";

export interface ProviderCall {
  role: AgentRole;
  system: string;
  user: string;
  model?: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface ProviderResult {
  role: AgentRole;
  text: string;
  model: string;
  latencyMs: number;
  timedOut: boolean;
}

export type Provider = (call: ProviderCall) => Promise<ProviderResult>;

export interface ProviderFailure {
  role: AgentRole;
  provider: string;
  error: string;
  retryable: boolean;
}

export interface EmbeddingProvider {
  embed(text: string, signal?: AbortSignal): Promise<number[]>;
}

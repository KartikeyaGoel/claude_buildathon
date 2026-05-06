import type { AgentRole, ProviderResult } from "../../providers/types.js";

export interface AuthenticatedUser {
  id: string;
  planTier: "free" | "pro" | "admin";
  isAdmin: boolean;
}

export interface GateResult {
  passed: boolean;
  stage1Passed: boolean;
  stage2Passed: boolean | null;
  reason: string;
}

export interface ScoredAssumption {
  id?: string;
  text: string;
  type: string;
  domain: string;
  validity: number;
  consequence: number;
  novelty: number;
  compositeScore: number;
  sourceModels: AgentRole[];
  modelsAccepting?: AgentRole[];
  crossModelAgreement?: number;
  canonicalId?: string | null;
}

export interface InterrogationResponse {
  interrogation_id: string;
  trace_id: string;
  divergence_score: number;
  reliability_signal: "high" | "moderate" | "low" | "contested";
  assumptions: ScoredAssumption[];
  divergence_details: Record<string, unknown>;
  /**
   * Stage-4 style recommendation produced from surfaced/scored assumptions.
   * Returned by both REST API and MCP callers.
   */
  synthesis_text?: string;
  metadata: {
    cached: boolean;
    originating_model: string;
    domain: string;
    execution_time_ms: number;
    agents_completed: number;
    degraded_agents: AgentRole[];
    model_outputs: Array<Pick<ProviderResult, "role" | "model" | "latencyMs">>;
  };
}

export interface RunInterrogationInput {
  user: AuthenticatedUser;
  content: string;
  domain?: string;
  context?: string;
  originatingModel?: string;
  sessionId?: string;
  source: "api" | "mcp";
  signal?: AbortSignal;
}

import type { AgentRole, ProviderResult } from "../../providers/types.js";
import type {
  AssumptionLens,
  AssumptionTaxonomyFields,
  AssumptionVisibility,
  ImplicitAssumptionSurfaced,
} from "./assumptionTaxonomy.js";

export type { AssumptionLens, AssumptionTaxonomyFields, AssumptionVisibility, ImplicitAssumptionSurfaced };

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

export interface ScoredAssumption extends AssumptionTaxonomyFields {
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

export interface DeliberationStage {
  agent_outputs: string[];
  divergence_score: number;
}

export interface CognitiveGymSynthesis {
  position_held: string;
  position_cracked: string;
  position_missed: string;
  overall_confidence: number;
  overall_divergence: number;
  implicit_assumptions_surfaced?: ImplicitAssumptionSurfaced[];
}

export interface TemporalHorizonVariant {
  horizon: "90d" | "2yr" | "10yr";
  assumption_variant: string;
  divergence_from_present: number;
  rationale: string;
}

export interface TemporalStackResult {
  source_assumption: string;
  variants: TemporalHorizonVariant[];
  max_divergence: number;
}

export interface DeliberationOnlyPayload {
  framing: DeliberationStage;
  assumption_excavation: DeliberationStage;
  steelman: DeliberationStage;
  negative_space?: DeliberationStage;
  temporal_stack?: DeliberationStage & { horizons?: TemporalStackResult[] };
  user_position_echo: string;
}

export interface CognitiveGymPayload extends DeliberationOnlyPayload {
  synthesis: CognitiveGymSynthesis;
}

export type GymSessionStatus =
  | "awaiting_judgment"
  | "awaiting_recommitment"
  | "complete"
  | "abandoned";

/** Server-held state for staged MCP synthesis (JSON-serializable). */
export interface DeliberationSnapshot {
  content: string;
  domain: string;
  user_position: string;
  framing_text: string;
  assumptions: ScoredAssumption[];
  agent_results: Array<{ role: string; model: string; text: string; latencyMs: number }>;
  steelman_text: string;
  negative_space_text?: string;
  temporal_stack_text?: string;
  temporal_stacks?: TemporalStackResult[];
  context_bundle_text?: string;
  preliminary_divergence: number;
  deliberation_stages: DeliberationOnlyPayload;
}

export interface ContextBundle {
  position_commitments: Array<{ initial_position: string; final_position: string; created_at: string }>;
  recurring_assumptions: Array<{ text: string; times_flagged: number; canonical_id: string | null }>;
  prior_session_summaries: Array<{ trace_id: string; domain: string; summary: string; created_at: string }>;
}

export interface PipelineAmplificationMeta {
  negative_space_output?: string;
  temporal_stack?: TemporalStackResult[];
  context_bundle_loaded?: boolean;
  mcp_framing?: boolean;
  layered_excavation?: boolean;
  framing_text?: string;
  steelman_text?: string;
  context_bundle_text?: string;
  preliminary_divergence?: number;
  defer_synthesis?: boolean;
  user_judgment?: string;
  synthesis?: CognitiveGymSynthesis;
  synthesis_deferred?: boolean;
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
  /** Full Cognitive Gym deliberation payload (MCP and position-aware runs). */
  cognitive_gym?: CognitiveGymPayload;
  /** Present when deferSynthesis=true (staged MCP deliberate step). */
  deliberation?: DeliberationOnlyPayload;
  staged_meta?: StagedInterrogationMeta;
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
  /** Required for MCP; when set, pipeline stress-tests content against this commitment. */
  userPosition?: string;
  domain?: string;
  context?: string;
  originatingModel?: string;
  sessionId?: string;
  source: "api" | "mcp";
  signal?: AbortSignal;
  /** Pre-loaded context bundle; loaded automatically when omitted and user is authenticated. */
  contextBundle?: ContextBundle;
  /** When true, run deliberation only — synthesis is deferred to a later staged MCP call. */
  deferSynthesis?: boolean;
}

export interface StagedInterrogationMeta {
  framingText: string;
  steelmanText: string;
  negativeSpaceText?: string;
  temporalStackText?: string;
  temporalStacks?: TemporalStackResult[];
  contextBundleText?: string;
  preliminaryDivergence: number;
  agentResults: Array<{ role: string; model: string; text: string; latencyMs: number }>;
}

export interface DeliberationResponse extends InterrogationResponse {
  deliberation: DeliberationOnlyPayload;
  disagreement: { question: string; sideA: string; sideB: string };
  gym_session_status: GymSessionStatus;
}

export interface InterrogationResponseWithDeliberation extends InterrogationResponse {
  deliberation?: DeliberationOnlyPayload;
  staged_meta?: StagedInterrogationMeta;
}

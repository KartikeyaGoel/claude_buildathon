import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: ".env.local" });
loadDotenv();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().default(""),
  PERPLEXITY_API_KEY: z.string().default(""),
  DATABASE_URL: z.string().min(1).default("postgresql://crucible:crucible_dev@localhost:5432/crucible"),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  /** Extra Host header values allowed for Streamable HTTP MCP (comma-separated), e.g. custom domain */
  MCP_ALLOWED_HOSTS: z.string().default(""),
  /** Sonnet-class: synthesis, MCP framing. */
  MODEL_ID: z.string().min(1).default("claude-sonnet-4-5"),
  /** Layered assumption excavation — one tier below MODEL_ID for latency. */
  EXCAVATION_MODEL: z.string().min(1).default("claude-sonnet-4-0"),
  /** Sonnet-class Anthropic: advocate, steelman, validity judge, negative-space. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-5"),
  /** Fast Anthropic: temporal stack only. */
  TEMPORAL_MODEL: z.string().min(1).default("claude-haiku-4-5"),
  ANTHROPIC_GATE_MODEL: z.string().min(1).default("claude-haiku-4-5"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  PERPLEXITY_MODEL: z.string().min(1).default("sonar"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  MAX_LOOP_ITERATIONS: z.coerce.number().int().positive().max(20).default(4),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  WEBHOOK_HMAC_SECRET: z.string().default(""),
  ADMIN_API_KEY: z.string().default(""),
  CRUCIBLE_API_KEY: z.string().default(""),
  FREE_TIER_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
  CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  MAX_CONTENT_CHARS: z.coerce.number().int().positive().default(50_000),
  MAX_CONCURRENT_INTERROGATIONS: z.coerce.number().int().positive().default(3),
  /** When set, POST /v1/users/register requires header X-Registration-Secret matching this value. */
  REGISTRATION_SECRET: z.string().default(""),
  GCP_PROJECT_ID: z.string().default(""),
  GCP_REGION: z.string().default("us-central1"),
  GCP_CLOUD_SQL_INSTANCE: z.string().default(""),
  /**
   * all — local dev: REST + MCP in one process.
   * api — Cloud Run service: /v1 + legacy UI only.
   * mcp — Cloud Run service: /mcp only (single instance for Streamable HTTP sessions).
   */
  CRUCIBLE_SERVICE_ROLE: z.enum(["all", "api", "mcp"]).default("all"),
});

function readMaxLoopIterations(): number {
  const raw =
    process.env.MAX_LOOP_ITERATIONS ?? process.env.MAX_ITERATIONS ?? "4";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 20) return 4;
  return Math.floor(n);
}

const parsed = envSchema.safeParse({
  ...process.env,
  MAX_LOOP_ITERATIONS: readMaxLoopIterations(),
});

if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;

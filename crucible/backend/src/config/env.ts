import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: ".env.local" });
loadDotenv();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().default(""),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().default(""),
  PERPLEXITY_API_KEY: z.string().default(""),
  DATABASE_URL: z.string().min(1).default("postgresql://crucible:crucible_dev@localhost:5432/crucible"),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  MODEL_ID: z.string().min(1).default("claude-sonnet-4-20250514"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-20250514"),
  ANTHROPIC_GATE_MODEL: z.string().min(1).default("claude-3-5-haiku-latest"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  GEMINI_MODEL: z.string().min(1).default("gemini-1.5-pro"),
  PERPLEXITY_MODEL: z.string().min(1).default("sonar-pro"),
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
  GCP_PROJECT_ID: z.string().default(""),
  GCP_REGION: z.string().default("us-central1"),
  GCP_CLOUD_SQL_INSTANCE: z.string().default(""),
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

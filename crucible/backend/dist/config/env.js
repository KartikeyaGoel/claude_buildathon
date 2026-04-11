import { config as loadDotenv } from "dotenv";
import { z } from "zod";
loadDotenv();
const envSchema = z.object({
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
    PORT: z.coerce.number().int().positive().default(3001),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    MODEL_ID: z.string().min(1).default("claude-sonnet-4-20250514"),
    MAX_LOOP_ITERATIONS: z.coerce.number().int().positive().max(20).default(4),
    SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
});
function readMaxLoopIterations() {
    const raw = process.env.MAX_LOOP_ITERATIONS ?? process.env.MAX_ITERATIONS ?? "4";
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 20)
        return 4;
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
//# sourceMappingURL=env.js.map
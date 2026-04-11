/** Loaded before test files so `env.ts` validation succeeds without a real API key. */
process.env.ANTHROPIC_API_KEY ??= "vitest-placeholder-key";

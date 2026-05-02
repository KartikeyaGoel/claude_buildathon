import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@crucible/shared": path.resolve(__dirname, "../shared/types.ts"),
    },
  },
  test: {
    globals: false,
    env: {
      ANTHROPIC_API_KEY: "vitest-placeholder-key",
      WEBHOOK_HMAC_SECRET: "vitest-webhook-secret",
    },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

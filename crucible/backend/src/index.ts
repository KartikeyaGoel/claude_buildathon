import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { env } from "./config/env.js";
import { SessionStore } from "./services/SessionStore.js";
import { PipelineOrchestrator } from "./services/orchestrator/PipelineOrchestrator.js";
import { registerProblemDetails } from "./middleware/problemDetails.js";
import { registerRequestId } from "./middleware/requestId.js";
import { closePool } from "./db/pool.js";
import { registerLegacyRoutes } from "./routes/legacyRoutes.js";
import { registerCacheRoutes } from "./routes/v1/cache.js";
import { registerDashboardRoutes } from "./routes/v1/dashboard.js";
import { registerHealthRoutes } from "./routes/v1/health.js";
import { registerHistoryRoutes } from "./routes/v1/history.js";
import { registerInterrogateRoutes } from "./routes/v1/interrogate.js";
import { registerOutcomeRoutes } from "./routes/v1/outcome.js";
import { registerStatsRoutes } from "./routes/v1/stats.js";
import { registerUserRoutes } from "./routes/v1/users.js";
import { registerWebhookRoutes } from "./routes/v1/webhooks.js";
import { registerMcpStreamableHttp } from "./mcp/httpRoutes.js";

const role = env.CRUCIBLE_SERVICE_ROLE;
const serveApi = role === "all" || role === "api";
const serveMcp = role === "all" || role === "mcp";

const app = Fastify({
  bodyLimit: 1_048_576,
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: [
      "req.headers.authorization",
      "body.api_key",
      "body.secret",
      "body.token",
      "*.api_key",
      "*.secret",
      "*.token",
    ],
  },
});

registerProblemDetails(app);
registerRequestId(app);

await app.register(cors, {
  origin: (origin, cb) => {
    if (env.NODE_ENV !== "production") {
      cb(null, true);
      return;
    }
    if (!origin) {
      cb(null, true);
      return;
    }
    try {
      cb(null, new URL(env.FRONTEND_URL).origin === origin);
    } catch {
      cb(null, false);
    }
  },
  exposedHeaders: [
    "WWW-Authenticate",
    "Mcp-Session-Id",
    "Last-Event-ID",
    "Mcp-Protocol-Version",
  ],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Mcp-Session-Id",
    "Mcp-Protocol-Version",
    "Accept",
    "Last-Event-ID",
  ],
  methods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
});
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
await app.register(sensible);

if (serveMcp) {
  await registerMcpStreamableHttp(app);
}

if (serveApi) {
  const store = new SessionStore();
  store.startCleanupInterval();
  const orchestrator = new PipelineOrchestrator(env.MAX_LOOP_ITERATIONS);
  await registerLegacyRoutes(app, store, orchestrator);
  await app.register(registerHealthRoutes, { prefix: "/v1" });
  await app.register(registerUserRoutes, { prefix: "/v1" });
  await app.register(registerInterrogateRoutes, { prefix: "/v1" });
  await app.register(registerOutcomeRoutes, { prefix: "/v1" });
  await app.register(registerHistoryRoutes, { prefix: "/v1" });
  await app.register(registerStatsRoutes, { prefix: "/v1" });
  await app.register(registerDashboardRoutes, { prefix: "/v1" });
  await app.register(registerWebhookRoutes, { prefix: "/v1" });
  await app.register(registerCacheRoutes, { prefix: "/v1" });
  app.get("/api/health", async () => ({ status: "ok" }));
}

if (role === "mcp") {
  app.get("/health", async () => ({ status: "ok", role: "mcp" }));
}

const close = async () => {
  await app.close();
  await closePool();
};

process.on("SIGTERM", () => {
  close().finally(() => process.exit(0));
});
process.on("SIGINT", () => {
  close().finally(() => process.exit(0));
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });

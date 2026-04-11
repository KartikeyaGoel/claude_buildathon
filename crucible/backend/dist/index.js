import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { createSessionRouter } from "./routes/sessionRoutes.js";
import { SessionStore } from "./services/SessionStore.js";
import { PipelineOrchestrator } from "./services/orchestrator/PipelineOrchestrator.js";
const app = express();
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());
const store = new SessionStore();
store.startCleanupInterval();
const orchestrator = new PipelineOrchestrator(env.MAX_LOOP_ITERATIONS);
app.use("/api", createSessionRouter(store, orchestrator));
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.listen(env.PORT, () => {
    console.log(`Crucible backend listening on port ${env.PORT}`);
});
//# sourceMappingURL=index.js.map
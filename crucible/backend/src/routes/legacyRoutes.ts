import type { FastifyInstance } from "fastify";
import type { ConfirmFramingBody, CreateSessionBody } from "@crucible/shared";
import { PipelineOrchestrator } from "../services/orchestrator/PipelineOrchestrator.js";
import { SessionStore } from "../services/SessionStore.js";

function paramId(params: unknown): string {
  return typeof params === "object" && params != null && "id" in params ? String((params as { id: string }).id) : "";
}

export async function registerLegacyRoutes(
  app: FastifyInstance,
  store: SessionStore,
  orchestrator: PipelineOrchestrator,
): Promise<void> {
  app.post("/api/sessions", async (request, reply) => {
    const body = request.body as CreateSessionBody;
    if (!body || typeof body.decisionText !== "string" || !body.decisionText.trim()) {
      reply.status(400).send({ error: "decisionText is required" });
      return;
    }

    const session = store.create(body.decisionText.trim());
    session.pipelineChain = session.pipelineChain
      .then(() => orchestrator.runInitialFraming(session))
      .catch((error) => request.log.error({ err: error }, "initial framing failed"));

    reply.status(201).send({ sessionId: session.id });
  });

  app.get("/api/sessions/:id/stream", async (request, reply) => {
    const session = store.get(paramId(request.params));
    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }

    reply.raw.statusCode = 200;
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    const lastEventId = typeof request.headers["last-event-id"] === "string" ? request.headers["last-event-id"] : undefined;
    session.attachSse(reply.raw, lastEventId);

    request.raw.on("close", () => session.detachSse(reply.raw));
    return reply;
  });

  app.post("/api/sessions/:id/confirm-framing", async (request, reply) => {
    const session = store.get(paramId(request.params));
    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }
    if (session.phase === "cancelled") {
      reply.status(400).send({ error: "Session was cancelled" });
      return;
    }
    const body = (request.body ?? {}) as ConfirmFramingBody;
    session.pipelineChain = session.pipelineChain
      .then(() => orchestrator.handleConfirmFraming(session, body))
      .catch((error) => request.log.error({ err: error }, "confirm-framing failed"));
    reply.status(202).send({ ok: true });
  });

  app.post("/api/sessions/:id/cancel", async (request, reply) => {
    const session = store.get(paramId(request.params));
    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return;
    }
    session.phase = "cancelled";
    session.abortController.abort();
    session.emit("pipeline_error", {
      error: "Cancelled",
      lastCompletedStage: session.lastCompletedStage,
    });
    reply.send({ ok: true });
  });
}

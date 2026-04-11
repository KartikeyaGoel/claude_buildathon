import { Router, type Request, type Response } from "express";
import type { ConfirmFramingBody, CreateSessionBody } from "@crucible/shared";
import { PipelineOrchestrator } from "../services/orchestrator/PipelineOrchestrator.js";
import { SessionStore } from "../services/SessionStore.js";

function paramId(p: string | string[] | undefined): string {
  if (Array.isArray(p)) return p[0] ?? "";
  return p ?? "";
}

export function createSessionRouter(
  store: SessionStore,
  orchestrator: PipelineOrchestrator,
): Router {
  const router = Router();

  router.post("/sessions", (req: Request, res: Response) => {
    const body = req.body as CreateSessionBody;
    if (!body || typeof body.decisionText !== "string" || !body.decisionText.trim()) {
      res.status(400).json({ error: "decisionText is required" });
      return;
    }
    const session = store.create(body.decisionText.trim());
    session.pipelineChain = session.pipelineChain
      .then(() => orchestrator.runInitialFraming(session))
      .catch((e) => {
        console.error("[session] initial framing failed", e);
      });
    res.status(201).json({ sessionId: session.id });
  });

  router.get("/sessions/:id/stream", (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const session = store.get(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const lastEventId =
      typeof req.headers["last-event-id"] === "string"
        ? req.headers["last-event-id"]
        : undefined;
    session.attachSse(res, lastEventId);

    const onClose = () => {
      session.detachSse(res);
    };
    req.on("close", onClose);
    req.on("aborted", onClose);
  });

  router.post("/sessions/:id/confirm-framing", (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const session = store.get(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.phase === "cancelled") {
      res.status(400).json({ error: "Session was cancelled" });
      return;
    }
    const body = (req.body ?? {}) as ConfirmFramingBody;
    session.pipelineChain = session.pipelineChain
      .then(() => orchestrator.handleConfirmFraming(session, body))
      .catch((e) => {
        console.error("[session] confirm-framing failed", e);
      });
    res.status(202).json({ ok: true });
  });

  router.post("/sessions/:id/cancel", (req: Request, res: Response) => {
    const id = paramId(req.params.id);
    const session = store.get(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    session.phase = "cancelled";
    session.abortController.abort();
    session.emit("pipeline_error", {
      error: "Cancelled",
      lastCompletedStage: session.lastCompletedStage,
    });
    res.status(200).json({ ok: true });
  });

  return router;
}

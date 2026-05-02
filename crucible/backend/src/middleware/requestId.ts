import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export function registerRequestId(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers["x-request-id"];
    request.requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    reply.header("X-Request-Id", request.requestId);
  });
}

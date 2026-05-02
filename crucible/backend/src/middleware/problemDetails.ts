import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
}

function problemFromError(error: unknown, request: FastifyRequest): ProblemDetails {
  const err = error as { statusCode?: number; code?: unknown; message?: unknown };
  const status = err.statusCode ?? 500;
  const code = typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
  const message = typeof err.message === "string" ? err.message : "Unexpected error";
  return {
    type: `https://api.crucible.dev/problems/${code.toLowerCase()}`,
    title: status >= 500 ? "Internal Server Error" : message,
    status,
    detail: message,
    code,
    instance: request.url,
  };
}

export function sendProblem(reply: FastifyReply, status: number, code: string, detail: string): void {
  reply.status(status).type("application/problem+json").send({
    type: `https://api.crucible.dev/problems/${code.toLowerCase()}`,
    title: detail,
    status,
    detail,
    code,
  });
}

export function registerProblemDetails(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const problem = problemFromError(error, request);
    request.log.error({ err: error, code: problem.code }, "request failed");
    reply.status(problem.status).type("application/problem+json").send(problem);
  });
}

import type { AuthenticatedUser } from "../services/engine/types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    requestId: string;
  }
}

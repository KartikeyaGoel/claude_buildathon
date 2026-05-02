import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config/env.js";
import { sendProblem } from "../middleware/problemDetails.js";
import { userFromPlaintextApiKey } from "./auth.js";
import { mcpUserAls } from "./authContext.js";
import { createMcpServer } from "./server.js";

const transports: Record<string, StreamableHTTPServerTransport> = {};

function bearerToken(request: FastifyRequest): string | null {
  const h = request.headers.authorization;
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

function mcpSessionHeader(request: FastifyRequest): string | undefined {
  const h = request.headers["mcp-session-id"];
  return typeof h === "string" ? h : undefined;
}

function bodyHasInitialize(body: unknown): boolean {
  if (Array.isArray(body)) return body.some((m) => isInitializeRequest(m));
  return isInitializeRequest(body);
}

function mcpAllowedHosts(): string[] | undefined {
  const hosts: string[] = [];
  try {
    hosts.push(new URL(env.PUBLIC_API_URL).host);
  } catch {
    /* ignore */
  }
  for (const p of env.MCP_ALLOWED_HOSTS.split(",")) {
    const s = p.trim();
    if (s) hosts.push(s);
  }
  if (hosts.length === 0) return undefined;
  return [...new Set(hosts)];
}

function streamableDnsOptions(): {
  enableDnsRebindingProtection: boolean;
  allowedHosts: string[] | undefined;
} {
  const hosts = mcpAllowedHosts();
  const protect = env.NODE_ENV === "production" && hosts !== undefined;
  return {
    enableDnsRebindingProtection: protect,
    allowedHosts: protect ? hosts : undefined,
  };
}

function sendJsonRpcError(reply: FastifyReply, status: number, code: number, message: string): void {
  reply.hijack();
  reply.raw.statusCode = status;
  reply.raw.setHeader("Content-Type", "application/json");
  reply.raw.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
  );
}

export async function registerMcpStreamableHttp(app: FastifyInstance): Promise<void> {
  const dns = streamableDnsOptions();

  const handlePost = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = bearerToken(request);
    if (!token) {
      sendProblem(
        reply,
        401,
        "UNAUTHORIZED",
        "Authorization: Bearer <api_key> required (same key returned from POST /v1/users/register).",
      );
      return;
    }

    let user;
    try {
      user = await userFromPlaintextApiKey(token);
    } catch {
      sendProblem(reply, 401, "UNAUTHORIZED", "Invalid API key.");
      return;
    }

    const sessionId = mcpSessionHeader(request);

    await mcpUserAls.run(user, async () => {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && bodyHasInitialize(request.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport!;
          },
          enableDnsRebindingProtection: dns.enableDnsRebindingProtection,
          allowedHosts: dns.allowedHosts,
        });

        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };

        const server = createMcpServer();
        await server.connect(transport);
        reply.hijack();
        await transport.handleRequest(request.raw, reply.raw, request.body);
        return;
      } else if (sessionId) {
        sendJsonRpcError(reply, 404, -32_001, "Session not found");
        return;
      } else {
        sendJsonRpcError(reply, 400, -32_000, "Bad Request: Session ID required");
        return;
      }

      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    });
  };

  const handleGet = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = bearerToken(request);
    if (!token) {
      sendProblem(
        reply,
        401,
        "UNAUTHORIZED",
        "Authorization: Bearer <api_key> required for MCP SSE.",
      );
      return;
    }

    let user;
    try {
      user = await userFromPlaintextApiKey(token);
    } catch {
      sendProblem(reply, 401, "UNAUTHORIZED", "Invalid API key.");
      return;
    }

    const sessionId = mcpSessionHeader(request);
    if (!sessionId) {
      sendProblem(reply, 400, "INVALID_REQUEST", "Mcp-Session-Id header is required.");
      return;
    }

    await mcpUserAls.run(user, async () => {
      const transport = transports[sessionId];
      if (!transport) {
        sendProblem(reply, 404, "SESSION_NOT_FOUND", "Unknown or expired MCP session.");
        return;
      }
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw);
    });
  };

  const handleDelete = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = bearerToken(request);
    if (!token) {
      sendProblem(reply, 401, "UNAUTHORIZED", "Authorization: Bearer <api_key> required.");
      return;
    }

    let user;
    try {
      user = await userFromPlaintextApiKey(token);
    } catch {
      sendProblem(reply, 401, "UNAUTHORIZED", "Invalid API key.");
      return;
    }

    const sessionId = mcpSessionHeader(request);
    if (!sessionId) {
      sendProblem(reply, 400, "INVALID_REQUEST", "Mcp-Session-Id header is required.");
      return;
    }

    await mcpUserAls.run(user, async () => {
      const transport = transports[sessionId];
      if (!transport) {
        sendProblem(reply, 404, "SESSION_NOT_FOUND", "Unknown or expired MCP session.");
        return;
      }
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw);
    });
  };

  app.post("/mcp", handlePost);
  app.get("/mcp", handleGet);
  app.delete("/mcp", handleDelete);
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "../db/client.js";
import { constantTimeEqual, hashApiKey } from "../utils/crypto.js";
import { sendProblem } from "./problemDetails.js";

interface UserRow {
  id: string;
  api_key_hash: string;
  plan_tier: "free" | "pro" | "admin";
  is_admin: boolean;
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearerToken(request);
  if (!token) {
    sendProblem(reply, 401, "INVALID_API_KEY", "Authorization bearer token is required");
    return;
  }

  const hash = hashApiKey(token);
  const result = await query<UserRow>(
    "SELECT id, api_key_hash, plan_tier, is_admin FROM users WHERE api_key_hash = $1 AND deleted_at IS NULL",
    [hash],
  );
  const user = result.rows[0];

  if (!user || !constantTimeEqual(hash, user.api_key_hash)) {
    sendProblem(reply, 401, "INVALID_API_KEY", "API key is invalid");
    return;
  }

  request.user = {
    id: user.id,
    planTier: user.plan_tier,
    isAdmin: user.is_admin,
  };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!request.user?.isAdmin) {
    sendProblem(reply, 403, "ADMIN_REQUIRED", "Admin privileges are required");
  }
}

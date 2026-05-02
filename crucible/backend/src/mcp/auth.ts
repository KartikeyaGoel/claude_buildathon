import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { hashApiKey } from "../utils/crypto.js";
import type { AuthenticatedUser } from "../services/engine/types.js";

interface UserRow {
  id: string;
  plan_tier: "free" | "pro" | "admin";
  is_admin: boolean;
}

export async function userFromMcpEnv(): Promise<AuthenticatedUser> {
  if (!env.CRUCIBLE_API_KEY) throw new Error("CRUCIBLE_API_KEY is required for MCP");
  const result = await query<UserRow>(
    "SELECT id, plan_tier, is_admin FROM users WHERE api_key_hash = $1 AND deleted_at IS NULL",
    [hashApiKey(env.CRUCIBLE_API_KEY)],
  );
  const user = result.rows[0];
  if (!user) throw new Error("CRUCIBLE_API_KEY is invalid");
  return {
    id: user.id,
    planTier: user.plan_tier,
    isAdmin: user.is_admin,
  };
}

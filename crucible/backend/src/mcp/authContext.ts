import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthenticatedUser } from "../services/engine/types.js";
import { userFromMcpEnv } from "./auth.js";

export const mcpUserAls = new AsyncLocalStorage<AuthenticatedUser>();

/** HTTP MCP sets this via AsyncLocalStorage; stdio uses enterWith in stdio.ts */
export async function getMcpActingUser(): Promise<AuthenticatedUser> {
  const fromHttp = mcpUserAls.getStore();
  if (fromHttp) return fromHttp;
  return userFromMcpEnv();
}

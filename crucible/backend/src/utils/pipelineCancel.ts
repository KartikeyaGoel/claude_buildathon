/** Per-model calls use their own timeoutMs. Pipeline cancel is checked only between stages. */
export function assertNotCancelled(cancel?: AbortSignal): void {
  if (!cancel?.aborted) return;
  const error = new Error("Request was aborted.");
  error.name = "AbortError";
  throw error;
}

/** Gate LLM call (Haiku JSON pass/fail). */
export const GATE_TIMEOUT_MS = 20_000;

/** Default deadline for a single model HTTP call (not the whole pipeline). */
export const MODEL_TIMEOUT_MS = 120_000;

/** @deprecated use MODEL_TIMEOUT_MS */
export const DEFAULT_MODEL_TIMEOUT_MS = MODEL_TIMEOUT_MS;

/** Claude Desktop MCP tool calls abort around this wall time — keep `deliberate` under it. */
export const MCP_TOOL_WALL_BUDGET_MS = 240_000;

export function modelTimeoutMs(_role: string, explicit?: number): number {
  return explicit ?? MODEL_TIMEOUT_MS;
}

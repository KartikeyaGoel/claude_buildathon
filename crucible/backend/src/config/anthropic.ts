import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  timeout: 120_000,
  maxRetries: 0,
});

export const API_TIMEOUT_MS = 120_000;
export const MAX_SDK_RETRIES = 3;
export const BACKOFF_MS: number[] = [1000, 2000, 4000];

function getHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  if ("get" in headers && typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()] ?? null;
}

function parseRetryAfterMs(headers: unknown): number | null {
  const h = getHeader(headers, "retry-after");
  if (!h) return null;
  const sec = Number(h);
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
  const date = Date.parse(h);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 409 || (status >= 500 && status < 600);
}

export async function withRetries<T>(
  run: () => Promise<T>,
  options: { signal?: AbortSignal; label?: string } = {},
): Promise<T> {
  const { signal, label } = options;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_SDK_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await run();
    } catch (e: unknown) {
      lastErr = e;
      if (signal?.aborted) throw e;
      const status =
        e && typeof e === "object" && "status" in e ? Number((e as { status?: number }).status) : NaN;
      const headers = e && typeof e === "object" && "headers" in e ? (e as { headers?: unknown }).headers : undefined;
      if (attempt === MAX_SDK_RETRIES) break;
      if (Number.isFinite(status) && !isRetryableStatus(status)) break;
      let delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
      if (status === 429) {
        const ra = parseRetryAfterMs(headers);
        if (ra != null) delay = Math.max(delay, ra);
      }
      if (label) console.warn(`[anthropic] ${label} retry ${attempt + 1} after ${delay}ms`, e);
      await sleep(delay, signal);
    }
  }
  throw lastErr;
}

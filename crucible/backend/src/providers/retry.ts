const MAX_PROVIDER_RETRIES = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000] as const;

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function isRetryable(error: unknown): boolean {
  const status = getStatus(error);
  if (status == null) return !isAbortError(error);
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status < 600);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function withProviderRetry<T>(
  label: string,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
    if (signal?.aborted) throw abortError();

    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (signal?.aborted || !isRetryable(error) || attempt === MAX_PROVIDER_RETRIES) break;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
      console.warn(`[provider] ${label} retry ${attempt + 1} after ${delay}ms`);
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

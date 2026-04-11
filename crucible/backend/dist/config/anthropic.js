import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
export const anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: 120_000,
    maxRetries: 0,
});
export const API_TIMEOUT_MS = 120_000;
export const MAX_SDK_RETRIES = 3;
export const BACKOFF_MS = [1000, 2000, 4000];
function getHeader(headers, name) {
    if (!headers || typeof headers !== "object")
        return null;
    if ("get" in headers && typeof headers.get === "function") {
        return headers.get(name);
    }
    const rec = headers;
    return rec[name] ?? rec[name.toLowerCase()] ?? null;
}
function parseRetryAfterMs(headers) {
    const h = getHeader(headers, "retry-after");
    if (!h)
        return null;
    const sec = Number(h);
    if (Number.isFinite(sec) && sec >= 0)
        return sec * 1000;
    const date = Date.parse(h);
    if (Number.isFinite(date))
        return Math.max(0, date - Date.now());
    return null;
}
function abortError() {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return err;
}
function sleep(ms, signal) {
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
export function isRetryableStatus(status) {
    return status === 429 || status === 408 || status === 409 || (status >= 500 && status < 600);
}
export async function withRetries(run, options = {}) {
    const { signal, label } = options;
    let lastErr;
    for (let attempt = 0; attempt <= MAX_SDK_RETRIES; attempt++) {
        if (signal?.aborted)
            throw new DOMException("Aborted", "AbortError");
        try {
            return await run();
        }
        catch (e) {
            lastErr = e;
            if (signal?.aborted)
                throw e;
            const status = e && typeof e === "object" && "status" in e ? Number(e.status) : NaN;
            const headers = e && typeof e === "object" && "headers" in e ? e.headers : undefined;
            if (attempt === MAX_SDK_RETRIES)
                break;
            if (Number.isFinite(status) && !isRetryableStatus(status))
                break;
            let delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
            if (status === 429) {
                const ra = parseRetryAfterMs(headers);
                if (ra != null)
                    delay = Math.max(delay, ra);
            }
            if (label)
                console.warn(`[anthropic] ${label} retry ${attempt + 1} after ${delay}ms`, e);
            await sleep(delay, signal);
        }
    }
    throw lastErr;
}
//# sourceMappingURL=anthropic.js.map
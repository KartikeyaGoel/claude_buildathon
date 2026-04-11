export function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal && typeof AbortSignal.timeout === "function") {
        return AbortSignal.timeout(ms);
    }
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
}
/** Combine multiple AbortSignals into one (any abort aborts the result). */
export function anySignal(signals) {
    if (typeof AbortSignal !== "undefined" && "any" in AbortSignal && typeof AbortSignal.any === "function") {
        return AbortSignal.any(signals);
    }
    const parent = new AbortController();
    const forward = () => parent.abort();
    for (const s of signals) {
        if (s.aborted) {
            forward();
            break;
        }
        s.addEventListener("abort", forward, { once: true });
    }
    return parent.signal;
}
//# sourceMappingURL=abort.js.map
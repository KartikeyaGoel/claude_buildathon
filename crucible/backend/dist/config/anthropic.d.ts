import Anthropic from "@anthropic-ai/sdk";
export declare const anthropic: Anthropic;
export declare const API_TIMEOUT_MS = 120000;
export declare const MAX_SDK_RETRIES = 3;
export declare const BACKOFF_MS: number[];
export declare function isRetryableStatus(status: number): boolean;
export declare function withRetries<T>(run: () => Promise<T>, options?: {
    signal?: AbortSignal;
    label?: string;
}): Promise<T>;
//# sourceMappingURL=anthropic.d.ts.map
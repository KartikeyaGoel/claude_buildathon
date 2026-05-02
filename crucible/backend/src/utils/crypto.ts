import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeForCache(content: string): string {
  return content.trim().toLowerCase().normalize("NFKC");
}

export function contentHash(content: string): string {
  return sha256Hex(normalizeForCache(content));
}

export function hashApiKey(apiKey: string): string {
  return sha256Hex(apiKey);
}

export function generateApiKey(): string {
  return `crk_live_${randomBytes(32).toString("base64url")}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

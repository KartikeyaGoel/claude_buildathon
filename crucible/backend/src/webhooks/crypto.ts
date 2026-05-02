import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

function key(): Buffer {
  if (!env.WEBHOOK_HMAC_SECRET) throw new Error("WEBHOOK_HMAC_SECRET is required for webhook secrets");
  return createHash("sha256").update(env.WEBHOOK_HMAC_SECRET).digest();
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptWebhookSecret(ciphertext: string): string {
  const [ivText, tagText, encryptedText] = ciphertext.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid webhook secret ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signWebhookPayload(secret: string, payload: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function verifyWebhookSignature(secret: string, payload: string, timestamp: number, signature: string): boolean {
  const expected = signWebhookPayload(secret, payload, timestamp);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

import { describe, expect, it } from "vitest";
import { decryptWebhookSecret, encryptWebhookSecret, signWebhookPayload, verifyWebhookSignature } from "./crypto.js";

describe("webhook crypto", () => {
  it("encrypts and decrypts webhook secrets", () => {
    const encrypted = encryptWebhookSecret("whsec_test");
    expect(encrypted).not.toBe("whsec_test");
    expect(decryptWebhookSecret(encrypted)).toBe("whsec_test");
  });

  it("signs and verifies payloads", () => {
    const signature = signWebhookPayload("whsec_test", "{\"ok\":true}", 123);
    expect(verifyWebhookSignature("whsec_test", "{\"ok\":true}", 123, signature)).toBe(true);
    expect(verifyWebhookSignature("whsec_test", "{\"ok\":false}", 123, signature)).toBe(false);
  });
});

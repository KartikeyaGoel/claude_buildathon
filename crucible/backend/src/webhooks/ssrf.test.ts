import { describe, expect, it } from "vitest";
import { assertWebhookUrlSafe } from "./ssrf.js";

describe("assertWebhookUrlSafe", () => {
  it("rejects non-HTTPS URLs", async () => {
    await expect(assertWebhookUrlSafe("http://example.com/hook")).rejects.toThrow(/HTTPS/);
  });

  it("rejects localhost IPs", async () => {
    await expect(assertWebhookUrlSafe("https://127.0.0.1/hook")).rejects.toThrow(/private IPv4/);
  });
});

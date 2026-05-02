import { setTimeout as delay } from "node:timers/promises";
import { query } from "../db/client.js";
import { decryptWebhookSecret, signWebhookPayload } from "./crypto.js";
import { assertWebhookUrlSafe } from "./ssrf.js";

interface WebhookRow {
  id: string;
  user_id: string;
  url: string;
  secret_ciphertext: string;
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000] as const;

export async function dispatchWebhook(userId: string, eventType: string, payload: unknown): Promise<void> {
  const hooks = await query<WebhookRow>(
    "SELECT id, user_id, url, secret_ciphertext FROM partner_webhooks WHERE user_id = $1 AND active = true AND $2 = ANY(event_types)",
    [userId, eventType],
  );

  for (const hook of hooks.rows) {
    void deliverWithRetries(hook, eventType, payload);
  }
}

async function deliverWithRetries(hook: WebhookRow, eventType: string, payload: unknown): Promise<void> {
  const body = JSON.stringify({
    event: eventType,
    ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { data: payload }),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = decryptWebhookSecret(hook.secret_ciphertext);
  const signature = signWebhookPayload(secret, body, timestamp);
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      await assertWebhookUrlSafe(hook.url);
      const response = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Crucible-Timestamp": String(timestamp),
          "X-Crucible-Signature": signature,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      lastStatus = response.status;
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(RETRY_DELAYS_MS[attempt]);
  }

  await query(
    "INSERT INTO webhook_dead_letters (webhook_id, user_id, event_type, payload, last_status, last_error, attempts) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
    [hook.id, hook.user_id, eventType, body, lastStatus, lastError, RETRY_DELAYS_MS.length],
  );
}

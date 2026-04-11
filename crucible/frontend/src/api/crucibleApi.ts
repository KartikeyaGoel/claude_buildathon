import type { ConfirmFramingBody, CreateSessionBody } from "@crucible/shared";

/** API origin without trailing slash. Empty string = same origin (Vite proxy). */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

function url(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function createSession(body: CreateSessionBody): Promise<{ sessionId: string }> {
  const res = await fetch(url("/api/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `createSession failed: ${res.status}`);
  }
  return res.json() as Promise<{ sessionId: string }>;
}

export async function confirmFraming(sessionId: string, body: ConfirmFramingBody): Promise<void> {
  const res = await fetch(url(`/api/sessions/${encodeURIComponent(sessionId)}/confirm-framing`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `confirmFraming failed: ${res.status}`);
  }
}

export async function cancelSession(sessionId: string): Promise<void> {
  const res = await fetch(url(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`), {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `cancelSession failed: ${res.status}`);
  }
}

export function getSessionStreamPath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
}

export function getSessionStreamAbsoluteUrl(sessionId: string): string {
  const path = getSessionStreamPath(sessionId);
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path}`;
}

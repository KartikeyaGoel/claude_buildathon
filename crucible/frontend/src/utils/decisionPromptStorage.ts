/** Persist the user's decision text for the session route (refresh-safe). */

export function decisionPromptStorageKey(sessionId: string): string {
  return `crucible:decision:${sessionId}`;
}

export function readStoredDecisionPrompt(sessionId: string): string | null {
  try {
    return sessionStorage.getItem(decisionPromptStorageKey(sessionId));
  } catch {
    return null;
  }
}

export function writeStoredDecisionPrompt(sessionId: string, text: string): void {
  try {
    sessionStorage.setItem(decisionPromptStorageKey(sessionId), text);
  } catch {
    /* ignore quota / private mode */
  }
}

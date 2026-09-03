/**
 * Display helpers for resolved mentions in the chat thread.
 */

import type { Mention } from "./mentions";

/** Trim a mention token (e.g. "@src/index.ts") down to a friendly label. */
export function resolveMentionLabel(token: string): string {
  const raw = token.replace(/^@/, "");
  if (raw.startsWith("/")) return raw;
  return raw;
}

/** Pick a stable chip text for a mention. Falls back to the raw token. */
export function mentionChipLabel(m: Mention): string {
  return m.label;
}

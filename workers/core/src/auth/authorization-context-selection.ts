/**
 * Request-scoped bridge for the OAuth post-login authorization-context
 * selection.
 *
 * Better Auth's `postLogin.shouldRedirect` callback receives the request
 * headers (and thus the `x-id-oauth-context` selection), but the
 * `consentReferenceId` callback that runs immediately after — in the SAME
 * `/oauth2/continue` request — receives only `{ user, session, scopes }`. The
 * two were bridged through Workers KV, but KV is eventually consistent: a `put`
 * in `shouldRedirect` is not reliably visible to the `get` in
 * `consentReferenceId` within the same request, so the selection read back as
 * `null` and the authorize flow failed with "OAuth authorization context was
 * not selected". This surfaced the moment the content admin became the first
 * OIDC consumer to exercise post-login context selection.
 *
 * Because both callbacks run in the same request — therefore the same Worker
 * isolate — a small in-isolate map keyed by session id gives a synchronous,
 * reliable read-after-write. KV remains the durable fallback for any cross-
 * isolate read. Entries are short-lived and pruned on every access so the
 * module-level map cannot grow unbounded across requests in a warm isolate.
 */

import { CONTEXT_SELECTION_CACHE_TTL_MS } from "./config";

interface CachedSelection {
  readonly value: string;
  readonly storedAtMs: number;
}

const selectionBySession = new Map<string, CachedSelection>();

function pruneExpired(nowMs: number): void {
  for (const [sessionId, entry] of selectionBySession) {
    if (nowMs - entry.storedAtMs > CONTEXT_SELECTION_CACHE_TTL_MS) {
      selectionBySession.delete(sessionId);
    }
  }
}

/** Records the context selection for a session so the same-request consent step can read it back. */
export function rememberContextSelection(
  sessionId: string,
  value: string,
  nowMs: number,
): void {
  pruneExpired(nowMs);
  selectionBySession.set(sessionId, { value, storedAtMs: nowMs });
}

/** Returns the recorded context selection for a session, or `undefined` when absent or expired. */
export function recallContextSelection(
  sessionId: string,
  nowMs: number,
): string | undefined {
  pruneExpired(nowMs);
  const entry = selectionBySession.get(sessionId);
  if (!entry) return undefined;
  if (nowMs - entry.storedAtMs > CONTEXT_SELECTION_CACHE_TTL_MS) {
    selectionBySession.delete(sessionId);
    return undefined;
  }
  return entry.value;
}

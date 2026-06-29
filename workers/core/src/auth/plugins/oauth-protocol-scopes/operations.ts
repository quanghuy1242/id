/**
 * Pure scope-merge helpers for the `id-oauth-protocol-scopes` plugin. Kept free
 * of Better Auth so the merge rule is unit-testable in isolation; `index.ts`
 * owns the request-flow wiring.
 */

/**
 * Reads a scope value that may arrive as an RFC 7591 space-delimited string
 * (the `/oauth2/create-client` body's `scope`) or as a string array (the
 * `/oauth2/update-client` body's `update.scopes`). Returns the trimmed,
 * non-empty scope tokens; any other shape yields an empty list.
 */
export function parseScopeValue(value: unknown): readonly string[] {
  const tokens =
    typeof value === "string"
      ? value.split(" ")
      : Array.isArray(value)
        ? value.filter((token): token is string => typeof token === "string")
        : [];
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Folds the always-available OIDC protocol scopes into a client's requested
 * scope set, leading with the protocol scopes and removing duplicates. Better
 * Auth validates an `/oauth2/authorize` request against the client's own stored
 * `scopes` (falling back to the provider's global set only when the client has
 * none), so a client registered with resource scopes alone would be rejected
 * for the universal `openid`/`profile`/`email`/`offline_access` scopes unless
 * they are merged in at registration time.
 */
export function withProtocolScopes(
  requested: readonly string[],
  protocolScopes: readonly string[],
): readonly string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const scope of [...protocolScopes, ...requested]) {
    if (seen.has(scope)) continue;
    seen.add(scope);
    merged.push(scope);
  }
  return merged;
}

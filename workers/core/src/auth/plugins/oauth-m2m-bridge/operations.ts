import type { OAuthClientRow } from "./types";

/**
 * Parses a Better Auth `oauthClient.grantTypes` column value (string[], JSON
 * string, or space-separated string) and tests for membership. Lives here so the
 * `hooks.before` handler in `index.ts` stays focused on the request flow.
 */
export function clientHasGrantType(client: OAuthClientRow, grantType: string): boolean {
  const raw = client.grantTypes;
  if (Array.isArray(raw)) return raw.includes(grantType);
  if (typeof raw !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.includes(grantType);
    if (typeof parsed === "string") return parsed === grantType || parsed.split(" ").includes(grantType);
  } catch {
    return raw.split(/[\s,]+/u).includes(grantType);
  }
  return false;
}

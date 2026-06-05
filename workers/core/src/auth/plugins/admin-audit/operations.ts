/**
 * Pure operation helpers for the admin-audit plugin.
 *
 * Framework-light by design: no Better Auth request context, no Drizzle. The
 * endpoint handlers in `index.ts` read rows through the adapter and pass them
 * here for normalization, secret-stripping, and display enrichment so this
 * logic stays unit-testable without a live auth context.
 */
import {
  ADMIN_AUDIT_DEFAULT_PAGE_LIMIT,
  ADMIN_AUDIT_MAX_PAGE_LIMIT,
  ADMIN_AUDIT_TOKEN_PREFIX_LENGTH,
} from "../../config";
import type {
  ConsentRow,
  JwksRow,
  PageParams,
  PresentedConsent,
  PresentedJwk,
  PresentedSession,
  PresentedToken,
  SessionRow,
  TokenRow,
} from "./schema";

/**
 * Normalizes a timestamp that the adapter may hand back as a `Date`
 * (`timestamp_ms` columns), an epoch-ms `number`, or an ISO string. Returns
 * epoch milliseconds, or `null` when the value is absent/unparseable.
 */
export function toMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Clamps caller-supplied `limit`/`offset` query values into a safe page window. */
export function parsePageParams(
  query: { limit?: unknown; offset?: unknown } | undefined,
): PageParams {
  const rawLimit = Number(query?.limit);
  const rawOffset = Number(query?.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), ADMIN_AUDIT_MAX_PAGE_LIMIT)
      : ADMIN_AUDIT_DEFAULT_PAGE_LIMIT;
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/**
 * Builds a short, non-reversible display prefix for a token. Never returns the
 * full token value. Falls back to the row id when the token column is null
 * (access tokens are nullable in storage).
 */
export function tokenPrefix(
  token: string | null | undefined,
  id: string,
): string {
  const source = token && token.length > 0 ? token : id;
  return `${source.slice(0, ADMIN_AUDIT_TOKEN_PREFIX_LENGTH)}…`;
}

/** Parses the stored public-key JSON into a JWK object; returns `{}` on failure. */
export function parsePublicJwk(publicKey: unknown): Record<string, unknown> {
  if (typeof publicKey !== "string") {
    return publicKey && typeof publicKey === "object"
      ? (publicKey as Record<string, unknown>)
      : {};
  }
  try {
    const parsed = JSON.parse(publicKey) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Derives the key lifecycle status from `expiresAt` and the configured grace
 * window. A key with no expiry, or one not yet expired, is `active`. An expired
 * key still inside the grace window is `rotated`; past the grace window it is
 * `expired`.
 */
export function deriveJwkStatus(
  expiresAtMs: number | null,
  nowMs: number,
  graceMs: number,
): "active" | "rotated" | "expired" {
  if (expiresAtMs === null || nowMs < expiresAtMs) return "active";
  if (nowMs < expiresAtMs + graceMs) return "rotated";
  return "expired";
}

/** Collects the unique, defined values of one field across rows (for `in` enrichment). */
export function uniqueIds<T>(
  rows: readonly T[],
  pick: (row: T) => string | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const id = pick(row);
    if (id) set.add(id);
  }
  return [...set];
}

export function presentSession(
  row: SessionRow,
  emailByUserId: Map<string, string>,
): PresentedSession {
  // Do not return row.token here. Session tokens are bearer material; callers revoke by session id and the plugin resolves the token server-side.
  return {
    id: row.id,
    userId: row.userId,
    userEmail: emailByUserId.get(row.userId) ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    activeOrganizationId: row.activeOrganizationId ?? null,
    activeTeamId: row.activeTeamId ?? null,
    impersonatedBy: row.impersonatedBy ?? null,
    createdAt: toMs(row.createdAt),
    expiresAt: toMs(row.expiresAt),
  };
}

export function presentToken(
  row: TokenRow,
  type: "access" | "refresh",
  emailByUserId: Map<string, string>,
  nameByClientId: Map<string, string>,
): PresentedToken {
  return {
    id: row.id,
    tokenPrefix: tokenPrefix(row.token, row.id),
    type,
    clientId: row.clientId,
    clientName: nameByClientId.get(row.clientId) ?? null,
    userId: row.userId ?? null,
    userEmail: row.userId ? (emailByUserId.get(row.userId) ?? null) : null,
    scopes: normalizeScopes(row.scopes),
    expiresAt: toMs(row.expiresAt),
    createdAt: toMs(row.createdAt),
  };
}

export function presentConsent(
  row: ConsentRow,
  emailByUserId: Map<string, string>,
  nameByClientId: Map<string, string>,
): PresentedConsent {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: nameByClientId.get(row.clientId) ?? null,
    userId: row.userId ?? null,
    userEmail: row.userId ? (emailByUserId.get(row.userId) ?? null) : null,
    scopes: normalizeScopes(row.scopes),
    createdAt: toMs(row.createdAt),
    updatedAt: toMs(row.updatedAt),
  };
}

export function presentJwk(
  row: JwksRow,
  nowMs: number,
  graceMs: number,
): PresentedJwk {
  const publicJwk = parsePublicJwk(row.publicKey);
  const expiresAt = toMs(row.expiresAt);
  return {
    id: row.id,
    alg: typeof publicJwk.alg === "string" ? publicJwk.alg : "EdDSA",
    createdAt: toMs(row.createdAt),
    expiresAt,
    status: deriveJwkStatus(expiresAt, nowMs, graceMs),
    publicJwk,
    // NOTE: privateKey is intentionally never read or returned here.
  };
}

/** Scopes are stored as a JSON array; tolerate a space-delimited string fallback. */
export function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) return scopes.map(String);
  if (typeof scopes === "string") return scopes.split(/[\s,]+/).filter(Boolean);
  return [];
}

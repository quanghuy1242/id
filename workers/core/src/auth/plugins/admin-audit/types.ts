/**
 * Plugin integration types for admin-audit.
 *
 * Schema/response shapes live in `schema.ts`; this file owns the runtime hooks
 * injected by `get-auth.ts` (the authorization predicate and the JWKS grace
 * window used to derive key status). Keeping config out of the UI honors the
 * remote-config rule — the grace window is sourced from `auth/config.ts`.
 */

/** Options accepted by the `idAdminAudit` BA plugin factory. */
export type AdminAuditPluginOptions = {
  /**
   * Returns whether the acting session role may read the platform-wide audit
   * surfaces (sessions, tokens, consents, JWKS metadata). v1 is platform-admin
   * only (docs/026 §8); org-scoped variants are deferred.
   */
  readonly authorize?: (role: string | null | undefined) => boolean;
  /** JWKS grace window in milliseconds, used to derive the rotated/expired status. */
  readonly jwksGracePeriodMs?: number;
};

/** Minimal adapter surface used by the read-only audit endpoints. */
export type AuditAdapter = {
  create: <T>(params: {
    model: string;
    data: Record<string, unknown>;
  }) => Promise<T>;
  findOne: <T>(params: {
    model: string;
    where: Array<{ field: string; value: unknown }>;
  }) => Promise<T | null>;
  findMany: <T>(params: {
    model: string;
    where?: Array<{ field: string; value: unknown; operator?: string }>;
    limit?: number;
    offset?: number;
    sortBy?: { field: string; direction: "asc" | "desc" };
  }) => Promise<T[]>;
  count: (params: {
    model: string;
    where?: Array<{ field: string; value: unknown; operator?: string }>;
  }) => Promise<number | string>;
  delete: (params: {
    model: string;
    where: Array<{ field: string; value: unknown }>;
  }) => Promise<unknown>;
};

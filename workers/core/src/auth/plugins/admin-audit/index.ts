import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  SESSION_MODEL,
  USER_MODEL,
  OAUTH_CLIENT_MODEL,
  OAUTH_ACCESS_TOKEN_MODEL,
  OAUTH_REFRESH_TOKEN_MODEL,
  OAUTH_CONSENT_MODEL,
  JWKS_MODEL,
} from "../../../shared/constants";
import type { AdminAuditPluginOptions, AuditAdapter } from "./types";
import {
  parsePageParams,
  presentConsent,
  presentJwk,
  presentSession,
  presentToken,
  uniqueIds,
} from "./operations";
import {
  adminAuditEndpointMeta,
  listConsentsOpenApiSchema,
  listSessionsOpenApiSchema,
  listTokensOpenApiSchema,
  jwksOpenApiSchema,
  revokeConsentBody,
  revokeConsentOpenApiRequestBody,
  revokeConsentOpenApiSchema,
  type ConsentRow,
  type JwksRow,
  type SessionRow,
  type TokenRow,
} from "./schema";

import { JWKS_GRACE_PERIOD_MS } from "../../config";

export type { AdminAuditPluginOptions } from "./types";

type UserRow = { id: string; email?: string | null };
type ClientRow = { clientId: string; name?: string | null };

/**
 * Narrows `ctx.context.adapter` to the minimal read surface this plugin needs.
 * Better Auth does not export a precise adapter type at the endpoint-context
 * level, so this mirrors the established `as unknown as` pattern used by
 * oauth-m2m-bridge; centralizing it here keeps the cast in one place.
 */
function auditAdapter(ctx: { context: { adapter: unknown } }): AuditAdapter {
  return ctx.context.adapter as unknown as AuditAdapter;
}

/** Asserts an authenticated platform-admin session. */
function requireAdmin(
  authorize: AdminAuditPluginOptions["authorize"],
  session: { user: unknown } | null,
): void {
  if (!session) throw new APIError("UNAUTHORIZED");
  const role = (session.user as { role?: string | null } | null)?.role;
  if (!authorize || !authorize(role)) throw new APIError("FORBIDDEN");
}

/** Loads a `userId -> email` map for the referenced users in one batched `in` query. */
async function emailMap(adapter: AuditAdapter, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await adapter.findMany<UserRow>({
    model: USER_MODEL,
    where: [{ field: "id", value: userIds, operator: "in" }],
  });
  const map = new Map<string, string>();
  for (const u of users) if (u.email) map.set(u.id, u.email);
  return map;
}

/** Loads a `clientId -> name` map for the referenced clients in one batched `in` query. */
async function clientNameMap(adapter: AuditAdapter, clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();
  const clients = await adapter.findMany<ClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [{ field: "clientId", value: clientIds, operator: "in" }],
  });
  const map = new Map<string, string>();
  for (const c of clients) if (c.name) map.set(c.clientId, c.name);
  return map;
}

const listSessionsMeta = adminAuditEndpointMeta({
  description: "List all active browser sessions across all users (platform admin only)",
  pagination: true,
  responseSchema: listSessionsOpenApiSchema,
  responseDescription: "Paginated session list with batched user-email enrichment",
});

const listTokensMeta = adminAuditEndpointMeta({
  description: "List OAuth access or refresh tokens across all clients (platform admin only); token values are never returned",
  pagination: true,
  extraParameters: [
    { name: "type", in: "query", required: false, schema: { type: "string", enum: ["access", "refresh"] }, description: "Token table to read (default access)" },
  ],
  responseSchema: listTokensOpenApiSchema,
  responseDescription: "Paginated token list (prefix only) with client/user enrichment",
});

const listConsentsMeta = adminAuditEndpointMeta({
  description: "List OAuth consent grants across all users (platform admin only)",
  pagination: true,
  extraParameters: [
    { name: "clientId", in: "query", required: false, schema: { type: "string" }, description: "Filter to a single client" },
  ],
  responseSchema: listConsentsOpenApiSchema,
  responseDescription: "Paginated consent list with client/user enrichment",
});

const revokeConsentMeta = adminAuditEndpointMeta({
  description: "Revoke a single OAuth consent grant, forcing re-consent (platform admin only)",
  requestBody: revokeConsentOpenApiRequestBody,
  responseSchema: revokeConsentOpenApiSchema,
  responseDescription: "Consent revoked",
});

const jwksMeta = adminAuditEndpointMeta({
  description: "List JWKS key metadata with timestamps and lifecycle status (platform admin only); the private key is never returned",
  responseSchema: jwksOpenApiSchema,
  responseDescription: "Public JWK material plus createdAt/expiresAt/status per key",
});

/**
 * Read-only admin reporting plugin over Better-Auth-owned tables.
 *
 * Owns no schema — it reads `session`, `oauthAccessToken`, `oauthRefreshToken`,
 * `oauthConsent`, `jwks` (and enriches via `user`/`oauthClient`) exclusively
 * through the adapter. Pagination totals come from `adapter.count` over the same
 * predicate; display fields are enriched by batched `in` lookups, never joins.
 * Presenters strip every secret: token values and the JWKS private key are
 * never serialized. See docs/026.
 */
export const idAdminAudit = (options: AdminAuditPluginOptions = {}): BetterAuthPlugin => {
  const graceMs = options.jwksGracePeriodMs ?? JWKS_GRACE_PERIOD_MS;

  return {
    id: "id-admin-audit",
    endpoints: {
      listAdminSessions: createAuthEndpoint(
        "/admin/list-sessions",
        { method: "GET", use: [sessionMiddleware], metadata: listSessionsMeta },
        async (ctx) => {
          requireAdmin(options.authorize, ctx.context.session);
          const adapter = auditAdapter(ctx);
          const { limit, offset } = parsePageParams(ctx.query);

          const total = Number(await adapter.count({ model: SESSION_MODEL }));
          const rows = await adapter.findMany<SessionRow>({
            model: SESSION_MODEL,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const emails = await emailMap(adapter, uniqueIds(rows, (r) => r.userId));
          return ctx.json({ sessions: rows.map((r) => presentSession(r, emails)), total, limit, offset });
        },
      ),

      listAdminTokens: createAuthEndpoint(
        "/admin/list-tokens",
        { method: "GET", use: [sessionMiddleware], metadata: listTokensMeta },
        async (ctx) => {
          requireAdmin(options.authorize, ctx.context.session);
          const adapter = auditAdapter(ctx);
          const { limit, offset } = parsePageParams(ctx.query);
          const type = ctx.query?.type === "refresh" ? "refresh" : "access";
          const model = type === "refresh" ? OAUTH_REFRESH_TOKEN_MODEL : OAUTH_ACCESS_TOKEN_MODEL;

          const total = Number(await adapter.count({ model }));
          const rows = await adapter.findMany<TokenRow>({
            model,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const [emails, clients] = await Promise.all([
            emailMap(adapter, uniqueIds(rows, (r) => r.userId)),
            clientNameMap(adapter, uniqueIds(rows, (r) => r.clientId)),
          ]);
          return ctx.json({ tokens: rows.map((r) => presentToken(r, type, emails, clients)), total, limit, offset });
        },
      ),

      listAdminConsents: createAuthEndpoint(
        "/admin/list-consents",
        { method: "GET", use: [sessionMiddleware], metadata: listConsentsMeta },
        async (ctx) => {
          requireAdmin(options.authorize, ctx.context.session);
          const adapter = auditAdapter(ctx);
          const { limit, offset } = parsePageParams(ctx.query);
          const clientId = typeof ctx.query?.clientId === "string" && ctx.query.clientId ? ctx.query.clientId : undefined;
          const where = clientId ? [{ field: "clientId", value: clientId }] : undefined;

          const total = Number(await adapter.count({ model: OAUTH_CONSENT_MODEL, where }));
          const rows = await adapter.findMany<ConsentRow>({
            model: OAUTH_CONSENT_MODEL,
            where,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const [emails, clients] = await Promise.all([
            emailMap(adapter, uniqueIds(rows, (r) => r.userId)),
            clientNameMap(adapter, uniqueIds(rows, (r) => r.clientId)),
          ]);
          return ctx.json({ consents: rows.map((r) => presentConsent(r, emails, clients)), total, limit, offset });
        },
      ),

      revokeAdminConsent: createAuthEndpoint(
        "/admin/revoke-consent",
        { method: "POST", use: [sessionMiddleware], body: revokeConsentBody, metadata: revokeConsentMeta },
        async (ctx) => {
          requireAdmin(options.authorize, ctx.context.session);
          const adapter = auditAdapter(ctx);
          await adapter.delete({
            model: OAUTH_CONSENT_MODEL,
            where: [
              { field: "clientId", value: ctx.body.clientId },
              { field: "userId", value: ctx.body.userId },
            ],
          });
          return ctx.json({ success: true });
        },
      ),

      listAdminJwks: createAuthEndpoint(
        "/admin/jwks",
        { method: "GET", use: [sessionMiddleware], metadata: jwksMeta },
        async (ctx) => {
          requireAdmin(options.authorize, ctx.context.session);
          const adapter = auditAdapter(ctx);
          const rows = await adapter.findMany<JwksRow>({
            model: JWKS_MODEL,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const now = Date.now();
          return ctx.json({ keys: rows.map((r) => presentJwk(r, now, graceMs)) });
        },
      ),
    },
  };
};

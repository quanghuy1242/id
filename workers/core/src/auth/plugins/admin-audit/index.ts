import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { createJwk } from "better-auth/plugins/jwt";
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
  type ClientRow,
  jwksOpenApiSchema,
  revokeConsentBody,
  revokeConsentOpenApiRequestBody,
  revokeSessionBody,
  revokeSessionOpenApiRequestBody,
  rotateJwksBody,
  rotateJwksOpenApiRequestBody,
  rotateJwksOpenApiSchema,
  successOpenApiSchema,
  type ConsentRow,
  type JwksRow,
  type RotateJwksResponse,
  type SessionRow,
  type TokenRow,
} from "./schema";

import {
  JWKS_GRACE_PERIOD_MS,
  JWKS_ROTATION_INTERVAL_SECONDS,
  isActionStepUpFresh,
} from "../../config";

export type { AdminAuditPluginOptions } from "./types";

type UserRow = { id: string; email?: string | null };
type SessionUser = { id: string; role?: string | null };
type AuditSession = {
  readonly session?: { readonly platformStepUpAt?: number | null };
  readonly user?: unknown;
};
type InternalSessionAdapter = {
  readonly deleteSession: (sessionToken: string) => Promise<unknown>;
};

/**
 * Narrows `ctx.context.adapter` to the minimal read surface this plugin needs.
 * Better Auth does not export a precise adapter type at the endpoint-context
 * level, so this mirrors the established `as unknown as` pattern used by
 * oauth-m2m-bridge; centralizing it here keeps the cast in one place.
 */
function auditAdapter(ctx: { context: { adapter: unknown } }): AuditAdapter {
  return ctx.context.adapter as unknown as AuditAdapter;
}

function internalSessionAdapter(ctx: {
  context: { internalAdapter: unknown };
}): InternalSessionAdapter {
  return ctx.context.internalAdapter as InternalSessionAdapter;
}

function sessionUser(session: { user: unknown } | null): SessionUser {
  const user = session?.user as SessionUser | null | undefined;
  if (!user?.id) throw new APIError("UNAUTHORIZED");
  return user;
}

async function requireAuditAccess(
  authorize: AdminAuditPluginOptions["authorize"],
  adapter: AuditAdapter,
  session: { user: unknown } | null,
  organizationId: string | null | undefined,
): Promise<SessionUser> {
  const user = sessionUser(session);
  if (!authorize) throw new APIError("FORBIDDEN");
  const allowed = await authorize(organizationId, user.id, user.role, adapter);
  if (!allowed) throw new APIError("FORBIDDEN");
  return user;
}

function requireFreshActionStepUp(session: AuditSession | null): void {
  if (!isActionStepUpFresh(session?.session?.platformStepUpAt ?? null)) {
    throw new APIError("FORBIDDEN", {
      code: "platform_action_step_up_required",
      message: "Fresh platform verification is required for this action",
    });
  }
}

/** Loads a `userId -> email` map for the referenced users in one batched `in` query. */
async function emailMap(
  adapter: AuditAdapter,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await adapter.findMany<UserRow>({
    model: USER_MODEL,
    where: [{ field: "id", value: userIds, operator: "in" }],
  });
  const map = new Map<string, string>();
  for (const u of users) if (u.email) map.set(u.id, u.email);
  return map;
}

function queryString(
  query: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = query?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function organizationClientRows(
  adapter: AuditAdapter,
  organizationId: string,
): Promise<ClientRow[]> {
  return adapter.findMany<ClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [{ field: "referenceId", value: organizationId }],
  });
}

async function requireClientOwnedByOrganization(
  adapter: AuditAdapter,
  clientId: string,
  organizationId: string,
): Promise<void> {
  const client = await adapter.findOne<ClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [
      { field: "clientId", value: clientId },
      { field: "referenceId", value: organizationId },
    ],
  });
  if (!client) throw new APIError("NOT_FOUND");
}

function consentWhere(
  organizationClientIds: readonly string[] | undefined,
  clientId: string | undefined,
): Array<{ field: string; value: unknown; operator?: string }> | undefined {
  if (organizationClientIds !== undefined) {
    if (clientId) return [{ field: "clientId", value: clientId }];
    return [
      { field: "clientId", value: organizationClientIds, operator: "in" },
    ];
  }
  return clientId ? [{ field: "clientId", value: clientId }] : undefined;
}

/** Loads a `clientId -> name` map for the referenced clients in one batched `in` query. */
async function clientNameMap(
  adapter: AuditAdapter,
  clientIds: string[],
): Promise<Map<string, string>> {
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
  description:
    "List browser sessions without session tokens (platform admin only)",
  pagination: true,
  extraParameters: [
    {
      name: "userId",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Filter to one user",
    },
  ],
  responseSchema: listSessionsOpenApiSchema,
  responseDescription:
    "Paginated session list with batched user-email enrichment; session tokens are never returned",
});

const listTokensMeta = adminAuditEndpointMeta({
  description:
    "List OAuth access or refresh tokens across all clients (platform admin only); token values are never returned",
  pagination: true,
  extraParameters: [
    {
      name: "type",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["access", "refresh"] },
      description: "Token table to read (default access)",
    },
  ],
  responseSchema: listTokensOpenApiSchema,
  responseDescription:
    "Paginated token list (prefix only) with client/user enrichment",
});

const listConsentsMeta = adminAuditEndpointMeta({
  description:
    "List OAuth consent grants across all users or for one organization-owned client set",
  pagination: true,
  extraParameters: [
    {
      name: "clientId",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Filter to a single client",
    },
    {
      name: "organizationId",
      in: "query",
      required: false,
      schema: { type: "string" },
      description:
        "Limit results to consent grants for clients owned by this organization",
    },
  ],
  responseSchema: listConsentsOpenApiSchema,
  responseDescription: "Paginated consent list with client/user enrichment",
});

const revokeConsentMeta = adminAuditEndpointMeta({
  description:
    "Revoke a single OAuth consent grant, forcing re-consent (platform admin only)",
  requestBody: revokeConsentOpenApiRequestBody,
  responseSchema: successOpenApiSchema,
  responseDescription: "Consent revoked",
});

const revokeSessionMeta = adminAuditEndpointMeta({
  description:
    "Revoke one browser session by id without exposing the session token to the caller (platform admin only)",
  requestBody: revokeSessionOpenApiRequestBody,
  responseSchema: successOpenApiSchema,
  responseDescription: "Session revoked",
});

const jwksMeta = adminAuditEndpointMeta({
  description:
    "List JWKS key metadata with timestamps and lifecycle status (platform admin only); the private key is never returned",
  responseSchema: jwksOpenApiSchema,
  responseDescription:
    "Public JWK material plus createdAt/expiresAt/status per key",
});

const rotateJwksMeta = adminAuditEndpointMeta({
  description:
    "Emergency-rotate signing keys by creating and promoting a new JWKS key (platform admin only)",
  requestBody: rotateJwksOpenApiRequestBody,
  responseSchema: rotateJwksOpenApiSchema,
  responseDescription: "New public JWKS key metadata",
});

async function createSigningJwk(
  ctx: Parameters<typeof createJwk>[0],
): Promise<JwksRow> {
  const row = await createJwk(ctx, {
    jwks: {
      rotationInterval: JWKS_ROTATION_INTERVAL_SECONDS,
      keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
    },
  });
  return row as JwksRow;
}

/**
 * Read-only admin reporting plugin over Better-Auth-owned tables.
 *
 * Owns no schema — it reads `session`, `oauthAccessToken`, `oauthRefreshToken`,
 * `oauthConsent`, `jwks` (and enriches via `user`/`oauthClient`) exclusively
 * through the adapter. Pagination totals come from `adapter.count` over the same
 * predicate; display fields are enriched by batched `in` lookups, never joins.
 * Presenters strip every secret: token values and the JWKS private key are
 * never serialized. See docs/026.
 *
 * Do not switch session revocation back to Better Auth's public
 * `/admin/revoke-user-session` contract from UI code: that route requires the
 * session token. This plugin intentionally accepts `sessionId`, resolves the
 * token inside the auth worker, and deletes it server-side.
 */
export const idAdminAudit = (
  options: AdminAuditPluginOptions = {},
): BetterAuthPlugin => {
  const graceMs = options.jwksGracePeriodMs ?? JWKS_GRACE_PERIOD_MS;

  return {
    id: "id-admin-audit",
    endpoints: {
      listAdminSessions: createAuthEndpoint(
        "/admin/list-sessions",
        { method: "GET", use: [sessionMiddleware], metadata: listSessionsMeta },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            null,
          );
          const { limit, offset } = parsePageParams(ctx.query);
          const userId =
            typeof ctx.query?.userId === "string" && ctx.query.userId
              ? ctx.query.userId
              : undefined;
          const where = userId
            ? [{ field: "userId", value: userId }]
            : undefined;

          const total = Number(
            await adapter.count({ model: SESSION_MODEL, where }),
          );
          const rows = await adapter.findMany<SessionRow>({
            model: SESSION_MODEL,
            where,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const emails = await emailMap(
            adapter,
            uniqueIds(rows, (r) => r.userId),
          );
          return ctx.json({
            sessions: rows.map((r) => presentSession(r, emails)),
            total,
            limit,
            offset,
          });
        },
      ),

      revokeAdminSession: createAuthEndpoint(
        "/admin/revoke-session",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: revokeSessionBody,
          metadata: revokeSessionMeta,
        },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            null,
          );
          const row = await adapter.findOne<SessionRow>({
            model: SESSION_MODEL,
            where: [{ field: "id", value: ctx.body.sessionId }],
          });
          if (!row) throw new APIError("NOT_FOUND");

          await internalSessionAdapter(ctx).deleteSession(row.token);
          return ctx.json({ success: true });
        },
      ),

      listAdminTokens: createAuthEndpoint(
        "/admin/list-tokens",
        { method: "GET", use: [sessionMiddleware], metadata: listTokensMeta },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            null,
          );
          const { limit, offset } = parsePageParams(ctx.query);
          const type = ctx.query?.type === "refresh" ? "refresh" : "access";
          const model =
            type === "refresh"
              ? OAUTH_REFRESH_TOKEN_MODEL
              : OAUTH_ACCESS_TOKEN_MODEL;

          const total = Number(await adapter.count({ model }));
          const rows = await adapter.findMany<TokenRow>({
            model,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const [emails, clients] = await Promise.all([
            emailMap(
              adapter,
              uniqueIds(rows, (r) => r.userId),
            ),
            clientNameMap(
              adapter,
              uniqueIds(rows, (r) => r.clientId),
            ),
          ]);
          return ctx.json({
            tokens: rows.map((r) => presentToken(r, type, emails, clients)),
            total,
            limit,
            offset,
          });
        },
      ),

      listAdminConsents: createAuthEndpoint(
        "/admin/list-consents",
        { method: "GET", use: [sessionMiddleware], metadata: listConsentsMeta },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          const organizationId = queryString(ctx.query, "organizationId");
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            organizationId ?? null,
          );
          const { limit, offset } = parsePageParams(ctx.query);
          const clientId = queryString(ctx.query, "clientId");
          const organizationClients = organizationId
            ? await organizationClientRows(adapter, organizationId)
            : undefined;
          const organizationClientIds = organizationClients?.map(
            (client) => client.clientId,
          );

          if (
            organizationClientIds !== undefined &&
            (organizationClientIds.length === 0 ||
              (clientId && !organizationClientIds.includes(clientId)))
          ) {
            return ctx.json({ consents: [], total: 0, limit, offset });
          }

          const where = consentWhere(organizationClientIds, clientId);

          const total = Number(
            await adapter.count({ model: OAUTH_CONSENT_MODEL, where }),
          );
          const rows = await adapter.findMany<ConsentRow>({
            model: OAUTH_CONSENT_MODEL,
            where,
            limit,
            offset,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const [emails, clients] = await Promise.all([
            emailMap(
              adapter,
              uniqueIds(rows, (r) => r.userId),
            ),
            clientNameMap(
              adapter,
              uniqueIds(rows, (r) => r.clientId),
            ),
          ]);
          return ctx.json({
            consents: rows.map((r) => presentConsent(r, emails, clients)),
            total,
            limit,
            offset,
          });
        },
      ),

      revokeAdminConsent: createAuthEndpoint(
        "/admin/revoke-consent",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: revokeConsentBody,
          metadata: revokeConsentMeta,
        },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            ctx.body.organizationId ?? null,
          );
          if (ctx.body.organizationId) {
            await requireClientOwnedByOrganization(
              adapter,
              ctx.body.clientId,
              ctx.body.organizationId,
            );
          }
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
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            null,
          );
          const rows = await adapter.findMany<JwksRow>({
            model: JWKS_MODEL,
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const now = Date.now();
          return ctx.json({
            keys: rows.map((r) => presentJwk(r, now, graceMs)),
          });
        },
      ),

      rotateAdminJwks: createAuthEndpoint(
        "/admin/jwks/rotate",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: rotateJwksBody,
          metadata: rotateJwksMeta,
        },
        async (ctx) => {
          const adapter = auditAdapter(ctx);
          await requireAuditAccess(
            options.authorize,
            adapter,
            ctx.context.session,
            null,
          );
          requireFreshActionStepUp(ctx.context.session as AuditSession | null);
          const row = await createSigningJwk(ctx);
          const response: RotateJwksResponse = {
            ...presentJwk(row, Date.now(), graceMs),
            reason: ctx.body.reason,
          };
          return ctx.json(response);
        },
      ),
    },
  };
};

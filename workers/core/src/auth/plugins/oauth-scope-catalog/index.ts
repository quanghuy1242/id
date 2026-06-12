import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";
import {
  assertCatalogAccess,
  assertGrantScopesExist,
  assertClientResourceScopeAccess,
  assertUniqueClientResourceScope,
  assertUniqueResourceScope,
  buildCreateClientResourceScopePayload,
  buildCreateScopePayload,
  buildUpdateClientResourceScopePayload,
  buildUpdateScopePayload,
  ensureOAuthClientIdentityMirror,
  findResourceServerOrThrow,
} from "./operations";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import {
  createOAuthClientResourceScopeBody,
  createClientResourceScopeMetadata,
  createOAuthResourceScopeBody,
  createScopeMetadata,
  deleteClientResourceScopeMetadata,
  listClientResourceScopeMetadata,
  listScopeMetadata,
  oauthClientResourceScopeBetterAuthFields,
  oauthResourceScopeBetterAuthFields,
  presentOAuthClientResourceScope,
  presentOAuthResourceScope,
  updateOAuthClientResourceScopeBody,
  updateClientResourceScopeMetadata,
  updateOAuthResourceScopeBody,
  updateScopeMetadata,
  type OAuthClientResourceScopeRow,
  type OAuthResourceScopeRow,
} from "./schema";

export type { OAuthScopeCatalogPluginOptions } from "./types";

function adapterContext(adapter: unknown): AdapterContext {
  return adapter as AdapterContext;
}

function cloneOAuthResourceScope(
  row: ReturnType<typeof presentOAuthResourceScope>,
): ReturnType<typeof presentOAuthResourceScope> {
  return Object.assign({}, row);
}

function requestedOrganizationId(
  query: Record<string, unknown> | undefined,
): string | undefined {
  return typeof query?.organizationId === "string" && query.organizationId
    ? query.organizationId
    : undefined;
}

function queryString(
  query: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = query?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function queryNumber(
  query: Record<string, unknown> | undefined,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = queryString(query, field);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new APIError("BAD_REQUEST", {
      message: `${field} must be an integer between ${min} and ${max}`,
    });
  }
  return parsed;
}

function queryIds(
  query: Record<string, unknown> | undefined,
): readonly string[] | undefined {
  const value = queryString(query, "ids");
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function assertRequestedOrganization(
  ownerOrganizationId: string | null | undefined,
  requestedOwnerOrganizationId: string | undefined,
): void {
  if (
    requestedOwnerOrganizationId !== undefined &&
    ownerOrganizationId !== requestedOwnerOrganizationId
  ) {
    throw new APIError("NOT_FOUND");
  }
}

/** Better Auth plugin that owns resource-server-bound OAuth scopes and per-(client, resource) scope subsets. */
export const idOAuthScopeCatalog = (
  options: OAuthScopeCatalogPluginOptions = {},
): BetterAuthPlugin => ({
  id: "id-oauth-scope-catalog",
  schema: {
    oauthResourceScope: {
      fields: oauthResourceScopeBetterAuthFields,
    },
    oauthClientResourceScope: {
      fields: oauthClientResourceScopeBetterAuthFields,
    },
  },
  endpoints: {
    createOAuthResourceScope: createAuthEndpoint(
      "/admin/oauth-scopes",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createOAuthResourceScopeBody,
        metadata: createScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
        );
        assertRequestedOrganization(
          resourceServer.organizationId,
          requestedOrganizationId(ctx.query),
        );
        await assertCatalogAccess(
          options.authorize,
          resourceServer.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        await assertUniqueResourceScope(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
          ctx.body.scope,
        );

        const row = await ctx.context.adapter.create<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          data: buildCreateScopePayload(ctx.body, session.user.id),
        });
        await options.invalidateScopeCache?.();
        return ctx.json(presentOAuthResourceScope(row));
      },
    ),

    listOAuthResourceScopes: createAuthEndpoint(
      "/admin/oauth-scopes",
      { method: "GET", use: [sessionMiddleware], metadata: listScopeMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");
        const organizationId = requestedOrganizationId(ctx.query);

        await assertCatalogAccess(
          options.authorize,
          organizationId ?? null,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        const adapter = adapterContext(ctx.context.adapter);
        const where: Array<{
          field: string;
          value: unknown;
          operator?: string;
        }> = [];
        if (organizationId) {
          const resourceServers = await adapter.findMany<{
            readonly id: string;
          }>({
            model: RESOURCE_SERVER_MODEL,
            where: [{ field: "organizationId", value: organizationId }],
          });
          const resourceServerIds = resourceServers.map((row) => row.id);
          if (resourceServerIds.length === 0) {
            return ctx.json({
              oauthScopes: [],
              items: [],
              total: 0,
              limit: queryNumber(
                ctx.query,
                "limit",
                1,
                ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
              ),
              offset: queryNumber(
                ctx.query,
                "offset",
                0,
                Number.MAX_SAFE_INTEGER,
              ),
            });
          }
          where.push({
            field: "resourceServerId",
            value: resourceServerIds,
            operator: "in",
          });
        }
        const ids = queryIds(ctx.query);
        if (ids?.length) {
          const rows = await adapter.findMany<OAuthResourceScopeRow>({
            model: OAUTH_RESOURCE_SCOPE_MODEL,
            where: [...where, { field: "id", value: [...ids], operator: "in" }],
            sortBy: { field: "createdAt", direction: "desc" },
          });
          const items = rows.map((row) => presentOAuthResourceScope(row));
          return ctx.json({
            oauthScopes: items,
            items: items.map(cloneOAuthResourceScope),
          });
        }
        const q = queryString(ctx.query, "q");
        if (q) where.push({ field: "scope", value: q, operator: "contains" });
        const filters = where.length > 0 ? where : undefined;
        const limit = queryNumber(
          ctx.query,
          "limit",
          1,
          ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
        );
        const offset = queryNumber(
          ctx.query,
          "offset",
          0,
          Number.MAX_SAFE_INTEGER,
        );
        const total = Number(
          await adapter.count({
            model: OAUTH_RESOURCE_SCOPE_MODEL,
            where: filters,
          }),
        );
        const rows = await adapter.findMany<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          where: filters,
          limit,
          offset,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const items = rows.map((row) => presentOAuthResourceScope(row));
        return ctx.json({
          oauthScopes: items,
          items: items.map(cloneOAuthResourceScope),
          total,
          limit,
          offset,
        });
      },
    ),

    updateOAuthResourceScope: createAuthEndpoint(
      "/admin/oauth-scopes/:id",
      {
        method: "PATCH",
        use: [sessionMiddleware],
        body: updateOAuthResourceScopeBody,
        metadata: updateScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing =
          await ctx.context.adapter.findOne<OAuthResourceScopeRow>({
            model: OAUTH_RESOURCE_SCOPE_MODEL,
            where: [{ field: "id", value: ctx.params?.id }],
          });
        if (!existing) throw new APIError("NOT_FOUND");
        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          existing.resourceServerId,
        );
        assertRequestedOrganization(
          resourceServer.organizationId,
          requestedOrganizationId(ctx.query),
        );
        await assertCatalogAccess(
          options.authorize,
          resourceServer.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        if (ctx.body.scope) {
          await assertUniqueResourceScope(
            adapterContext(ctx.context.adapter),
            existing.resourceServerId,
            ctx.body.scope,
            existing.id,
          );
        }

        const row = await ctx.context.adapter.update<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdateScopePayload(
            ctx.body,
            existing.resourceServerId,
            session.user.id,
          ),
        });
        if (!row) throw new APIError("NOT_FOUND");
        await options.invalidateScopeCache?.();
        return ctx.json(presentOAuthResourceScope(row));
      },
    ),

    createOAuthClientResourceScope: createAuthEndpoint(
      "/admin/oauth-client-resource-scopes",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createOAuthClientResourceScopeBody,
        metadata: createClientResourceScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
        );
        await assertGrantScopesExist(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
          ctx.body.allowedScopes,
        );
        const client = await assertClientResourceScopeAccess(
          options,
          ctx,
          ctx.body.clientId,
        );
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(
          resourceServer.organizationId,
          organizationId,
        );
        if (resourceServer.organizationId !== (client.referenceId ?? null)) {
          throw new APIError("BAD_REQUEST", {
            message:
              "OAuth client and resource server must belong to the same authorization layer",
          });
        }
        await assertUniqueClientResourceScope(
          adapterContext(ctx.context.adapter),
          ctx.body,
        );
        await ensureOAuthClientIdentityMirror(
          adapterContext(ctx.context.adapter),
          client,
        );

        const row =
          await ctx.context.adapter.create<OAuthClientResourceScopeRow>({
            model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
            data: buildCreateClientResourceScopePayload(
              ctx.body,
              session.user.id,
            ),
          });
        await options.invalidateClientResourceScopeCache?.(ctx.body.clientId);
        return ctx.json(presentOAuthClientResourceScope(row));
      },
    ),

    listOAuthClientResourceScopes: createAuthEndpoint(
      "/admin/oauth-client-resource-scopes",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listClientResourceScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");
        const organizationId = requestedOrganizationId(ctx.query);

        const rows =
          await ctx.context.adapter.findMany<OAuthClientResourceScopeRow>({
            model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
            sortBy: { field: "createdAt", direction: "desc" },
          });
        const access = await Promise.all(
          rows.map(async (row) => {
            try {
              const client = await assertClientResourceScopeAccess(
                options,
                ctx,
                row.clientId,
              );
              const resourceServer = await findResourceServerOrThrow(
                adapterContext(ctx.context.adapter),
                row.resourceServerId,
              );
              if (
                organizationId !== undefined &&
                (client.referenceId !== organizationId ||
                  resourceServer.organizationId !== organizationId)
              ) {
                return { row, visible: false };
              }
              return { row, visible: true };
            } catch (error) {
              if (!(error instanceof APIError)) throw error;
              return { row, visible: false };
            }
          }),
        );
        const visible = access
          .filter((entry) => entry.visible)
          .map((entry) => presentOAuthClientResourceScope(entry.row));
        return ctx.json({ oauthClientResourceScopes: visible });
      },
    ),

    updateOAuthClientResourceScope: createAuthEndpoint(
      "/admin/oauth-client-resource-scopes/:id",
      {
        method: "PATCH",
        use: [sessionMiddleware],
        body: updateOAuthClientResourceScopeBody,
        metadata: updateClientResourceScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing =
          await ctx.context.adapter.findOne<OAuthClientResourceScopeRow>({
            model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
            where: [{ field: "id", value: ctx.params?.id }],
          });
        if (!existing) throw new APIError("NOT_FOUND");
        const client = await assertClientResourceScopeAccess(
          options,
          ctx,
          existing.clientId,
        );
        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          existing.resourceServerId,
        );
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(
          resourceServer.organizationId,
          organizationId,
        );
        if (ctx.body.allowedScopes) {
          await assertGrantScopesExist(
            adapterContext(ctx.context.adapter),
            existing.resourceServerId,
            ctx.body.allowedScopes,
          );
        }

        const row =
          await ctx.context.adapter.update<OAuthClientResourceScopeRow>({
            model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
            where: [{ field: "id", value: ctx.params?.id }],
            update: buildUpdateClientResourceScopePayload(
              ctx.body,
              session.user.id,
            ),
          });
        if (!row) throw new APIError("NOT_FOUND");
        await options.invalidateClientResourceScopeCache?.(existing.clientId);
        return ctx.json(presentOAuthClientResourceScope(row));
      },
    ),

    deleteOAuthClientResourceScope: createAuthEndpoint(
      "/admin/oauth-client-resource-scopes/:id",
      {
        method: "DELETE",
        use: [sessionMiddleware],
        metadata: deleteClientResourceScopeMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing =
          await ctx.context.adapter.findOne<OAuthClientResourceScopeRow>({
            model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
            where: [{ field: "id", value: ctx.params?.id }],
          });
        if (!existing) throw new APIError("NOT_FOUND");
        const client = await assertClientResourceScopeAccess(
          options,
          ctx,
          existing.clientId,
        );
        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          existing.resourceServerId,
        );
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(
          resourceServer.organizationId,
          organizationId,
        );

        await ctx.context.adapter.delete({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        await options.invalidateClientResourceScopeCache?.(existing.clientId);
        return ctx.json({ deleted: true });
      },
    ),
  },
});

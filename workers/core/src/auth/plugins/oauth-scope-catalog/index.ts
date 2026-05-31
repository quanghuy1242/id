import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
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

function requestedOrganizationId(query: Record<string, unknown> | undefined): string | undefined {
  return typeof query?.organizationId === "string" && query.organizationId ? query.organizationId : undefined;
}

function assertRequestedOrganization(
  ownerOrganizationId: string | null | undefined,
  requestedOwnerOrganizationId: string | undefined,
): void {
  if (requestedOwnerOrganizationId !== undefined && ownerOrganizationId !== requestedOwnerOrganizationId) {
    throw new APIError("NOT_FOUND");
  }
}

/** Better Auth plugin that owns resource-server-bound OAuth scopes and per-(client, resource) scope subsets. */
export const idOAuthScopeCatalog = (options: OAuthScopeCatalogPluginOptions = {}): BetterAuthPlugin => ({
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
      { method: "POST", use: [sessionMiddleware], body: createOAuthResourceScopeBody, metadata: createScopeMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
        );
        assertRequestedOrganization(resourceServer.organizationId, requestedOrganizationId(ctx.query));
        await assertCatalogAccess(
          options.authorize,
          resourceServer.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        await assertUniqueResourceScope(adapterContext(ctx.context.adapter), ctx.body.resourceServerId, ctx.body.scope);

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

        const rows = await ctx.context.adapter.findMany<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(rows.map(async (row) => {
          const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), row.resourceServerId);
          if (organizationId !== undefined && resourceServer.organizationId !== organizationId) {
            return { row, visible: false };
          }
          try {
            await assertCatalogAccess(
              options.authorize,
              resourceServer.organizationId,
              session.user.id,
              session.user.role,
              ctx.context.adapter,
            );
            return { row, visible: true };
          } catch (error) {
            if (!(error instanceof APIError)) throw error;
            return { row, visible: false };
          }
        }));
        const visible = access
          .filter((entry) => entry.visible)
          .map((entry) => presentOAuthResourceScope(entry.row));
        return ctx.json({ oauthScopes: visible });
      },
    ),

    updateOAuthResourceScope: createAuthEndpoint(
      "/admin/oauth-scopes/:id",
      { method: "PATCH", use: [sessionMiddleware], body: updateOAuthResourceScopeBody, metadata: updateScopeMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), existing.resourceServerId);
        assertRequestedOrganization(resourceServer.organizationId, requestedOrganizationId(ctx.query));
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
          update: buildUpdateScopePayload(ctx.body, existing.resourceServerId, session.user.id),
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
        await assertGrantScopesExist(adapterContext(ctx.context.adapter), ctx.body.resourceServerId, ctx.body.allowedScopes);
        const client = await assertClientResourceScopeAccess(options, ctx, ctx.body.clientId);
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(resourceServer.organizationId, organizationId);
        if (resourceServer.organizationId !== (client.referenceId ?? null)) {
          throw new APIError("BAD_REQUEST", {
            message: "OAuth client and resource server must belong to the same authorization layer",
          });
        }
        await assertUniqueClientResourceScope(adapterContext(ctx.context.adapter), ctx.body);
        await ensureOAuthClientIdentityMirror(adapterContext(ctx.context.adapter), client);

        const row = await ctx.context.adapter.create<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          data: buildCreateClientResourceScopePayload(ctx.body, session.user.id),
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

        const rows = await ctx.context.adapter.findMany<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(rows.map(async (row) => {
          try {
            const client = await assertClientResourceScopeAccess(options, ctx, row.clientId);
            const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), row.resourceServerId);
            if (
              organizationId !== undefined
              && (client.referenceId !== organizationId || resourceServer.organizationId !== organizationId)
            ) {
              return { row, visible: false };
            }
            return { row, visible: true };
          } catch (error) {
            if (!(error instanceof APIError)) throw error;
            return { row, visible: false };
          }
        }));
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

        const existing = await ctx.context.adapter.findOne<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        const client = await assertClientResourceScopeAccess(options, ctx, existing.clientId);
        const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), existing.resourceServerId);
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(resourceServer.organizationId, organizationId);
        if (ctx.body.allowedScopes) {
          await assertGrantScopesExist(adapterContext(ctx.context.adapter), existing.resourceServerId, ctx.body.allowedScopes);
        }

        const row = await ctx.context.adapter.update<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdateClientResourceScopePayload(ctx.body, session.user.id),
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

        const existing = await ctx.context.adapter.findOne<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        const client = await assertClientResourceScopeAccess(options, ctx, existing.clientId);
        const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), existing.resourceServerId);
        const organizationId = requestedOrganizationId(ctx.query);
        assertRequestedOrganization(client.referenceId ?? null, organizationId);
        assertRequestedOrganization(resourceServer.organizationId, organizationId);

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

import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
} from "../../../shared/constants";
import {
  assertCatalogAccess,
  assertGrantScopesExist,
  assertClientOwnerAccess,
  assertUniqueClientOrganizationGrant,
  assertUniqueClientResourceScope,
  assertUniqueResourceScope,
  buildCreateClientResourceScopePayload,
  buildCreateGrantPayload,
  buildCreateScopePayload,
  buildUpdateClientResourceScopePayload,
  buildUpdateGrantPayload,
  buildUpdateScopePayload,
  ensureOAuthClientMetadataBridge,
  findOAuthClientOrThrow,
  findResourceServerOrThrow,
} from "./operations";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import {
  createOAuthClientOrganizationGrantBody,
  createOAuthClientResourceScopeBody,
  createClientResourceScopeMetadata,
  createGrantMetadata,
  createOAuthResourceScopeBody,
  createScopeMetadata,
  deleteClientResourceScopeMetadata,
  listClientResourceScopeMetadata,
  listGrantMetadata,
  listScopeMetadata,
  oauthClientOrganizationGrantBetterAuthFields,
  oauthClientResourceScopeBetterAuthFields,
  oauthResourceScopeBetterAuthFields,
  updateOAuthClientOrganizationGrantBody,
  updateOAuthClientResourceScopeBody,
  updateClientResourceScopeMetadata,
  updateGrantMetadata,
  updateOAuthResourceScopeBody,
  updateScopeMetadata,
  type OAuthClientOrganizationGrantRow,
  type OAuthClientResourceScopeRow,
  type OAuthResourceScopeRow,
} from "./schema";

export type { OAuthScopeCatalogPluginOptions } from "./types";

function adapterContext(adapter: unknown): AdapterContext {
  return adapter as AdapterContext;
}

/** Better Auth plugin that owns resource-server-bound OAuth scopes and M2M scope subsets. */
export const idOAuthScopeCatalog = (options: OAuthScopeCatalogPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-oauth-scope-catalog",
  schema: {
    oauthResourceScope: {
      fields: oauthResourceScopeBetterAuthFields,
    },
    oauthClientOrganizationGrant: {
      fields: oauthClientOrganizationGrantBetterAuthFields,
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
        return ctx.json(row);
      },
    ),

    listOAuthResourceScopes: createAuthEndpoint(
      "/admin/oauth-scopes",
      { method: "GET", use: [sessionMiddleware], metadata: listScopeMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const rows = await ctx.context.adapter.findMany<OAuthResourceScopeRow>({
          model: OAUTH_RESOURCE_SCOPE_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(rows.map(async (row) => {
          const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), row.resourceServerId);
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
        const visible = access.filter((entry) => entry.visible).map((entry) => entry.row);
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
          update: buildUpdateScopePayload(ctx.body, session.user.id),
        });
        await options.invalidateScopeCache?.();
        return ctx.json(row);
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
        const client = await assertClientOwnerAccess(options, ctx, ctx.body.clientId);
        const ownerOrganizationId = client.referenceId;
        if (!ownerOrganizationId) {
          throw new APIError("FORBIDDEN", { message: "Only organization-owned OAuth clients can use this endpoint" });
        }
        if (ownerOrganizationId !== resourceServer.organizationId) {
          throw new APIError("BAD_REQUEST", { message: "OAuth client and resource server must belong to the same organization" });
        }
        await assertUniqueClientResourceScope(adapterContext(ctx.context.adapter), ctx.body);
        await ensureOAuthClientMetadataBridge(adapterContext(ctx.context.adapter), client, ownerOrganizationId);

        const row = await ctx.context.adapter.create<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          data: buildCreateClientResourceScopePayload(ctx.body, session.user.id),
        });
        await options.invalidateClientResourceScopeCache?.(ctx.body.clientId);
        return ctx.json(row);
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

        const rows = await ctx.context.adapter.findMany<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(rows.map(async (row) => {
          try {
            await assertClientOwnerAccess(options, ctx, row.clientId);
            return { row, visible: true };
          } catch (error) {
            if (!(error instanceof APIError)) throw error;
            return { row, visible: false };
          }
        }));
        const visible = access.filter((entry) => entry.visible).map((entry) => entry.row);
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
        await assertClientOwnerAccess(options, ctx, existing.clientId);
        if (ctx.body.allowedScopes) {
          await assertGrantScopesExist(adapterContext(ctx.context.adapter), existing.resourceServerId, ctx.body.allowedScopes);
        }

        const row = await ctx.context.adapter.update<OAuthClientResourceScopeRow>({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdateClientResourceScopePayload(ctx.body, session.user.id),
        });
        await options.invalidateClientResourceScopeCache?.(existing.clientId);
        return ctx.json(row);
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
        await assertClientOwnerAccess(options, ctx, existing.clientId);

        await ctx.context.adapter.delete({
          model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        await options.invalidateClientResourceScopeCache?.(existing.clientId);
        return ctx.json({ deleted: true });
      },
    ),

    createOAuthClientOrganizationGrant: createAuthEndpoint(
      "/admin/oauth-client-organization-grants",
      { method: "POST", use: [sessionMiddleware], body: createOAuthClientOrganizationGrantBody, metadata: createGrantMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const resourceServer = await findResourceServerOrThrow(
          adapterContext(ctx.context.adapter),
          ctx.body.resourceServerId,
        );
        await assertCatalogAccess(
          options.authorize,
          resourceServer.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        const client = await findOAuthClientOrThrow(adapterContext(ctx.context.adapter), ctx.body.clientId);
        if (client.referenceId && client.referenceId !== ctx.body.organizationId) {
          throw new APIError("BAD_REQUEST", { message: "Legacy grant organization must match oauthClient.referenceId" });
        }
        await assertGrantScopesExist(adapterContext(ctx.context.adapter), ctx.body.resourceServerId, ctx.body.allowedScopes);
        await assertUniqueClientOrganizationGrant(adapterContext(ctx.context.adapter), ctx.body);
        await ensureOAuthClientMetadataBridge(adapterContext(ctx.context.adapter), client, ctx.body.organizationId);

        const row = await ctx.context.adapter.create<OAuthClientOrganizationGrantRow>({
          model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
          data: buildCreateGrantPayload(ctx.body, session.user.id),
        });
        await options.invalidateGrantCache?.(ctx.body.clientId);
        return ctx.json(row);
      },
    ),

    listOAuthClientOrganizationGrants: createAuthEndpoint(
      "/admin/oauth-client-organization-grants",
      { method: "GET", use: [sessionMiddleware], metadata: listGrantMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const rows = await ctx.context.adapter.findMany<OAuthClientOrganizationGrantRow>({
          model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(rows.map(async (row) => {
          const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), row.resourceServerId);
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
        const visible = access.filter((entry) => entry.visible).map((entry) => entry.row);
        return ctx.json({ oauthClientOrganizationGrants: visible });
      },
    ),

    updateOAuthClientOrganizationGrant: createAuthEndpoint(
      "/admin/oauth-client-organization-grants/:id",
      { method: "PATCH", use: [sessionMiddleware], body: updateOAuthClientOrganizationGrantBody, metadata: updateGrantMetadata },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<OAuthClientOrganizationGrantRow>({
          model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        const resourceServer = await findResourceServerOrThrow(adapterContext(ctx.context.adapter), existing.resourceServerId);
        await assertCatalogAccess(
          options.authorize,
          resourceServer.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        if (ctx.body.allowedScopes) {
          await assertGrantScopesExist(adapterContext(ctx.context.adapter), existing.resourceServerId, ctx.body.allowedScopes);
        }

        const row = await ctx.context.adapter.update<OAuthClientOrganizationGrantRow>({
          model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdateGrantPayload(ctx.body, session.user.id),
        });
        await options.invalidateGrantCache?.(existing.clientId);
        return ctx.json(row);
      },
    ),
  },
});

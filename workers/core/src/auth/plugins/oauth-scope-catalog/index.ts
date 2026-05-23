import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
} from "../../../shared/constants";
import {
  assertCatalogAccess,
  assertGrantScopesExist,
  assertUniqueClientOrganizationGrant,
  assertUniqueResourceScope,
  buildCreateGrantPayload,
  buildCreateScopePayload,
  buildUpdateGrantPayload,
  buildUpdateScopePayload,
  findResourceServerOrThrow,
} from "./operations";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import {
  createOAuthClientOrganizationGrantBody,
  createOAuthClientOrganizationGrantOpenApiRequestBody,
  createOAuthResourceScopeBody,
  createOAuthResourceScopeOpenApiRequestBody,
  oauthClientOrganizationGrantBetterAuthFields,
  oauthClientOrganizationGrantOpenApiSchema,
  oauthResourceScopeBetterAuthFields,
  oauthResourceScopeOpenApiSchema,
  oauthScopeCatalogEndpointMeta,
  updateOAuthClientOrganizationGrantBody,
  updateOAuthClientOrganizationGrantOpenApiRequestBody,
  updateOAuthResourceScopeBody,
  updateOAuthResourceScopeOpenApiRequestBody,
  type OAuthClientOrganizationGrantRow,
  type OAuthResourceScopeRow,
} from "./schema";

export type { OAuthScopeCatalogPluginOptions } from "./types";

function adapterContext(adapter: unknown): AdapterContext {
  return adapter as AdapterContext;
}

const createScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Create an OAuth scope bound to a resource server",
  requestBody: createOAuthResourceScopeOpenApiRequestBody,
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "OAuth resource scope created successfully",
});

const listScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "List all OAuth resource scopes visible to the requester",
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "List of visible OAuth resource scopes",
});

const updateScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Update an OAuth resource scope by ID",
  hasIdParam: true,
  requestBody: updateOAuthResourceScopeOpenApiRequestBody,
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "OAuth resource scope updated successfully",
});

const createGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "Create an org-scoped M2M client organization grant",
  requestBody: createOAuthClientOrganizationGrantOpenApiRequestBody,
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "OAuth client organization grant created successfully",
});

const listGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "List all OAuth client organization grants visible to the requester",
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "List of visible OAuth client organization grants",
});

const updateGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "Update an OAuth client organization grant by ID",
  hasIdParam: true,
  requestBody: updateOAuthClientOrganizationGrantOpenApiRequestBody,
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "OAuth client organization grant updated successfully",
});

/** Better Auth plugin that owns resource-server-bound OAuth scopes and M2M org grants. */
export const idOAuthScopeCatalog = (options: OAuthScopeCatalogPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-oauth-scope-catalog",
  schema: {
    oauthResourceScope: {
      fields: oauthResourceScopeBetterAuthFields,
    },
    oauthClientOrganizationGrant: {
      fields: oauthClientOrganizationGrantBetterAuthFields,
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
        await assertGrantScopesExist(adapterContext(ctx.context.adapter), ctx.body.resourceServerId, ctx.body.allowedScopes);
        await assertUniqueClientOrganizationGrant(adapterContext(ctx.context.adapter), ctx.body);

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

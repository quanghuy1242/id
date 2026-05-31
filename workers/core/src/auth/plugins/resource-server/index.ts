import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { RESOURCE_SERVER_MODEL } from "../../../shared/constants";
import type { AdapterContext, ResourceServerPluginOptions } from "./types";
import {
  assertResourceServerAccess,
  assertUniqueSlug,
  buildCreatePayload,
  buildDisablePayload,
  buildEnablePayload,
  buildUpdatePayload,
  canAccessResourceServer,
} from "./operations";
import {
  resourceServerBetterAuthFields,
  resourceServerOpenApiSchema,
  listResourceServersOpenApiSchema,
  deleteResourceServerOpenApiSchema,
  resourceServerEndpointMeta,
  createResourceServerBody,
  createResourceServerOpenApiRequestBody,
  updateResourceServerBody,
  updateResourceServerOpenApiRequestBody,
  type ResourceServerRow,
} from "./schema";

export type { ResourceServerPluginOptions } from "./types";

const createResourceServerMetadata = resourceServerEndpointMeta({
  description: "Create a new resource server",
  requestBody: createResourceServerOpenApiRequestBody,
  responseSchema: resourceServerOpenApiSchema,
  responseDescription: "Resource server created successfully",
});

const listResourceServersMetadata = resourceServerEndpointMeta({
  description: "List all resource servers user has access to",
  responseSchema: listResourceServersOpenApiSchema,
  responseDescription: "List of resource servers",
});

const getResourceServerMetadata = resourceServerEndpointMeta({
  description: "Get a resource server by ID",
  hasIdParam: true,
  responseSchema: resourceServerOpenApiSchema,
  responseDescription: "Resource server details",
});

const updateResourceServerMetadata = resourceServerEndpointMeta({
  description: "Update a resource server by ID",
  hasIdParam: true,
  requestBody: updateResourceServerOpenApiRequestBody,
  responseSchema: resourceServerOpenApiSchema,
  responseDescription: "Resource server updated successfully",
});

const deleteResourceServerMetadata = resourceServerEndpointMeta({
  description: "Delete a resource server by ID",
  hasIdParam: true,
  responseSchema: deleteResourceServerOpenApiSchema,
  responseDescription: "Resource server deleted successfully",
});

const disableResourceServerMetadata = resourceServerEndpointMeta({
  description: "Disable a resource server by ID",
  hasIdParam: true,
  responseSchema: resourceServerOpenApiSchema,
  responseDescription: "Resource server disabled successfully",
});

const enableResourceServerMetadata = resourceServerEndpointMeta({
  description: "Enable a resource server by ID",
  hasIdParam: true,
  responseSchema: resourceServerOpenApiSchema,
  responseDescription: "Resource server enabled successfully",
});

function requestedOrganizationId(query: Record<string, unknown> | undefined): string | undefined {
  return typeof query?.organizationId === "string" && query.organizationId ? query.organizationId : undefined;
}

function assertRequestedOrganization(row: Pick<ResourceServerRow, "organizationId">, organizationId: string | undefined): void {
  if (organizationId !== undefined && row.organizationId !== organizationId) {
    throw new APIError("NOT_FOUND");
  }
}

/** Better Auth plugin that owns resource-server persistence and admin endpoints. */
export const idResourceServer = (options: ResourceServerPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-resource-server",
  schema: {
    resourceServer: {
      fields: resourceServerBetterAuthFields,
    },
  },
  endpoints: {
    createResourceServer: createAuthEndpoint(
      "/admin/resource-servers",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createResourceServerBody,
        metadata: createResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        await assertResourceServerAccess(
          options.authorize,
          ctx.body.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        await assertUniqueSlug(ctx.context.adapter as AdapterContext, ctx.body.organizationId, ctx.body.slug);

        const row = await ctx.context.adapter.create<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          data: buildCreatePayload(ctx.body, session.user.id),
        });
        await options.invalidateAudienceCache?.();
        return ctx.json(row);
      },
    ),

    listResourceServers: createAuthEndpoint(
      "/admin/resource-servers",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listResourceServersMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");
        const organizationId = requestedOrganizationId(ctx.query);

        const rows = await ctx.context.adapter.findMany<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const access = await Promise.all(
          rows.map(async (row) => ({
            row,
            visible: await canAccessResourceServer(
              options.authorize,
              row,
              session.user.id,
              session.user.role,
              ctx.context.adapter,
            ),
          })),
        );
        const visible = access
          .filter((entry) => entry.visible)
          .map((entry) => entry.row)
          .filter((row) => organizationId === undefined || row.organizationId === organizationId);

        return ctx.json({ resourceServers: visible });
      },
    ),

    getResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: getResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const row = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!row) throw new APIError("NOT_FOUND");
        assertRequestedOrganization(row, requestedOrganizationId(ctx.query));
        if (!(await canAccessResourceServer(options.authorize, row, session.user.id, session.user.role, ctx.context.adapter))) {
          throw new APIError("NOT_FOUND");
        }

        return ctx.json(row);
      },
    ),

    updateResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      {
        method: "PATCH",
        use: [sessionMiddleware],
        body: updateResourceServerBody,
        metadata: updateResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        assertRequestedOrganization(existing, requestedOrganizationId(ctx.query));

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );
        if (ctx.body.slug) {
          await assertUniqueSlug(ctx.context.adapter as AdapterContext, existing.organizationId, ctx.body.slug, existing.id);
        }

        const row = await ctx.context.adapter.update<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdatePayload(ctx.body, session.user.id),
        });
        await options.invalidateAudienceCache?.();
        return ctx.json(row);
      },
    ),

    deleteResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      {
        method: "DELETE",
        use: [sessionMiddleware],
        metadata: deleteResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        assertRequestedOrganization(existing, requestedOrganizationId(ctx.query));

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );

        await ctx.context.adapter.delete({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        await options.invalidateAudienceCache?.();
        return ctx.json({ deleted: true });
      },
    ),

    disableResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id/disable",
      {
        method: "POST",
        use: [sessionMiddleware],
        metadata: disableResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        assertRequestedOrganization(existing, requestedOrganizationId(ctx.query));

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );

        const row = await ctx.context.adapter.update<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildDisablePayload(session.user.id),
        });
        await options.invalidateAudienceCache?.();
        return ctx.json(row);
      },
    ),

    enableResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id/enable",
      {
        method: "POST",
        use: [sessionMiddleware],
        metadata: enableResourceServerMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        assertRequestedOrganization(existing, requestedOrganizationId(ctx.query));

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );

        const row = await ctx.context.adapter.update<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildEnablePayload(session.user.id),
        });
        await options.invalidateAudienceCache?.();
        return ctx.json(row);
      },
    ),
  },
});

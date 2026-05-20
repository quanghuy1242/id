import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { RESOURCE_SERVER_MODEL } from "../../../shared/constants";
import type { ResourceServerPluginOptions } from "./types";
import { createResourceServerBody, updateResourceServerBody } from "./validation";
import {
  assertResourceServerAccess,
  buildCreatePayload,
  buildDisablePayload,
  buildUpdatePayload,
  type ResourceServerRow,
} from "./operations";

export type { ResourceServerPluginOptions } from "./types";

export const idResourceServer = (options: ResourceServerPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-resource-server",
  schema: {
    resourceServer: {
      fields: {
        organizationId: { type: "string", required: true, references: { model: "organization", field: "id" } },
        slug:           { type: "string", required: true },
        name:           { type: "string", required: true },
        audience:       { type: "string", required: true, unique: true },
        description:    { type: "string", required: false },
        enabled:        { type: "boolean", required: true, defaultValue: true },
        createdBy:      { type: "string", required: false },
        updatedBy:      { type: "string", required: false },
        disabledAt:     { type: "number", required: false },
        disabledBy:     { type: "string", required: false },
        createdAt:      { type: "number", required: true },
        updatedAt:      { type: "number", required: true },
      },
    },
  },
  endpoints: {
    createResourceServer: createAuthEndpoint(
      "/admin/resource-servers",
      { method: "POST", use: [sessionMiddleware], body: createResourceServerBody },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        await assertResourceServerAccess(
          options.authorize,
          ctx.body.organizationId,
          session.user.id,
          session.user.platformRole,
          ctx.context.adapter,
        );

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
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        if (!ctx.context.session) throw new APIError("UNAUTHORIZED");

        const rows = await ctx.context.adapter.findMany<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        return ctx.json({ resourceServers: rows });
      },
    ),

    getResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        if (!ctx.context.session) throw new APIError("UNAUTHORIZED");

        const row = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!row) throw new APIError("NOT_FOUND");

        return ctx.json(row);
      },
    ),

    updateResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      { method: "PATCH", use: [sessionMiddleware], body: updateResourceServerBody },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.platformRole,
          ctx.context.adapter,
        );

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
      { method: "DELETE", use: [sessionMiddleware] },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.platformRole,
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
      { method: "POST", use: [sessionMiddleware] },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: RESOURCE_SERVER_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");

        await assertResourceServerAccess(
          options.authorize,
          existing.organizationId,
          session.user.id,
          session.user.platformRole,
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
  },
});

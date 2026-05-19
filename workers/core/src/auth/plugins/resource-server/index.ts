import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

type AdapterLike = {
  findMany: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Array<Record<string, unknown>>>;
};

type ResourceServerPluginOptions = {
  readonly invalidateAudienceCache?: () => Promise<void>;
  readonly authorize?: (context: {
    readonly organizationId: string;
    readonly session: ResourceServerSession;
    readonly adapter: AdapterLike;
  }) => Promise<boolean>;
};

type ResourceServerRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly audience: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly disabledAt?: number;
  readonly disabledBy?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type ResourceServerSession = {
  readonly user: {
    readonly id: string;
    readonly platformRole?: string | null;
  };
};

const createResourceServerBody = z.object({
  organizationId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  audience: z.url(),
  description: z.string().optional(),
  createdBy: z.string().optional(),
});

const updateResourceServerBody = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  audience: z.url().optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

function endpointSession(ctx: { readonly context: { readonly session?: ResourceServerSession } }): ResourceServerSession {
  const session = ctx.context.session;
  if (!session) {
    throw new APIError("UNAUTHORIZED");
  }

  return session;
}

async function assertResourceServerAccess(
  options: ResourceServerPluginOptions,
  organizationId: string,
  session: ResourceServerSession,
  adapter: unknown,
): Promise<void> {
  const allowed = await options.authorize?.({ organizationId, session, adapter: adapter as AdapterLike });
  if (!allowed) {
    throw new APIError("FORBIDDEN");
  }
}

export const idResourceServer = (options: ResourceServerPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-resource-server",
  schema: {
    resourceServer: {
      fields: {
        organizationId: { type: "string", required: true, references: { model: "organization", field: "id" } },
        slug: { type: "string", required: true },
        name: { type: "string", required: true },
        audience: { type: "string", required: true, unique: true },
        description: { type: "string", required: false },
        enabled: { type: "boolean", required: true, defaultValue: true },
        createdBy: { type: "string", required: false },
        updatedBy: { type: "string", required: false },
        disabledAt: { type: "number", required: false },
        disabledBy: { type: "string", required: false },
        createdAt: { type: "number", required: true },
        updatedAt: { type: "number", required: true },
      },
    },
  },
  endpoints: {
    createResourceServer: createAuthEndpoint(
      "/admin/resource-servers",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createResourceServerBody,
      },
      async (ctx) => {
        const session = endpointSession(ctx);
        await assertResourceServerAccess(options, ctx.body.organizationId, session, ctx.context.adapter);
        const now = Date.now();
        const row = await ctx.context.adapter.create<ResourceServerRow>({
          model: "resourceServer",
          data: {
            ...ctx.body,
            enabled: true,
            createdBy: ctx.body.createdBy ?? session.user.id,
            updatedAt: now,
            updatedBy: session.user.id,
            createdAt: now,
          },
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
      },
      async (ctx) => {
        endpointSession(ctx);
        const rows = await ctx.context.adapter.findMany<ResourceServerRow>({
          model: "resourceServer",
          sortBy: { field: "createdAt", direction: "desc" },
        });
        return ctx.json({ resourceServers: rows });
      },
    ),
    getResourceServer: createAuthEndpoint(
      "/admin/resource-servers/:id",
      {
        method: "GET",
        use: [sessionMiddleware],
      },
      async (ctx) => {
        endpointSession(ctx);
        const row = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!row) {
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
      },
      async (ctx) => {
        const session = endpointSession(ctx);
        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) {
          throw new APIError("NOT_FOUND");
        }

        await assertResourceServerAccess(options, existing.organizationId, session, ctx.context.adapter);
        const now = Date.now();
        const row = await ctx.context.adapter.update<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
          update: {
            ...ctx.body,
            updatedBy: session.user.id,
            updatedAt: now,
          },
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
      },
      async (ctx) => {
        const session = endpointSession(ctx);
        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) {
          throw new APIError("NOT_FOUND");
        }

        await assertResourceServerAccess(options, existing.organizationId, session, ctx.context.adapter);
        await ctx.context.adapter.delete({
          model: "resourceServer",
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
      },
      async (ctx) => {
        const session = endpointSession(ctx);
        const existing = await ctx.context.adapter.findOne<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) {
          throw new APIError("NOT_FOUND");
        }

        await assertResourceServerAccess(options, existing.organizationId, session, ctx.context.adapter);
        const row = await ctx.context.adapter.update<ResourceServerRow>({
          model: "resourceServer",
          where: [{ field: "id", value: ctx.params?.id }],
          update: {
            enabled: false,
            disabledBy: session.user.id,
            disabledAt: Date.now(),
            updatedBy: session.user.id,
            updatedAt: Date.now(),
          },
        });
        await options.invalidateAudienceCache?.();
        return ctx.json(row);
      },
    ),
  },
});

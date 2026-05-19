import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

type ResourceServerPluginOptions = {
  readonly invalidateAudienceCache?: () => Promise<void>;
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

const createResourceServerBody = z.object({
  organizationId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  audience: z.url(),
  description: z.string().optional(),
  createdBy: z.string().optional(),
});

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
        body: createResourceServerBody,
      },
      async (ctx) => {
        const now = Date.now();
        const row = await ctx.context.adapter.create<ResourceServerRow>({
          model: "resourceServer",
          data: {
            ...ctx.body,
            enabled: true,
            createdAt: now,
            updatedAt: now,
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
      },
      async (ctx) => {
        const rows = await ctx.context.adapter.findMany<ResourceServerRow>({
          model: "resourceServer",
          sortBy: { field: "createdAt", direction: "desc" },
        });
        return ctx.json({ resourceServers: rows });
      },
    ),
  },
});

import { z } from "zod";
import {
  mapZodToBetterAuthFields,
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";

/**
 * Resource-server schema source of truth.
 *
 * This module is intentionally broader than request validation. It defines the
 * canonical Zod model, derives the Better Auth table fields, and precomputes
 * OpenAPI schema fragments at module scope. In Cloudflare Workers this work is
 * paid once per isolate evaluation instead of every `getAuth()` construction.
 */

/** Canonical Zod schema for a resource-server row returned by the BA adapter. */
export const resourceServerSchema = z.object({
  id: z.string().meta({
    description: "Unique identifier of the resource server",
    example: "rs_123456",
  }),
  organizationId: z.string().min(1).nullable().optional().meta({
    description: "The organization ID that owns this resource server; null for the id-owned system audience",
    betterAuth: { index: true, references: { model: "organization", field: "id" } },
  }),
  slug: z.string().min(1).meta({
    description: "URL-friendly unique slug for the resource server inside the organization",
  }),
  name: z.string().min(1).meta({
    description: "User-friendly name of the resource server",
  }),
  audience: z.url().meta({
    description: "Audience URI of the resource server",
    betterAuth: { unique: true },
  }),
  description: z.string().optional().meta({
    description: "Optional description of the resource server",
  }),
  enabled: z.boolean().default(true).meta({
    description: "Whether the resource server is active and issuing tokens",
  }),
  createdBy: z.string().optional().meta({
    description: "User ID of the creator",
  }),
  updatedBy: z.string().optional().meta({
    description: "User ID of the last updater",
  }),
  disabledAt: z.number().optional().meta({
    description: "Timestamp (ms) when the resource server was disabled",
  }),
  disabledBy: z.string().optional().meta({
    description: "User ID who disabled the resource server",
  }),
  createdAt: z.number().meta({
    description: "Timestamp (ms) of creation",
  }),
  updatedAt: z.number().meta({
    description: "Timestamp (ms) of last update",
  }),
}).meta({ id: "ResourceServer" });

/** Inferred adapter row type for the plugin-owned `resourceServer` model. */
export type ResourceServerRow = Readonly<z.infer<typeof resourceServerSchema>>;

/** Validated body for the create-resource-server endpoint. */
export const createResourceServerBody = z
  .object({
    organizationId: z.string().min(1).nullable().optional(),
    slug: resourceServerSchema.shape.slug,
    name: resourceServerSchema.shape.name,
    audience: resourceServerSchema.shape.audience,
    description: resourceServerSchema.shape.description,
  })
  .strict();

/** Validated body for the update-resource-server endpoint. */
export const updateResourceServerBody = z
  .object({
    slug: resourceServerSchema.shape.slug.optional(),
    name: resourceServerSchema.shape.name.optional(),
    audience: resourceServerSchema.shape.audience.optional(),
    description: resourceServerSchema.shape.description.nullable(),
  })
  .strict();

export type CreateResourceServerBody = z.infer<typeof createResourceServerBody>;
export type UpdateResourceServerBody = z.infer<typeof updateResourceServerBody>;

/** Precomputed BA field map for the plugin schema block. */
export const resourceServerBetterAuthFields = mapZodToBetterAuthFields(resourceServerSchema);

/** Precomputed OpenAPI response schemas. */
export const resourceServerOpenApiSchema = zodSchemaToOpenApi(resourceServerSchema);
export const listResourceServersOpenApiSchema = zodSchemaToOpenApi(
  z.object({ resourceServers: z.array(resourceServerSchema) }),
);
export const deleteResourceServerOpenApiSchema = zodSchemaToOpenApi(
  z.object({ deleted: z.boolean() }),
);
export const createResourceServerOpenApiRequestBody = openApiJsonRequestBody(createResourceServerBody);
export const updateResourceServerOpenApiRequestBody = openApiJsonRequestBody(updateResourceServerBody);

/** Utility for the static OpenAPI metadata attached to resource-server endpoints. */
export function resourceServerEndpointMeta(options: {
  description: string;
  hasIdParam?: boolean;
  requestBody?: OpenApiRequestBody;
  responseSchema?: Record<string, unknown>;
  responseDescription?: string;
}) {
  const parameters = options.hasIdParam
    ? [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" as const },
          description: "Resource server ID",
        },
      ]
    : undefined;

  const responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json"?: {
          schema: Record<string, unknown>;
        };
      };
    }
  > = {};

  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription || "Success",
      content: {
        "application/json": {
          schema: options.responseSchema,
        },
      },
    };
  }

  return {
    openapi: {
      tags: ["Resource Server"],
      description: options.description,
      ...(parameters ? { parameters } : {}),
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

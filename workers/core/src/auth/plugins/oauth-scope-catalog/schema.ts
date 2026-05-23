import { z } from "zod";
import {
  mapZodToBetterAuthFields,
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";

const oauthScopePattern = /^[a-z][a-z0-9:_-]*$/u;

/** Canonical Zod schema for a resource-server-bound OAuth scope row. */
export const oauthResourceScopeSchema = z.object({
  id: z.string().meta({ description: "Unique identifier of the OAuth resource scope" }),
  resourceServerId: z.string().min(1).meta({
    description: "Resource-server row that owns this OAuth scope",
    betterAuth: { references: { model: "resourceServer", field: "id" } },
  }),
  scope: z.string().min(1).regex(oauthScopePattern).meta({
    description: "OAuth scope string owned by the resource server",
  }),
  description: z.string().optional().meta({ description: "Optional admin-facing description" }),
  enabled: z.boolean().default(true).meta({ description: "Whether this scope can be issued" }),
  createdBy: z.string().optional().meta({ description: "User ID of the creator" }),
  updatedBy: z.string().optional().meta({ description: "User ID of the last updater" }),
  createdAt: z.number().meta({ description: "Timestamp (ms) of creation" }),
  updatedAt: z.number().meta({ description: "Timestamp (ms) of last update" }),
}).meta({ id: "OAuthResourceScope" });

/** Canonical Zod schema for an org-scoped M2M client grant row. */
export const oauthClientOrganizationGrantSchema = z.object({
  id: z.string().meta({ description: "Unique identifier of the OAuth client organization grant" }),
  clientId: z.string().min(1).meta({ description: "OAuth client ID / service-account principal ID" }),
  organizationId: z.string().min(1).meta({
    description: "Organization for which the client can receive org-scoped M2M tokens",
    betterAuth: { references: { model: "organization", field: "id" } },
  }),
  resourceServerId: z.string().min(1).meta({
    description: "Resource server for which this client grant applies",
    betterAuth: { references: { model: "resourceServer", field: "id" } },
  }),
  allowedScopes: z.array(z.string().min(1).regex(oauthScopePattern)).meta({
    description: "Resource-server-bound OAuth scopes this client may request",
  }),
  enabled: z.boolean().default(true).meta({ description: "Whether this grant can be used" }),
  createdBy: z.string().optional().meta({ description: "User ID of the creator" }),
  updatedBy: z.string().optional().meta({ description: "User ID of the last updater" }),
  createdAt: z.number().meta({ description: "Timestamp (ms) of creation" }),
  updatedAt: z.number().meta({ description: "Timestamp (ms) of last update" }),
}).meta({ id: "OAuthClientOrganizationGrant" });

export type OAuthResourceScopeRow = Readonly<z.infer<typeof oauthResourceScopeSchema>>;
export type OAuthClientOrganizationGrantRow = Readonly<z.infer<typeof oauthClientOrganizationGrantSchema>>;

export const createOAuthResourceScopeBody = z
  .object({
    resourceServerId: oauthResourceScopeSchema.shape.resourceServerId,
    scope: oauthResourceScopeSchema.shape.scope,
    description: oauthResourceScopeSchema.shape.description,
  })
  .strict();

export const updateOAuthResourceScopeBody = z
  .object({
    scope: oauthResourceScopeSchema.shape.scope.optional(),
    description: oauthResourceScopeSchema.shape.description.nullable(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const createOAuthClientOrganizationGrantBody = z
  .object({
    clientId: oauthClientOrganizationGrantSchema.shape.clientId,
    organizationId: oauthClientOrganizationGrantSchema.shape.organizationId,
    resourceServerId: oauthClientOrganizationGrantSchema.shape.resourceServerId,
    allowedScopes: oauthClientOrganizationGrantSchema.shape.allowedScopes,
  })
  .strict();

export const updateOAuthClientOrganizationGrantBody = z
  .object({
    allowedScopes: oauthClientOrganizationGrantSchema.shape.allowedScopes.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type CreateOAuthResourceScopeBody = z.infer<typeof createOAuthResourceScopeBody>;
export type UpdateOAuthResourceScopeBody = z.infer<typeof updateOAuthResourceScopeBody>;
export type CreateOAuthClientOrganizationGrantBody = z.infer<typeof createOAuthClientOrganizationGrantBody>;
export type UpdateOAuthClientOrganizationGrantBody = z.infer<typeof updateOAuthClientOrganizationGrantBody>;

export const oauthResourceScopeBetterAuthFields = mapZodToBetterAuthFields(oauthResourceScopeSchema);
export const oauthClientOrganizationGrantBetterAuthFields = mapZodToBetterAuthFields(
  oauthClientOrganizationGrantSchema,
);

export const oauthResourceScopeOpenApiSchema = zodSchemaToOpenApi(oauthResourceScopeSchema);
export const oauthClientOrganizationGrantOpenApiSchema = zodSchemaToOpenApi(oauthClientOrganizationGrantSchema);
export const createOAuthResourceScopeOpenApiRequestBody = openApiJsonRequestBody(createOAuthResourceScopeBody);
export const updateOAuthResourceScopeOpenApiRequestBody = openApiJsonRequestBody(updateOAuthResourceScopeBody);
export const createOAuthClientOrganizationGrantOpenApiRequestBody = openApiJsonRequestBody(
  createOAuthClientOrganizationGrantBody,
);
export const updateOAuthClientOrganizationGrantOpenApiRequestBody = openApiJsonRequestBody(
  updateOAuthClientOrganizationGrantBody,
);

export type EndpointMetaOptions = {
  description: string;
  hasIdParam?: boolean;
  requestBody?: OpenApiRequestBody;
  responseSchema?: Record<string, unknown>;
  responseDescription?: string;
};

export function oauthScopeCatalogEndpointMeta(options: EndpointMetaOptions) {
  const parameters = options.hasIdParam
    ? [{ name: "id", in: "path" as const, required: true, schema: { type: "string" as const } }]
    : undefined;
  const responses: Record<string, { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }> = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription ?? "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }
  return {
    openapi: {
      tags: ["OAuth Scope Catalog"],
      description: options.description,
      ...(parameters ? { parameters } : {}),
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

import { z } from "zod";
import {
  mapZodToBetterAuthFields,
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";

const oauthScopePattern = /^[a-z][a-z0-9:_-]*$/u;

const actorAuditFields = {
  createdBy: z.string().optional().meta({ description: "User ID of the creator" }),
  updatedBy: z.string().optional().meta({ description: "User ID of the last updater" }),
  createdAt: z.number().meta({ description: "Timestamp (ms) of creation" }),
  updatedAt: z.number().meta({ description: "Timestamp (ms) of last update" }),
};

const oauthClientIdField = z.string().min(1).meta({
  description: "OAuth client ID / service-account principal ID",
  betterAuth: { index: true },
});

const allowedScopesField = z.array(z.string().min(1).regex(oauthScopePattern)).meta({
  description: "Resource-server-bound OAuth scopes this client may request",
});

function resourceServerReferenceField(description: string) {
  return z.string().min(1).meta({
    description,
    betterAuth: { index: true, references: { model: "resourceServer", field: "id" } },
  });
}

/** Canonical Zod schema for a resource-server-bound OAuth scope row. */
export const oauthResourceScopeSchema = z.object({
  id: z.string().meta({ description: "Unique identifier of the OAuth resource scope" }),
  resourceServerId: resourceServerReferenceField("Resource-server row that owns this OAuth scope"),
  scope: z.string().min(1).regex(oauthScopePattern).meta({
    description: "OAuth scope string owned by the resource server",
  }),
  description: z.string().optional().meta({ description: "Optional admin-facing description" }),
  enabled: z.boolean().default(true).meta({ description: "Whether this scope can be issued" }),
  ...actorAuditFields,
}).meta({ id: "OAuthResourceScope" });

/** Canonical Zod schema for an org-scoped M2M client grant row. */
export const oauthClientOrganizationGrantSchema = z.object({
  id: z.string().meta({ description: "Unique identifier of the OAuth client organization grant" }),
  clientId: oauthClientIdField,
  organizationId: z.string().min(1).meta({
    description: "Organization for which the client can receive org-scoped M2M tokens",
    betterAuth: { index: true, references: { model: "organization", field: "id" } },
  }),
  resourceServerId: resourceServerReferenceField("Resource server for which this client grant applies"),
  allowedScopes: allowedScopesField,
  enabled: z.boolean().default(true).meta({ description: "Whether this grant can be used" }),
  ...actorAuditFields,
}).meta({ id: "OAuthClientOrganizationGrant" });

/** Canonical Zod schema for a per-client resource-scope subset row. */
export const oauthClientResourceScopeSchema = z.object({
  id: z.string().meta({ description: "Unique identifier of the OAuth client resource-scope row" }),
  clientId: oauthClientIdField,
  resourceServerId: resourceServerReferenceField("Resource server for which this client's scope subset applies"),
  allowedScopes: allowedScopesField,
  enabled: z.boolean().default(true).meta({ description: "Whether this resource-scope row can be used" }),
  ...actorAuditFields,
}).meta({ id: "OAuthClientResourceScope" });

export type OAuthResourceScopeRow = Readonly<z.infer<typeof oauthResourceScopeSchema>>;
export type OAuthClientOrganizationGrantRow = Readonly<z.infer<typeof oauthClientOrganizationGrantSchema>>;
export type OAuthClientResourceScopeRow = Readonly<z.infer<typeof oauthClientResourceScopeSchema>>;

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

export const createOAuthClientResourceScopeBody = z
  .object({
    clientId: oauthClientResourceScopeSchema.shape.clientId,
    resourceServerId: oauthClientResourceScopeSchema.shape.resourceServerId,
    allowedScopes: oauthClientResourceScopeSchema.shape.allowedScopes,
  })
  .strict();

export const updateOAuthClientResourceScopeBody = z
  .object({
    allowedScopes: oauthClientResourceScopeSchema.shape.allowedScopes.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type CreateOAuthResourceScopeBody = z.infer<typeof createOAuthResourceScopeBody>;
export type UpdateOAuthResourceScopeBody = z.infer<typeof updateOAuthResourceScopeBody>;
export type CreateOAuthClientOrganizationGrantBody = z.infer<typeof createOAuthClientOrganizationGrantBody>;
export type UpdateOAuthClientOrganizationGrantBody = z.infer<typeof updateOAuthClientOrganizationGrantBody>;
export type CreateOAuthClientResourceScopeBody = z.infer<typeof createOAuthClientResourceScopeBody>;
export type UpdateOAuthClientResourceScopeBody = z.infer<typeof updateOAuthClientResourceScopeBody>;

export const oauthResourceScopeBetterAuthFields = mapZodToBetterAuthFields(oauthResourceScopeSchema);
export const oauthClientOrganizationGrantBetterAuthFields = mapZodToBetterAuthFields(
  oauthClientOrganizationGrantSchema,
);
export const oauthClientResourceScopeBetterAuthFields = mapZodToBetterAuthFields(oauthClientResourceScopeSchema);

export const oauthResourceScopeOpenApiSchema = zodSchemaToOpenApi(oauthResourceScopeSchema);
export const oauthClientOrganizationGrantOpenApiSchema = zodSchemaToOpenApi(oauthClientOrganizationGrantSchema);
export const oauthClientResourceScopeOpenApiSchema = zodSchemaToOpenApi(oauthClientResourceScopeSchema);
export const createOAuthResourceScopeOpenApiRequestBody = openApiJsonRequestBody(createOAuthResourceScopeBody);
export const updateOAuthResourceScopeOpenApiRequestBody = openApiJsonRequestBody(updateOAuthResourceScopeBody);
export const createOAuthClientOrganizationGrantOpenApiRequestBody = openApiJsonRequestBody(
  createOAuthClientOrganizationGrantBody,
);
export const updateOAuthClientOrganizationGrantOpenApiRequestBody = openApiJsonRequestBody(
  updateOAuthClientOrganizationGrantBody,
);
export const createOAuthClientResourceScopeOpenApiRequestBody = openApiJsonRequestBody(
  createOAuthClientResourceScopeBody,
);
export const updateOAuthClientResourceScopeOpenApiRequestBody = openApiJsonRequestBody(
  updateOAuthClientResourceScopeBody,
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

export const createScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Create an OAuth scope bound to a resource server",
  requestBody: createOAuthResourceScopeOpenApiRequestBody,
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "OAuth resource scope created successfully",
});

export const listScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "List all OAuth resource scopes visible to the requester",
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "List of visible OAuth resource scopes",
});

export const updateScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Update an OAuth resource scope by ID",
  hasIdParam: true,
  requestBody: updateOAuthResourceScopeOpenApiRequestBody,
  responseSchema: oauthResourceScopeOpenApiSchema,
  responseDescription: "OAuth resource scope updated successfully",
});

export const createGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "Create a legacy org-scoped OAuth client organization grant",
  requestBody: createOAuthClientOrganizationGrantOpenApiRequestBody,
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "OAuth client organization grant created successfully",
});

export const listGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "List all legacy OAuth client organization grants visible to the requester",
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "List of visible OAuth client organization grants",
});

export const updateGrantMetadata = oauthScopeCatalogEndpointMeta({
  description: "Update a legacy OAuth client organization grant by ID",
  hasIdParam: true,
  requestBody: updateOAuthClientOrganizationGrantOpenApiRequestBody,
  responseSchema: oauthClientOrganizationGrantOpenApiSchema,
  responseDescription: "OAuth client organization grant updated successfully",
});

export const createClientResourceScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Create a per-client OAuth resource-scope subset row",
  requestBody: createOAuthClientResourceScopeOpenApiRequestBody,
  responseSchema: oauthClientResourceScopeOpenApiSchema,
  responseDescription: "OAuth client resource-scope row created successfully",
});

export const listClientResourceScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "List all per-client OAuth resource-scope rows visible to the requester",
  responseSchema: oauthClientResourceScopeOpenApiSchema,
  responseDescription: "List of visible OAuth client resource-scope rows",
});

export const updateClientResourceScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Update a per-client OAuth resource-scope row by ID",
  hasIdParam: true,
  requestBody: updateOAuthClientResourceScopeOpenApiRequestBody,
  responseSchema: oauthClientResourceScopeOpenApiSchema,
  responseDescription: "OAuth client resource-scope row updated successfully",
});

export const deleteClientResourceScopeMetadata = oauthScopeCatalogEndpointMeta({
  description: "Delete a per-client OAuth resource-scope row by ID",
  hasIdParam: true,
  responseSchema: oauthClientResourceScopeOpenApiSchema,
  responseDescription: "OAuth client resource-scope row deleted successfully",
});

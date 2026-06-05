import { z } from "zod";
import { zodSchemaToOpenApi } from "../../openapi";
import {
  SCIM_GROUP_SCHEMA,
  SCIM_MAX_FILTER_RESULTS,
  SCIM_RESOURCE_TYPE_SCHEMA,
  SCIM_SCHEMA_SCHEMA,
  SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA,
  SCIM_TENANT_MEMBERSHIP_SCHEMA,
  SCIM_USER_SCHEMA,
} from "../../../shared/constants";

/**
 * SCIM Directory schema source of truth.
 *
 * Defines canonical Zod schemas for SCIM response types and derives OpenAPI fragments
 * at module scope. No BA field map is needed — this plugin is read-only with no
 * owned DB table. Discovery builder functions live here alongside schemas because they
 * reference the same URN constants and belong to the same data/API surface.
 */

// ── Canonical Zod response schemas ───────────────────────────────────────────

const scimMetaSchema = z.object({
  resourceType: z.string(),
  location: z.string(),
});

export const scimUserSchema = z
  .object({
    schemas: z.array(z.string()),
    id: z.string(),
    userName: z.string(),
    active: z.boolean(),
    meta: scimMetaSchema,
  })
  .meta({ id: "ScimUser" });

const scimTenantMembershipSchema = z.object({
  tenantId: z.string(),
  role: z.string(),
});

export const scimOrgUserSchema = scimUserSchema
  .extend({
    [SCIM_TENANT_MEMBERSHIP_SCHEMA]: scimTenantMembershipSchema,
  })
  .meta({ id: "ScimOrgUser" });

export const scimGroupMemberSchema = z.object({
  value: z.string(),
  $ref: z.string(),
  display: z.string(),
});

export const scimGroupSchema = z
  .object({
    schemas: z.array(z.string()),
    id: z.string(),
    displayName: z.string(),
    members: z.array(scimGroupMemberSchema),
    meta: scimMetaSchema,
  })
  .meta({ id: "ScimGroup" });

export const scimErrorSchema = z
  .object({
    schemas: z.array(z.string()),
    status: z.string(),
    scimType: z.string().optional(),
    detail: z.string().optional(),
  })
  .meta({ id: "ScimError" });

const scimListResponseBaseSchema = z
  .object({
    schemas: z.array(z.string()),
    totalResults: z.number(),
    startIndex: z.number(),
    itemsPerPage: z.number(),
    Resources: z.array(z.unknown()),
  })
  .meta({ id: "ScimListResponse" });

// ── Inferred types ────────────────────────────────────────────────────────────

export type ScimMeta = z.infer<typeof scimMetaSchema>;
export type ScimUser = z.infer<typeof scimUserSchema>;
export type ScimOrgUser = z.infer<typeof scimOrgUserSchema>;
export type ScimGroupMember = z.infer<typeof scimGroupMemberSchema>;
export type ScimGroup = z.infer<typeof scimGroupSchema>;
export type ScimError = z.infer<typeof scimErrorSchema>;
/** Generic SCIM ListResponse wrapper. Resources is typed at the call site. */
export type ScimListResponse<T> = Omit<
  z.infer<typeof scimListResponseBaseSchema>,
  "Resources"
> & {
  readonly Resources: readonly T[];
};

// ── Precomputed OpenAPI response schemas ──────────────────────────────────────

export const scimUserOpenApiSchema = zodSchemaToOpenApi(scimUserSchema);
export const scimOrgUserOpenApiSchema = zodSchemaToOpenApi(scimOrgUserSchema);
export const scimGroupOpenApiSchema = zodSchemaToOpenApi(scimGroupSchema);
export const scimErrorOpenApiSchema = zodSchemaToOpenApi(scimErrorSchema);
export const scimListResponseOpenApiSchema = zodSchemaToOpenApi(
  scimListResponseBaseSchema,
);

// ── OpenAPI endpoint metadata helper ─────────────────────────────────────────
//
// TODO(scim-compliance): Better Auth's better-call type system only allows
// "application/json", "text/plain", "text/html" as response content-type keys
// in metadata.openapi.responses. RFC 7644 §1 requires "application/scim+json".
// The actual wire responses (scimJsonResponse, scimMethodNotAllowed) already
// send Content-Type: application/scim+json — this TODO only affects OpenAPI doc
// generation. When better-call adds a union or extensible content-type key,
// switch the key from "application/json" to "application/scim+json" here.

type ScimPathParam = { readonly name: string; readonly description: string };

type ScimOpenApiResponse = {
  description: string;
  content?: {
    "application/json"?: {
      schema: Record<string, unknown>;
    };
  };
};

/** Builds the `metadata` object passed to `createAuthEndpoint` for SCIM endpoints. */
export function scimEndpointMeta(options: {
  readonly description: string;
  readonly pathParams?: readonly ScimPathParam[];
  readonly responseSchema?: Record<string, unknown>;
  readonly responseDescription?: string;
}) {
  const parameters = options.pathParams?.map((p) => ({
    name: p.name,
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
    description: p.description,
  }));

  const responses: Record<string, ScimOpenApiResponse> = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription ?? "Success",
      content: {
        "application/json": {
          schema: options.responseSchema,
        },
      },
    };
  }

  return {
    openapi: {
      tags: ["SCIM Directory"],
      description: options.description,
      ...(parameters?.length ? { parameters } : {}),
      responses,
    },
  };
}

// ── Static SCIM discovery metadata builders ──────────────────────────────────
// These produce static server metadata (not parsed resources), but live here
// because they reference the same URN constants as the resource schemas above.

/** Static SCIM ServiceProviderConfig (RFC 7643 §5). Advertises read-only support. */
export function buildServiceProviderConfig(
  baseUrl: string,
): Record<string, unknown> {
  const scimBase = `${baseUrl}/api/auth/scim/v2`;
  return {
    schemas: [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
    documentationUri: `${scimBase}/ServiceProviderConfig`,
    patch: { supported: false },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_FILTER_RESULTS },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description:
          "Authentication using an OAuth 2.0 Bearer Token with audience and scope checks",
        specUri: "https://www.rfc-editor.org/rfc/rfc6750",
      },
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: `${scimBase}/ServiceProviderConfig`,
    },
  };
}

/** Static SCIM Schemas list (RFC 7643 §7). Describes the User, Group, and TenantMembership schemas. */
export function buildSchemas(baseUrl: string): Record<string, unknown>[] {
  const scimBase = `${baseUrl}/api/auth/scim/v2`;
  return [
    {
      schemas: [SCIM_SCHEMA_SCHEMA],
      id: SCIM_USER_SCHEMA,
      name: "User",
      description:
        "SCIM core User schema. Read-only profile: active flag and tenant-membership extension only.",
      attributes: [
        {
          name: "id",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "always",
        },
        {
          name: "userName",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "default",
        },
        {
          name: "active",
          type: "boolean",
          multiValued: false,
          required: false,
          mutability: "readOnly",
          returned: "default",
        },
      ],
      meta: {
        resourceType: "Schema",
        location: `${scimBase}/Schemas/${SCIM_USER_SCHEMA}`,
      },
    },
    {
      schemas: [SCIM_SCHEMA_SCHEMA],
      id: SCIM_GROUP_SCHEMA,
      name: "Group",
      description:
        "SCIM core Group schema. Covers teams and the virtual org-admins group.",
      attributes: [
        {
          name: "id",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "always",
        },
        {
          name: "displayName",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "default",
        },
        {
          name: "members",
          type: "complex",
          multiValued: true,
          required: false,
          mutability: "readOnly",
          returned: "default",
          subAttributes: [
            { name: "value", type: "string", mutability: "readOnly" },
            { name: "$ref", type: "reference", mutability: "readOnly" },
            { name: "display", type: "string", mutability: "readOnly" },
          ],
        },
      ],
      meta: {
        resourceType: "Schema",
        location: `${scimBase}/Schemas/${SCIM_GROUP_SCHEMA}`,
      },
    },
    {
      schemas: [SCIM_SCHEMA_SCHEMA],
      id: SCIM_TENANT_MEMBERSHIP_SCHEMA,
      name: "TenantMembership",
      description:
        "Repository-specific extension recording the caller's organization-scoped role. Returned only on tenant-path User responses.",
      attributes: [
        {
          name: "tenantId",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "default",
        },
        {
          name: "role",
          type: "string",
          multiValued: false,
          required: true,
          mutability: "readOnly",
          returned: "default",
        },
      ],
      meta: {
        resourceType: "Schema",
        location: `${scimBase}/Schemas/${SCIM_TENANT_MEMBERSHIP_SCHEMA}`,
      },
    },
  ];
}

/** Static SCIM ResourceTypes list (RFC 7644 §6). */
export function buildResourceTypes(baseUrl: string): Record<string, unknown>[] {
  const scimBase = `${baseUrl}/api/auth/scim/v2`;
  return [
    {
      schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
      id: "User",
      name: "User",
      endpoint: "/Users",
      description: "Global user directory lookup",
      schema: SCIM_USER_SCHEMA,
      schemaExtensions: [
        { schema: SCIM_TENANT_MEMBERSHIP_SCHEMA, required: false },
      ],
      meta: {
        resourceType: "ResourceType",
        location: `${scimBase}/ResourceTypes/User`,
      },
    },
    {
      schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
      id: "Group",
      name: "Group",
      endpoint: "/tenants/{orgId}/Groups",
      description:
        "Tenant-scoped group (team or virtual org-admins group) lookup",
      schema: SCIM_GROUP_SCHEMA,
      meta: {
        resourceType: "ResourceType",
        location: `${scimBase}/ResourceTypes/Group`,
      },
    },
  ];
}

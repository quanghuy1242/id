import { z } from "zod";

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
  organizationId: z.string().min(1).meta({
    description: "The organization ID that owns this resource server",
    betterAuth: { references: { model: "organization", field: "id" } },
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
    organizationId: resourceServerSchema.shape.organizationId,
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

export interface BetterAuthFieldDef {
  type: "string" | "number" | "boolean" | "date";
  required?: boolean;
  unique?: boolean;
  defaultValue?: string | number | boolean | Date | (() => string | number | boolean | Date);
  references?: { model: string; field: string };
}

type ZodBaseType = "string" | "number" | "boolean" | "date";

/** Inspects a supported Zod field and maps it onto Better Auth's field DSL. */
function analyzeZodField(schema: z.ZodTypeAny): {
  type: ZodBaseType;
  required: boolean;
  defaultValue?: unknown;
} {
  let current = schema;
  let hasOptional = false;
  let hasNullable = false;
  let hasDefault = false;
  let defaultValue: unknown = undefined;
  let baseType: ZodBaseType | undefined;

  // Walk wrapper chain from outermost to innermost.
  while (true) {
    if (current instanceof z.ZodOptional) {
      hasOptional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      hasNullable = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      hasDefault = true;
      defaultValue = current.parse(undefined);
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodString || current instanceof z.ZodURL) baseType = "string";
    if (current instanceof z.ZodNumber) baseType = "number";
    if (current instanceof z.ZodBoolean) baseType = "boolean";
    if (current instanceof z.ZodDate) baseType = "date";
    if (baseType !== undefined) break;
    throw new TypeError(`Unsupported resource-server schema field type: ${current.constructor.name}`);
  }

  // BA treats defaulted fields as present, so they remain required at the table layer.
  const required = hasDefault || !(hasOptional || hasNullable);

  return {
    type: baseType,
    required,
    defaultValue: hasDefault ? defaultValue : undefined,
  };
}

/** Metadata carried in .meta().betterAuth — only attributes that cannot be inferred from the zod schema */
type BetterAuthMeta = Partial<
  Pick<BetterAuthFieldDef, "unique" | "references">
>;

/** Maps Zod object schema to Better Auth fields definition, auto-inferring type/required/defaultValue */
export function mapZodToBetterAuthFields(zodSchema: z.ZodObject<z.ZodRawShape>): Record<string, BetterAuthFieldDef> {
  const fields: Record<string, BetterAuthFieldDef> = {};

  for (const [key, value] of Object.entries(zodSchema.shape)) {
    if (key === "id") continue;

    const { type, required, defaultValue } = analyzeZodField(value as z.ZodTypeAny);

    const typedValue = value as { meta?: unknown };
    const meta = typeof typedValue.meta === "function"
      ? (typedValue.meta as () => { betterAuth?: BetterAuthMeta })()?.betterAuth
      : undefined;

    fields[key] = {
      type,
      required,
      ...(defaultValue !== undefined ? { defaultValue: defaultValue as BetterAuthFieldDef["defaultValue"] } : {}),
      ...meta,
    };
  }

  return fields;
}

function stripInternalOpenApiMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripInternalOpenApiMetadata);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "betterAuth" || key === "$schema") continue;
    cleaned[key] = stripInternalOpenApiMetadata(child);
  }
  return cleaned;
}

/**
 * Translates a Zod schema to an OpenAPI-compatible JSON schema object.
 *
 * `z.toJSONSchema()` emits JSON Schema in plain JavaScript. We strip the root
 * `$schema` marker and Better Auth-only `.meta().betterAuth` hints so the
 * public OpenAPI document describes the HTTP contract, not internal storage.
 */
export function zodSchemaToOpenApi(schema: z.ZodTypeAny, _name: string): Record<string, unknown> {
  return stripInternalOpenApiMetadata(z.toJSONSchema(schema)) as Record<string, unknown>;
}

type OpenApiJsonContent = {
  "application/json": {
    schema: Record<string, unknown>;
  };
};

type OpenApiRequestBody = {
  required: boolean;
  content: OpenApiJsonContent;
};

function openApiJsonRequestBody(schema: z.ZodTypeAny, name: string): OpenApiRequestBody {
  return {
    required: true,
    content: {
      "application/json": {
        schema: zodSchemaToOpenApi(schema, name),
      },
    },
  };
}

/** Precomputed BA field map for the plugin schema block. */
export const resourceServerBetterAuthFields = mapZodToBetterAuthFields(resourceServerSchema);

/** Precomputed OpenAPI response schemas. */
export const resourceServerOpenApiSchema = zodSchemaToOpenApi(resourceServerSchema, "ResourceServer");
export const listResourceServersOpenApiSchema = zodSchemaToOpenApi(
  z.object({ resourceServers: z.array(resourceServerSchema) }),
  "ListResourceServersResponse",
);
export const deleteResourceServerOpenApiSchema = zodSchemaToOpenApi(
  z.object({ deleted: z.boolean() }),
  "DeleteResourceServerResponse",
);
export const createResourceServerOpenApiRequestBody = openApiJsonRequestBody(
  createResourceServerBody,
  "CreateResourceServerBody",
);
export const updateResourceServerOpenApiRequestBody = openApiJsonRequestBody(
  updateResourceServerBody,
  "UpdateResourceServerBody",
);

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

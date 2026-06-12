import { z } from "zod";
import {
  mapZodToBetterAuthFields,
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";
import { consolePermissionValues } from "../console-scopes/schema";

export const adminPrincipalTypeSchema = z.enum([
  "user",
  "team",
  "group",
  "oauth_client",
]);

const adminPrincipalTypes = new Set(adminPrincipalTypeSchema.options);
const consolePermissionSet = new Set<string>(consolePermissionValues);

const persistedPrincipalTypeSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      adminPrincipalTypes.has(
        value as z.infer<typeof adminPrincipalTypeSchema>,
      ),
    "Principal type must be user, team, group, or oauth_client",
  );

const persistedConsolePermissionSchema = z
  .string()
  .min(1)
  .refine(
    (value) => consolePermissionSet.has(value),
    "Permission must be a ConsolePermission value",
  );

export const adminDelegationScopeSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === "platform" ||
      /^organization:[^:\s]+$/u.test(value) ||
      /^oauth-client:[^:\s]+$/u.test(value) ||
      /^resource-server:[^:\s]+$/u.test(value),
    "Scope must be platform, organization:<id>, oauth-client:<id>, or resource-server:<id>",
  );

export const adminRoleSchema = z
  .object({
    id: z.string(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9-]*$/u)
      .meta({ betterAuth: { unique: true } }),
    label: z.string().min(1),
    description: z.string().optional(),
    permissions: z.array(persistedConsolePermissionSchema).min(1),
    system: z.boolean().default(false),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .meta({ id: "AdminRole" });

export const adminRoleBindingSchema = z
  .object({
    id: z.string(),
    bindingKey: z
      .string()
      .min(1)
      .meta({ betterAuth: { unique: true } }),
    principalType: persistedPrincipalTypeSchema,
    principalId: z
      .string()
      .min(1)
      .meta({ betterAuth: { index: true } }),
    roleId: z
      .string()
      .min(1)
      .meta({
        betterAuth: {
          index: true,
          references: { model: "adminRole", field: "id" },
        },
      }),
    scope: adminDelegationScopeSchema.meta({ betterAuth: { index: true } }),
    expiresAt: z.number().nullable().optional(),
    createdBy: z.string().optional(),
    createdAt: z.number(),
  })
  .meta({ id: "AdminRoleBinding" });

export type AdminRoleRow = Readonly<z.infer<typeof adminRoleSchema>>;
export type AdminRoleBindingRow = Readonly<
  z.infer<typeof adminRoleBindingSchema>
>;

export const createAdminRoleBody = adminRoleSchema
  .pick({
    slug: true,
    label: true,
    description: true,
    permissions: true,
  })
  .strict();

export const updateAdminRoleBody = adminRoleSchema
  .pick({
    label: true,
    description: true,
    permissions: true,
  })
  .partial()
  .strict();

export const createAdminRoleBindingBody = adminRoleBindingSchema
  .pick({
    principalType: true,
    principalId: true,
    roleId: true,
    scope: true,
    expiresAt: true,
  })
  .strict();

export type CreateAdminRoleBody = z.infer<typeof createAdminRoleBody>;
export type UpdateAdminRoleBody = z.infer<typeof updateAdminRoleBody>;
export type CreateAdminRoleBindingBody = z.infer<
  typeof createAdminRoleBindingBody
>;

export const adminRoleBetterAuthFields =
  mapZodToBetterAuthFields(adminRoleSchema);
export const adminRoleBindingBetterAuthFields = mapZodToBetterAuthFields(
  adminRoleBindingSchema,
);

export const adminRoleOpenApiSchema = zodSchemaToOpenApi(adminRoleSchema);
export const adminRoleBindingOpenApiSchema = zodSchemaToOpenApi(
  adminRoleBindingSchema,
);
export const listAdminRolesOpenApiSchema = zodSchemaToOpenApi(
  z.object({ roles: z.array(adminRoleSchema) }),
);
export const listAdminRoleBindingsOpenApiSchema = zodSchemaToOpenApi(
  z.object({ bindings: z.array(adminRoleBindingSchema) }),
);
export const deleteAdminRoleBindingOpenApiSchema = zodSchemaToOpenApi(
  z.object({ deleted: z.boolean() }),
);
export const createAdminRoleOpenApiRequestBody =
  openApiJsonRequestBody(createAdminRoleBody);
export const updateAdminRoleOpenApiRequestBody =
  openApiJsonRequestBody(updateAdminRoleBody);
export const createAdminRoleBindingOpenApiRequestBody = openApiJsonRequestBody(
  createAdminRoleBindingBody,
);

export function adminDelegationEndpointMeta(options: {
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
          description: "Role or role-binding ID",
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
      tags: ["Admin Delegation"],
      description: options.description,
      ...(parameters ? { parameters } : {}),
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

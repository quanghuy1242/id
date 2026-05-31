import { z } from "zod";
import { zodSchemaToOpenApi } from "../../openapi";

export const consolePermissionValues = [
  "platform:read",
  "platform:write",
  "organizations:read",
  "organizations:write",
  "members:read",
  "members:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
  "jwks:read",
  "jwks:rotate",
  "system:read",
  "system:write",
] as const;

export const consoleScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("platform"),
    id: z.literal("platform"),
    label: z.string().min(1),
    role: z.literal("platform-admin"),
    permissions: z.array(z.enum(consolePermissionValues)),
    requiresStepUp: z.boolean(),
  }),
  z.object({
    kind: z.literal("organization"),
    id: z.templateLiteral(["organization:", z.string().min(1)]),
    organizationId: z.string().min(1),
    label: z.string().min(1),
    role: z.enum(["owner", "admin"]),
    permissions: z.array(z.enum(consolePermissionValues)),
    requiresStepUp: z.boolean(),
  }),
]).meta({ id: "ConsoleScope" });

export const consoleMembershipHintSchema = z.object({
  organizationId: z.string().min(1),
  label: z.string().min(1),
  role: z.literal("member"),
}).meta({ id: "ConsoleMembershipHint" });

export const consoleScopeEnvelopeSchema = z.object({
  actor: z.object({
    userId: z.string().min(1),
    email: z.email().optional(),
    canEnterConsole: z.boolean(),
  }),
  scopes: z.array(consoleScopeSchema),
  memberships: z.array(consoleMembershipHintSchema),
  defaultScopeId: z.union([z.literal("platform"), z.templateLiteral(["organization:", z.string().min(1)])]).nullable(),
}).meta({ id: "ConsoleScopeEnvelope" });

export const consoleScopeEnvelopeOpenApiSchema = zodSchemaToOpenApi(consoleScopeEnvelopeSchema);

const responses: Record<string, { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }> = {
  "200": {
    description: "Console scopes resolved successfully",
    content: {
      "application/json": {
        schema: consoleScopeEnvelopeOpenApiSchema,
      },
    },
  },
};

export const consoleScopesEndpointMetadata = {
  openapi: {
    tags: ["Console Scopes"],
    description: "Resolve platform and organization console scopes available to the current session user",
    responses,
  },
};


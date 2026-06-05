import { z } from "zod";
import { mapZodToBetterAuthFields, zodSchemaToOpenApi } from "../../openapi";

/**
 * Schema surface for the append-only admin activity log.
 *
 * The persisted `details`/`before`/`after`/`metadata` fields are JSON strings
 * because the Better Auth plugin field map only exposes portable primitive
 * types. The public read endpoint parses them back into objects after secret
 * stripping.
 */

const actorTypeSchema = z.string().min(1).meta({
  description: "Actor category. Current values are user or system.",
});

const jsonStringSchema = z.string().nullable().optional().meta({
  description: "JSON-serialized object payload; parsed by the presenter.",
});

const scopeSchema = z.enum(["platform", "organization"]);
const organizationRoleSchema = z.enum(["owner", "admin"]);

export const adminActivityLogSchema = z
  .object({
    id: z
      .string()
      .meta({ description: "Unique identifier of the activity entry" }),
    actorId: z
      .string()
      .min(1)
      .meta({
        description: "User ID or system actor ID that performed the action",
        betterAuth: { index: true },
      }),
    actorType: actorTypeSchema,
    action: z
      .string()
      .min(1)
      .meta({
        description:
          "Stable action name, for example oauth_client.update or user.ban",
        betterAuth: { index: true },
      }),
    targetType: z
      .string()
      .min(1)
      .meta({
        description:
          "Stable target type, for example oauth_client, user, jwks, or team",
        betterAuth: { index: true },
      }),
    targetId: z
      .string()
      .min(1)
      .meta({
        description: "Identifier of the changed target",
        betterAuth: { index: true },
      }),
    scope: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Console scope in which the action was performed",
        betterAuth: { index: true },
      }),
    organizationId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .meta({
        description:
          "Organization scope identifier when the action targeted an organization lens",
        betterAuth: { index: true },
      }),
    actorPlatformRole: z.string().nullable().optional().meta({
      description: "Platform role held by the actor, if any",
    }),
    actorOrganizationRole: z.string().nullable().optional().meta({
      description: "Organization owner/admin role held by the actor, if any",
    }),
    steppedUp: z
      .boolean()
      .nullable()
      .optional()
      .meta({
        description:
          "Whether the actor held fresh platform step-up proof for this action",
        betterAuth: { index: true },
      }),
    summary: z.string().nullable().optional().meta({
      description:
        "Human-readable summary of the business fact recorded by this activity",
    }),
    details: jsonStringSchema,
    before: jsonStringSchema,
    after: jsonStringSchema,
    metadata: jsonStringSchema,
    createdAt: z.number().meta({
      description: "Timestamp (ms) when the activity was appended",
      betterAuth: { index: true },
    }),
  })
  .meta({ id: "AdminActivityLog" });

export type AdminActivityLogRow = Readonly<
  z.infer<typeof adminActivityLogSchema>
>;

export type PresentedActivity = {
  id: string;
  actorId: string;
  actorType: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  scope: "platform" | "organization" | null;
  organizationId: string | null;
  actorPlatformRole: string | null;
  actorOrganizationRole: "owner" | "admin" | null;
  steppedUp: boolean | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
};

export type ActivityLogPage = {
  entries: PresentedActivity[];
  total: number;
  limit: number;
  offset: number;
};

const activityPayloadSchema = z.record(z.string(), z.unknown()).nullable();

const presentedActivitySchema = z
  .object({
    id: z.string(),
    actorId: z.string(),
    actorType: z.string(),
    actorEmail: z.string().nullable(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    scope: scopeSchema.nullable(),
    organizationId: z.string().nullable(),
    actorPlatformRole: z.string().nullable(),
    actorOrganizationRole: organizationRoleSchema.nullable(),
    steppedUp: z.boolean().nullable(),
    summary: z.string().nullable(),
    details: activityPayloadSchema,
    before: activityPayloadSchema,
    after: activityPayloadSchema,
    metadata: activityPayloadSchema,
    createdAt: z.number(),
  })
  .meta({ id: "PresentedAdminActivity" });

export const adminActivityLogBetterAuthFields = mapZodToBetterAuthFields(
  adminActivityLogSchema,
);
export const listActivityLogOpenApiSchema = zodSchemaToOpenApi(
  z.object({
    entries: z.array(presentedActivitySchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
);

type QueryParameter = {
  name: string;
  in: "query";
  required: boolean;
  schema: { type: "string" | "integer" };
  description: string;
};

const queryParameters: QueryParameter[] = [
  {
    name: "organizationId",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Filter by organization scope",
  },
  {
    name: "targetType",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Filter by target type",
  },
  {
    name: "targetId",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Filter by target ID",
  },
  {
    name: "action",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Filter by action name",
  },
  {
    name: "actorId",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Filter by actor ID",
  },
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer" },
    description: "Page size (max 100, default 25)",
  },
  {
    name: "offset",
    in: "query",
    required: false,
    schema: { type: "integer" },
    description: "Row offset to start from",
  },
];

export function adminActivityLogEndpointMeta(options: {
  description: string;
  responseSchema?: Record<string, unknown>;
  responseDescription?: string;
}) {
  const responses: Record<
    string,
    {
      description: string;
      content?: { "application/json"?: { schema: Record<string, unknown> } };
    }
  > = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription ?? "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }
  return {
    openapi: {
      tags: ["Admin Activity Log"],
      description: options.description,
      parameters: queryParameters,
      responses,
    },
  };
}

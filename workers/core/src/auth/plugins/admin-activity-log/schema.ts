import { z } from "zod";
import { mapZodToBetterAuthFields, zodSchemaToOpenApi } from "../../openapi";

/**
 * Schema surface for the append-only admin activity log.
 *
 * The persisted `before`/`after`/`metadata` fields are JSON strings because the
 * Better Auth plugin field map only exposes portable primitive types. The public
 * read endpoint parses them back into objects after secret stripping.
 */

const actorTypeSchema = z.string().min(1).meta({
  description: "Actor category. Current values are user or system.",
});

const jsonStringSchema = z.string().nullable().optional().meta({
  description: "JSON-serialized object payload; parsed by the presenter.",
});

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

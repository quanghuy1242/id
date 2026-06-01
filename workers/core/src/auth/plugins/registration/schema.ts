import { z } from "zod";
import {
  REGISTRATION_CONTINUATION_FAILURE_REASON_MAX_LENGTH,
} from "../../config";
import {
  mapZodToBetterAuthFields,
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";

/**
 * Registration plugin schema source of truth.
 *
 * The registration program is repository-specific policy around standard OIDC
 * `prompt=create`. These models stay inside the Better Auth plugin boundary so
 * account creation, sessions, OAuth continuation, and custom signup policy share
 * one auth-owned persistence surface.
 */

export const registrationPolicyStatusSchema = z.enum(["draft", "enabled", "paused", "archived"]);
export const registrationPolicyModeSchema = z.enum([
  "closed",
  "invite_only",
  "client_initiated",
  "domain_allowlist",
  "public_limited",
  "admin_provisioned",
]);
export const registrationQuotaTargetSchema = z.enum(["accounts", "memberships", "verified_accounts"]);
export const registrationIntentStatusSchema = z.enum([
  "started",
  "submitted",
  "completed",
  "cancelled",
  "expired",
  "failed",
  "continuation_failed",
]);
export const registrationReservationStatusSchema = z.enum(["reserved", "consumed", "released"]);

export const registrationPolicySchema = z.object({
  id: z.string(),
  slug: z.string().min(1).meta({ betterAuth: { unique: true } }),
  name: z.string().min(1),
  status: z.string().default("draft").meta({ betterAuth: { index: true } }),
  mode: z.string().min(1),
  clientId: z.string().min(1).nullable().optional().meta({ betterAuth: { index: true } }),
  organizationId: z.string().min(1).nullable().optional().meta({
    betterAuth: { index: true, references: { model: "organization", field: "id" } },
  }),
  resourceServerId: z.string().min(1).nullable().optional().meta({
    betterAuth: { index: true, references: { model: "resourceServer", field: "id" } },
  }),
  allowedScopes: z.array(z.string().min(1)),
  emailDomains: z.array(z.string().min(1)),
  defaultRole: z.string().default("member"),
  defaultTeamIds: z.array(z.string().min(1)),
  quotaLimit: z.number().int().positive().nullable().optional(),
  quotaTarget: z.string().default("memberships"),
  requiresEmailVerification: z.boolean().default(true),
  startsAt: z.number().nullable().optional(),
  expiresAt: z.number().nullable().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
}).meta({ id: "RegistrationPolicy" });

export const registrationIntentSchema = z.object({
  id: z.string(),
  policyId: z.string().min(1).meta({ betterAuth: { index: true, references: { model: "registrationPolicy", field: "id" } } }),
  clientId: z.string().min(1).meta({ betterAuth: { index: true } }),
  organizationId: z.string().min(1).nullable().optional().meta({ betterAuth: { index: true } }),
  invitationId: z.string().min(1).nullable().optional(),
  requestedScopes: z.array(z.string().min(1)),
  allowedScopes: z.array(z.string().min(1)),
  resource: z.string().nullable().optional(),
  oauthQuery: z.string(),
  oauthQueryHash: z.string().min(1).meta({ betterAuth: { index: true } }),
  email: z.string().email().nullable().optional().meta({ betterAuth: { index: true } }),
  status: z.string().default("started").meta({ betterAuth: { index: true } }),
  expiresAt: z.number().meta({ betterAuth: { index: true } }),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().nullable().optional(),
  userId: z.string().nullable().optional().meta({ betterAuth: { index: true } }),
  failureReason: z.string().nullable().optional(),
}).meta({ id: "RegistrationIntent" });

export const registrationQuotaReservationSchema = z.object({
  id: z.string(),
  policyId: z.string().min(1).meta({ betterAuth: { index: true, references: { model: "registrationPolicy", field: "id" } } }),
  intentId: z.string().min(1).meta({ betterAuth: { unique: true, references: { model: "registrationIntent", field: "id" } } }),
  status: z.string().default("reserved").meta({ betterAuth: { index: true } }),
  createdAt: z.number(),
  expiresAt: z.number().meta({ betterAuth: { index: true } }),
  consumedAt: z.number().nullable().optional(),
}).meta({ id: "RegistrationQuotaReservation" });

export type RegistrationPolicyRow = Readonly<z.infer<typeof registrationPolicySchema>>;
export type RegistrationIntentRow = Readonly<z.infer<typeof registrationIntentSchema>>;
export type RegistrationQuotaReservationRow = Readonly<z.infer<typeof registrationQuotaReservationSchema>>;
export type RegistrationPolicyStatus = z.infer<typeof registrationPolicyStatusSchema>;

export const createRegistrationPolicyBody = z.object({
  slug: registrationPolicySchema.shape.slug,
  name: registrationPolicySchema.shape.name,
  mode: registrationPolicyModeSchema,
  clientId: z.string().min(1).nullable().optional(),
  organizationId: z.string().min(1).nullable().optional(),
  resourceServerId: z.string().min(1).nullable().optional(),
  allowedScopes: z.array(z.string().min(1)).default([]),
  emailDomains: z.array(z.string().min(1)).default([]),
  defaultRole: z.literal("member").default("member"),
  defaultTeamIds: z.array(z.string().min(1)).default([]),
  quotaLimit: z.number().int().positive().nullable().optional(),
  quotaTarget: registrationQuotaTargetSchema.default("memberships"),
  requiresEmailVerification: z.boolean().default(true),
  startsAt: z.number().nullable().optional(),
  expiresAt: z.number().nullable().optional(),
}).strict();

export const updateRegistrationPolicyBody = createRegistrationPolicyBody.partial().extend({
  status: registrationPolicyStatusSchema.optional(),
}).strict();

export const evaluateRegistrationBody = z.object({
  oauthQuery: z.string().min(1).nullable().optional(),
  invitationId: z.string().min(1).nullable().optional(),
}).strict();

export const submitRegistrationBody = z.object({
  intentId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

export const statusRegistrationBody = z.object({
  intentId: z.string().min(1),
}).strict();

export const continuationFailureRegistrationBody = z.object({
  intentId: z.string().min(1),
  reason: z.string().min(1).max(REGISTRATION_CONTINUATION_FAILURE_REASON_MAX_LENGTH).optional(),
}).strict();

export type CreateRegistrationPolicyBody = z.infer<typeof createRegistrationPolicyBody>;
export type UpdateRegistrationPolicyBody = z.infer<typeof updateRegistrationPolicyBody>;
export type EvaluateRegistrationBody = z.infer<typeof evaluateRegistrationBody>;
export type SubmitRegistrationBody = z.infer<typeof submitRegistrationBody>;
export type ContinuationFailureRegistrationBody = z.infer<typeof continuationFailureRegistrationBody>;

export const registrationPolicyBetterAuthFields = mapZodToBetterAuthFields(registrationPolicySchema);
export const registrationIntentBetterAuthFields = mapZodToBetterAuthFields(registrationIntentSchema);
export const registrationQuotaReservationBetterAuthFields = mapZodToBetterAuthFields(registrationQuotaReservationSchema);

export const registrationPolicyOpenApiSchema = zodSchemaToOpenApi(registrationPolicySchema);
export const listRegistrationPoliciesOpenApiSchema = zodSchemaToOpenApi(
  z.object({ policies: z.array(registrationPolicySchema) }),
);
export const evaluateRegistrationOpenApiSchema = zodSchemaToOpenApi(
  z.discriminatedUnion("decision", [
    z.object({
      decision: z.literal("allowed"),
      intentId: z.string(),
      client: z.object({ clientId: z.string(), clientName: z.string() }).nullable(),
      organization: z.object({ id: z.string(), name: z.string() }).nullable(),
      invitation: z.object({ id: z.string(), email: z.string().email(), role: z.string().nullable() }).nullable(),
      requestedScopes: z.array(z.string()),
      allowedScopes: z.array(z.string()),
      expiresAt: z.number(),
      continueOAuth: z.boolean(),
    }),
    z.object({
      decision: z.literal("denied"),
      reason: z.string(),
      message: z.string(),
    }),
  ]),
);
export const submitRegistrationOpenApiSchema = zodSchemaToOpenApi(
  z.object({
    status: z.enum(["ready", "verification_required", "created"]),
    intentId: z.string(),
    email: z.string().email(),
    continueOAuth: z.boolean(),
  }),
);
export const createRegistrationPolicyOpenApiRequestBody = openApiJsonRequestBody(createRegistrationPolicyBody);
export const updateRegistrationPolicyOpenApiRequestBody = openApiJsonRequestBody(updateRegistrationPolicyBody);
export const evaluateRegistrationOpenApiRequestBody = openApiJsonRequestBody(evaluateRegistrationBody);
export const submitRegistrationOpenApiRequestBody = openApiJsonRequestBody(submitRegistrationBody);

export function registrationEndpointMeta(options: {
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
          description: "Registration policy ID",
        },
      ]
    : undefined;

  const responses: Record<string, { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }> = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription || "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }

  return {
    openapi: {
      tags: ["Registration"],
      description: options.description,
      ...(parameters ? { parameters } : {}),
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

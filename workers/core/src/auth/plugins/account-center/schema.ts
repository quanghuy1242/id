import { z } from "zod";
import {
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";

export type AccountUserRow = {
  readonly id: string;
  readonly email?: string | null;
  readonly emailVerified?: boolean | number | null;
  readonly name?: string | null;
  readonly image?: string | null;
};

export type AccountCredentialRow = {
  readonly id: string;
  readonly userId: string;
  readonly providerId?: string | null;
  readonly password?: string | null;
};

export type AccountSessionRow = {
  readonly id: string;
  readonly token: string;
  readonly userId: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly expiresAt?: unknown;
};

export type AccountConsentRow = {
  readonly id: string;
  readonly clientId: string;
  readonly userId?: string | null;
  readonly referenceId?: string | null;
  readonly scopes?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
};

export type AccountClientRow = {
  readonly clientId: string;
  readonly name?: string | null;
  readonly uri?: string | null;
  readonly icon?: string | null;
};

export type AccountMemberRow = {
  readonly organizationId: string;
  readonly userId: string;
  readonly role?: string | null;
};

export type AccountOrganizationRow = {
  readonly id: string;
  readonly name?: string | null;
  readonly slug?: string | null;
};

export type AccountTeamRow = {
  readonly id: string;
  readonly name?: string | null;
  readonly organizationId: string;
};

export type AccountTeamMemberRow = {
  readonly teamId: string;
  readonly userId: string;
};

const accountUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string().nullable(),
  image: z.string().nullable(),
}).meta({ id: "AccountCenterUser" });

const accountSecuritySchema = z.object({
  passwordEnabled: z.boolean(),
  mfaEnabled: z.boolean(),
  emailVerificationRequired: z.boolean(),
}).meta({ id: "AccountCenterSecurity" });

const accountCountsSchema = z.object({
  organizations: z.number(),
  activeSessions: z.number(),
  connectedApplications: z.number(),
}).meta({ id: "AccountCenterCounts" });

const accountSessionSchema = z.object({
  id: z.string(),
  current: z.boolean(),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
}).meta({ id: "AccountCenterSession" });

const accountConsentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string().nullable(),
  clientUri: z.string().nullable(),
  clientIcon: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
}).meta({ id: "AccountCenterConsent" });

const accountOrganizationTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
}).meta({ id: "AccountCenterOrganizationTeam" });

const accountOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  role: z.enum(["platform-admin", "owner", "admin", "member"]),
  teams: z.array(accountOrganizationTeamSchema),
  canOpenConsole: z.boolean(),
  consoleHref: z.string().nullable(),
}).meta({ id: "AccountCenterOrganization" });

export const revokeAccountSessionBody = z.object({
  sessionId: z.string().min(1),
}).strict();

export const revokeAccountConsentBody = z.object({
  clientId: z.string().min(1),
}).strict();

export const accountSummaryOpenApiSchema = zodSchemaToOpenApi(z.object({
  user: accountUserSchema,
  security: accountSecuritySchema,
  counts: accountCountsSchema,
}));

export const accountSessionsOpenApiSchema = zodSchemaToOpenApi(z.object({
  sessions: z.array(accountSessionSchema),
}));

export const accountConsentsOpenApiSchema = zodSchemaToOpenApi(z.object({
  consents: z.array(accountConsentSchema),
}));

export const accountOrganizationsOpenApiSchema = zodSchemaToOpenApi(z.object({
  organizations: z.array(accountOrganizationSchema),
}));

export const accountSuccessOpenApiSchema = zodSchemaToOpenApi(z.object({
  status: z.boolean(),
}));

export const revokeOthersOpenApiSchema = zodSchemaToOpenApi(z.object({
  status: z.boolean(),
  revoked: z.number(),
}));

export const revokeAccountSessionOpenApiRequestBody = openApiJsonRequestBody(revokeAccountSessionBody);
export const revokeAccountConsentOpenApiRequestBody = openApiJsonRequestBody(revokeAccountConsentBody);

type AccountEndpointMetaOptions = {
  readonly description: string;
  readonly requestBody?: OpenApiRequestBody;
  readonly responseSchema?: Record<string, unknown>;
  readonly responseDescription?: string;
};

export function accountCenterEndpointMeta(options: AccountEndpointMetaOptions) {
  const responses: Record<string, { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }> = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription ?? "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }

  return {
    openapi: {
      tags: ["Account Center"],
      description: options.description,
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

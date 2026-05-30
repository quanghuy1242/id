import { z } from "zod";
import {
  openApiJsonRequestBody,
  zodSchemaToOpenApi,
  type OpenApiRequestBody,
} from "../../openapi";
import {
  ROTATE_JWKS_REASON_MAX_LENGTH,
  ROTATE_JWKS_REASON_MIN_LENGTH,
} from "../../config";

/**
 * Schema surface for the admin-audit plugin.
 *
 * Unlike table-owning plugins, admin-audit owns no models — it reads tables
 * owned by Better Auth core and the OAuth provider/jwt plugins. So this file
 * carries only the *response* shapes (presented, secret-stripped rows), the
 * request body for consent revocation, and precomputed OpenAPI fragments. The
 * raw adapter row types are loose structural reads of the underlying tables.
 */

// ─── Raw adapter row reads (loose; storage shape, not API shape) ──

export type SessionRow = {
  id: string;
  token: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
  impersonatedBy?: string | null;
  createdAt?: unknown;
  expiresAt?: unknown;
};

export type TokenRow = {
  id: string;
  token?: string | null;
  clientId: string;
  userId?: string | null;
  scopes?: unknown;
  expiresAt?: unknown;
  createdAt?: unknown;
};

export type ConsentRow = {
  id: string;
  clientId: string;
  userId?: string | null;
  scopes?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type JwksRow = {
  id: string;
  publicKey?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
};

export type PageParams = { limit: number; offset: number };

// ─── Presented response shapes (what the API returns) ─────────────

export type PresentedSession = {
  id: string;
  userId: string;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  impersonatedBy: string | null;
  createdAt: number | null;
  expiresAt: number | null;
};

export type PresentedToken = {
  id: string;
  tokenPrefix: string;
  type: "access" | "refresh";
  clientId: string;
  clientName: string | null;
  userId: string | null;
  userEmail: string | null;
  scopes: string[];
  expiresAt: number | null;
  createdAt: number | null;
};

export type PresentedConsent = {
  id: string;
  clientId: string;
  clientName: string | null;
  userId: string | null;
  userEmail: string | null;
  scopes: string[];
  createdAt: number | null;
  updatedAt: number | null;
};

export type PresentedJwk = {
  id: string;
  alg: string;
  createdAt: number | null;
  expiresAt: number | null;
  status: "active" | "rotated" | "expired";
  publicJwk: Record<string, unknown>;
};

export type RotateJwksResponse = PresentedJwk & { reason: string };

// ─── Zod schemas (for OpenAPI generation only) ────────────────────

const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  activeOrganizationId: z.string().nullable(),
  activeTeamId: z.string().nullable(),
  impersonatedBy: z.string().nullable(),
  createdAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
}).meta({ id: "AdminAuditSession" });

const tokenSchema = z.object({
  id: z.string(),
  tokenPrefix: z.string(),
  type: z.enum(["access", "refresh"]),
  clientId: z.string(),
  clientName: z.string().nullable(),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  scopes: z.array(z.string()),
  expiresAt: z.number().nullable(),
  createdAt: z.number().nullable(),
}).meta({ id: "AdminAuditToken" });

const consentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string().nullable(),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
}).meta({ id: "AdminAuditConsent" });

const jwkSchema = z.object({
  id: z.string(),
  alg: z.string(),
  createdAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
  status: z.enum(["active", "rotated", "expired"]),
  publicJwk: z.record(z.string(), z.unknown()),
}).meta({ id: "AdminAuditJwk" });

const rotateJwksSchema = jwkSchema.extend({
  reason: z.string(),
}).meta({ id: "AdminRotateJwksResponse" });

/** Validated body for the revoke-consent endpoint. */
export const revokeConsentBody = z
  .object({
    clientId: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

/** Validated body for session revocation; callers pass the DB id, never the bearer token. */
export const revokeSessionBody = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

/** Validated body for the emergency-rotate endpoint. */
export const rotateJwksBody = z
  .object({
    reason: z.string().min(ROTATE_JWKS_REASON_MIN_LENGTH).max(ROTATE_JWKS_REASON_MAX_LENGTH),
  })
  .strict();

export type RevokeConsentBody = z.infer<typeof revokeConsentBody>;
export type RevokeSessionBody = z.infer<typeof revokeSessionBody>;
export type RotateJwksBody = z.infer<typeof rotateJwksBody>;

// ─── Precomputed OpenAPI fragments ────────────────────────────────

export const listSessionsOpenApiSchema = zodSchemaToOpenApi(
  z.object({ sessions: z.array(sessionSchema), total: z.number(), limit: z.number(), offset: z.number() }),
);
export const listTokensOpenApiSchema = zodSchemaToOpenApi(
  z.object({ tokens: z.array(tokenSchema), total: z.number(), limit: z.number(), offset: z.number() }),
);
export const listConsentsOpenApiSchema = zodSchemaToOpenApi(
  z.object({ consents: z.array(consentSchema), total: z.number(), limit: z.number(), offset: z.number() }),
);
export const successOpenApiSchema = zodSchemaToOpenApi(z.object({ success: z.boolean() }));
export const revokeConsentOpenApiRequestBody = openApiJsonRequestBody(revokeConsentBody);
export const revokeSessionOpenApiRequestBody = openApiJsonRequestBody(revokeSessionBody);
export const jwksOpenApiSchema = zodSchemaToOpenApi(z.object({ keys: z.array(jwkSchema) }));
export const rotateJwksOpenApiSchema = zodSchemaToOpenApi(rotateJwksSchema);
export const rotateJwksOpenApiRequestBody = openApiJsonRequestBody(rotateJwksBody);

type QueryParameter = {
  name: string;
  in: "query";
  required: boolean;
  schema: { type: "string" | "integer"; enum?: string[] };
  description: string;
};

const paginationParameters: readonly QueryParameter[] = [
  { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Page size (max 100, default 25)" },
  { name: "offset", in: "query", required: false, schema: { type: "integer" }, description: "Row offset to start from" },
];

/** Static OpenAPI metadata builder for admin-audit endpoints. */
export function adminAuditEndpointMeta(options: {
  description: string;
  pagination?: boolean;
  extraParameters?: readonly QueryParameter[];
  requestBody?: OpenApiRequestBody;
  responseSchema?: Record<string, unknown>;
  responseDescription?: string;
}) {
  const parameters = [
    ...(options.pagination ? paginationParameters : []),
    ...(options.extraParameters ?? []),
  ];

  const responses: Record<
    string,
    { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }
  > = {};
  if (options.responseSchema) {
    responses["200"] = {
      description: options.responseDescription || "Success",
      content: { "application/json": { schema: options.responseSchema } },
    };
  }

  return {
    openapi: {
      tags: ["Admin Audit"],
      description: options.description,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(options.requestBody ? { requestBody: options.requestBody } : {}),
      responses,
    },
  };
}

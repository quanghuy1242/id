import { authApiFormPostOrThrow, authApiGetOrThrow, authApiPostOrThrow } from "@id/lib";

/**
 * Aggregate admin-audit reads (sessions, tokens, consents, JWKS metadata) and
 * the consent-revoke action, served by the `admin-audit` Better Auth plugin.
 * All list endpoints are server-paginated: the page window is a server param,
 * so it belongs in the SWR key. Token values are never returned (prefix only);
 * the JWKS private key is never returned.
 */

export type AdminSession = {
  id: string;
  token: string;
  userId: string;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
  createdAt: number | null;
  expiresAt: number | null;
};

export type AdminToken = {
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

export type AdminConsent = {
  id: string;
  clientId: string;
  clientName: string | null;
  userId: string | null;
  userEmail: string | null;
  scopes: string[];
  createdAt: number | null;
  updatedAt: number | null;
};

export type AdminJwk = {
  id: string;
  alg: string;
  createdAt: number | null;
  expiresAt: number | null;
  status: "active" | "rotated" | "expired";
  publicJwk: Record<string, unknown>;
};

export type RotateJwksResult = AdminJwk & {
  reason: string;
};

export type AdminActivity = {
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

export type TokenIntrospectionInput = {
  token: string;
  token_type_hint?: "access_token" | "refresh_token";
  client_id?: string;
  client_secret?: string;
  resource?: string;
};

export type TokenIntrospectionResult = {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  [claim: string]: unknown;
};

export type Paginated<K extends string, T> = { total: number; limit: number; offset: number } & Record<K, T[]>;

export type PageParams = { limit: number; offset: number };
export type ActivityLogParams = PageParams & {
  targetType: string;
  targetId: string;
  action?: string;
  actorId?: string;
};

export async function listAdminSessions(params: PageParams): Promise<Paginated<"sessions", AdminSession>> {
  return authApiGetOrThrow<Paginated<"sessions", AdminSession>>("/admin/list-sessions", params);
}

export async function listAdminTokens(params: PageParams & { type: "access" | "refresh" }): Promise<Paginated<"tokens", AdminToken>> {
  return authApiGetOrThrow<Paginated<"tokens", AdminToken>>("/admin/list-tokens", params);
}

export async function listAdminConsents(params: PageParams & { clientId?: string }): Promise<Paginated<"consents", AdminConsent>> {
  return authApiGetOrThrow<Paginated<"consents", AdminConsent>>("/admin/list-consents", params);
}

export async function revokeConsent(clientId: string, userId: string): Promise<void> {
  await authApiPostOrThrow("/admin/revoke-consent", { clientId, userId });
}

export async function listAdminJwks(): Promise<AdminJwk[]> {
  const res = await authApiGetOrThrow<{ keys: AdminJwk[] }>("/admin/jwks");
  return res.keys ?? [];
}

export async function rotateAdminJwks(reason: string): Promise<RotateJwksResult> {
  return authApiPostOrThrow<RotateJwksResult>("/admin/jwks/rotate", { reason });
}

export async function listActivityLog(params: ActivityLogParams): Promise<Paginated<"entries", AdminActivity>> {
  return authApiGetOrThrow<Paginated<"entries", AdminActivity>>("/admin/activity-log", params);
}

export async function introspectToken(input: TokenIntrospectionInput): Promise<TokenIntrospectionResult> {
  const form = new URLSearchParams({ token: input.token });
  if (input.token_type_hint) form.set("token_type_hint", input.token_type_hint);
  if (input.resource) form.set("resource", input.resource);
  const headers: Record<string, string> = {};

  if (input.client_id && input.client_secret) {
    headers.authorization = `Basic ${btoa(`${input.client_id}:${input.client_secret}`)}`;
  } else if (input.client_id) {
    form.set("client_id", input.client_id);
  }

  return authApiFormPostOrThrow<TokenIntrospectionResult>("/oauth2/introspect", form, { headers });
}

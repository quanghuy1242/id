import { authApiGetOrThrow, authApiPostOrThrow } from "@id/lib";

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

export type Paginated<K extends string, T> = { total: number; limit: number; offset: number } & Record<K, T[]>;

export type PageParams = { limit: number; offset: number };

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

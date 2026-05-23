import { APIError } from "better-auth/api";
import {
  OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";
import type { ResourceServerRow } from "../resource-server/schema";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import type {
  CreateOAuthClientOrganizationGrantBody,
  CreateOAuthResourceScopeBody,
  OAuthClientOrganizationGrantRow,
  OAuthResourceScopeRow,
  UpdateOAuthClientOrganizationGrantBody,
  UpdateOAuthResourceScopeBody,
} from "./schema";

export type AuthorizeFn = NonNullable<OAuthScopeCatalogPluginOptions["authorize"]>;

export async function assertCatalogAccess(
  authorize: AuthorizeFn | undefined,
  organizationId: string,
  userId: string,
  role: string | null | undefined,
  adapter: unknown,
): Promise<void> {
  if (!authorize || !(await authorize(organizationId, userId, role, adapter))) {
    throw new APIError("FORBIDDEN");
  }
}

export async function findResourceServerOrThrow(
  adapter: AdapterContext,
  resourceServerId: string,
): Promise<ResourceServerRow> {
  const resourceServer = await adapter.findOne<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [{ field: "id", value: resourceServerId }],
  });
  if (!resourceServer) {
    throw new APIError("BAD_REQUEST", { message: "Resource server not found" });
  }
  return resourceServer;
}

export async function assertUniqueResourceScope(
  adapter: AdapterContext,
  resourceServerId: string,
  scope: string,
  ignoreId?: string,
): Promise<void> {
  const rows = await adapter.findMany<OAuthResourceScopeRow>({
    model: OAUTH_RESOURCE_SCOPE_MODEL,
    where: [
      { field: "resourceServerId", value: resourceServerId },
      { field: "scope", value: scope },
    ],
  });
  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", { message: "OAuth scope already exists for resource server" });
  }
}

export async function assertGrantScopesExist(
  adapter: AdapterContext,
  resourceServerId: string,
  scopes: readonly string[],
): Promise<void> {
  const rows = await adapter.findMany<OAuthResourceScopeRow>({
    model: OAUTH_RESOURCE_SCOPE_MODEL,
    where: [{ field: "resourceServerId", value: resourceServerId }],
  });
  const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.scope));
  const missing = scopes.filter((scope) => !enabled.has(scope));
  if (missing.length > 0) {
    throw new APIError("BAD_REQUEST", { message: `Grant contains unknown or disabled scopes: ${missing.join(", ")}` });
  }
}

export async function assertUniqueClientOrganizationGrant(
  adapter: AdapterContext,
  body: Pick<CreateOAuthClientOrganizationGrantBody, "clientId" | "organizationId" | "resourceServerId">,
  ignoreId?: string,
): Promise<void> {
  const rows = await adapter.findMany<OAuthClientOrganizationGrantRow>({
    model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
    where: [
      { field: "clientId", value: body.clientId },
      { field: "organizationId", value: body.organizationId },
      { field: "resourceServerId", value: body.resourceServerId },
    ],
  });
  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", { message: "OAuth client organization grant already exists" });
  }
}

export function buildCreateScopePayload(
  body: CreateOAuthResourceScopeBody,
  actorId: string,
): Omit<OAuthResourceScopeRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    enabled: true,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateScopePayload(
  fields: UpdateOAuthResourceScopeBody,
  actorId: string,
): Partial<OAuthResourceScopeRow> {
  return {
    ...fields,
    updatedBy: actorId,
    updatedAt: Date.now(),
  } as Partial<OAuthResourceScopeRow>;
}

export function buildCreateGrantPayload(
  body: CreateOAuthClientOrganizationGrantBody,
  actorId: string,
): Omit<OAuthClientOrganizationGrantRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    enabled: true,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateGrantPayload(
  fields: UpdateOAuthClientOrganizationGrantBody,
  actorId: string,
): Partial<OAuthClientOrganizationGrantRow> {
  return {
    ...fields,
    updatedBy: actorId,
    updatedAt: Date.now(),
  } as Partial<OAuthClientOrganizationGrantRow>;
}

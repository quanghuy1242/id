import { APIError } from "better-auth/api";
import {
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";
import type { ResourceServerRow } from "../resource-server/schema";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import type {
  CreateOAuthClientOrganizationGrantBody,
  CreateOAuthClientResourceScopeBody,
  CreateOAuthResourceScopeBody,
  OAuthClientOrganizationGrantRow,
  OAuthClientResourceScopeRow,
  OAuthResourceScopeRow,
  UpdateOAuthClientOrganizationGrantBody,
  UpdateOAuthClientResourceScopeBody,
  UpdateOAuthResourceScopeBody,
} from "./schema";

export type AuthorizeFn = NonNullable<OAuthScopeCatalogPluginOptions["authorize"]>;

export async function assertCatalogAccess(
  authorize: AuthorizeFn | undefined,
  organizationId: string | null | undefined,
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

type OAuthClientRow = {
  readonly id: string;
  readonly clientId: string;
  readonly disabled?: boolean | null;
  readonly grantTypes?: readonly string[] | null;
  readonly metadata?: Record<string, unknown> | string | null;
  readonly referenceId?: string | null;
};

export async function findOAuthClientOrThrow(
  adapter: AdapterContext,
  clientId: string,
): Promise<OAuthClientRow> {
  const client = await adapter.findOne<OAuthClientRow>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  if (!client) {
    throw new APIError("BAD_REQUEST", { message: "OAuth client not found" });
  }
  return client;
}

function userRole(user: Record<string, unknown>): string | null | undefined {
  return typeof user.role === "string" || user.role === null || user.role === undefined
    ? user.role as string | null | undefined
    : undefined;
}

export async function assertClientOwnerAccess(
  options: OAuthScopeCatalogPluginOptions,
  ctx: {
    readonly context: {
      readonly adapter: unknown;
      readonly session?: {
        readonly user: Record<string, unknown> & { readonly id: string };
      };
    };
  },
  clientId: string,
): Promise<OAuthClientRow> {
  const session = ctx.context.session;
  if (!session) throw new APIError("UNAUTHORIZED");
  const client = await findOAuthClientOrThrow(ctx.context.adapter as AdapterContext, clientId);
  if (!client.referenceId) {
    throw new APIError("FORBIDDEN", { message: "Only organization-owned OAuth clients can use this endpoint" });
  }
  await assertCatalogAccess(
    options.authorize,
    client.referenceId,
    session.user.id,
    userRole(session.user),
    ctx.context.adapter,
  );
  return client;
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

export async function assertUniqueClientResourceScope(
  adapter: AdapterContext,
  body: Pick<CreateOAuthClientResourceScopeBody, "clientId" | "resourceServerId">,
  ignoreId?: string,
): Promise<void> {
  const rows = await adapter.findMany<OAuthClientResourceScopeRow>({
    model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
    where: [
      { field: "clientId", value: body.clientId },
      { field: "resourceServerId", value: body.resourceServerId },
    ],
  });
  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", { message: "OAuth client resource-scope row already exists" });
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

export function buildCreateClientResourceScopePayload(
  body: CreateOAuthClientResourceScopeBody,
  actorId: string,
): Omit<OAuthClientResourceScopeRow, "id"> {
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

export function buildUpdateClientResourceScopePayload(
  fields: UpdateOAuthClientResourceScopeBody,
  actorId: string,
): Partial<OAuthClientResourceScopeRow> {
  return {
    ...fields,
    updatedBy: actorId,
    updatedAt: Date.now(),
  } as Partial<OAuthClientResourceScopeRow>;
}

function parseMetadata(value: OAuthClientRow["metadata"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null ? { ...parsed as Record<string, unknown> } : {};
    } catch {
      return {};
    }
  }
  return { ...value };
}

export async function ensureOAuthClientMetadataBridge(
  adapter: AdapterContext,
  client: OAuthClientRow,
  organizationId: string,
): Promise<void> {
  const metadata = parseMetadata(client.metadata);
  if (metadata.id_client_id === client.clientId && metadata.organization_id === organizationId) return;
  metadata.id_client_id = client.clientId;
  metadata.organization_id = organizationId;
  await adapter.update<OAuthClientRow>({
    model: "oauthClient",
    where: [{ field: "clientId", value: client.clientId }],
    update: { metadata },
  });
}

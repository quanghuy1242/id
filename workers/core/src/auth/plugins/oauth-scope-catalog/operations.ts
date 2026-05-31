import { APIError } from "better-auth/api";
import {
  OAUTH_CLIENT_MODEL,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";
import type { ResourceServerRow } from "../resource-server/schema";
import type { AdapterContext, OAuthScopeCatalogPluginOptions } from "./types";
import type {
  CreateOAuthClientResourceScopeBody,
  CreateOAuthResourceScopeBody,
  OAuthClientResourceScopeRow,
  OAuthResourceScopeRow,
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

export type OAuthClientRow = {
  readonly id: string;
  readonly clientId: string;
  readonly disabled?: boolean | null;
  readonly grantTypes?: readonly string[] | string | null;
  readonly referenceId?: string | null;
  readonly metadata?: Record<string, unknown> | string | null;
};

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

/**
 * Better Auth 1.6.11 does not forward the resolved oauth client (or its `clientId`
 * column) to `customAccessTokenClaims` for `client_credentials`, only `metadata`. Doc
 * 018 §5.5 D5 allows this single one-field mirror as the BA-limitation workaround so
 * the token-issuance hook can look up the client row by `clientId` and read the
 * authoritative `referenceId` column. A legacy `metadata.organization_id` mirror is
 * stripped if encountered and is never used as authority.
 */
export async function ensureOAuthClientIdentityMirror(
  adapter: AdapterContext,
  client: OAuthClientRow,
): Promise<void> {
  const metadata = parseMetadata(client.metadata);
  if (metadata.id_client_id === client.clientId) return;
  metadata.id_client_id = client.clientId;
  // Strip the legacy organization_id mirror if present; org_id is now derived from
  // the `referenceId` column at token-issuance time.
  delete metadata.organization_id;
  await adapter.update<OAuthClientRow>({
    model: "oauthClient",
    where: [{ field: "clientId", value: client.clientId }],
    update: { metadata },
  });
}

export async function findOAuthClientOrThrow(
  adapter: AdapterContext,
  clientId: string,
): Promise<OAuthClientRow> {
  const client = await adapter.findOne<OAuthClientRow>({
    model: OAUTH_CLIENT_MODEL,
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

/**
 * Authorizes management of a client resource-scope row against the client's
 * ownership layer. Tenant clients use their organization; infrastructure
 * clients use the system layer and are therefore restricted to platform admins
 * by the injected authorization policy.
 */
export async function assertClientResourceScopeAccess(
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
  await assertCatalogAccess(
    options.authorize,
    client.referenceId ?? null,
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

export type EnsureOAuthResourceScopeResult = {
  readonly row: OAuthResourceScopeRow;
  readonly changed: boolean;
};

type OAuthResourceScopeUpdate = {
  -readonly [Key in keyof OAuthResourceScopeRow]?: OAuthResourceScopeRow[Key];
};

/**
 * Ensures one resource-server scope exists and is enabled using the plugin's
 * natural key and BA adapter model.
 */
export async function ensureOAuthResourceScope(
  adapter: AdapterContext,
  body: CreateOAuthResourceScopeBody,
  actorId: string,
): Promise<EnsureOAuthResourceScopeResult> {
  const key = resourceScopeKey(body.resourceServerId, body.scope);
  const existing = await adapter.findOne<OAuthResourceScopeRow>({
    model: OAUTH_RESOURCE_SCOPE_MODEL,
    where: [{ field: "resourceScopeKey", value: key }],
  });

  if (!existing) {
    const row = await adapter.create<OAuthResourceScopeRow>({
      model: OAUTH_RESOURCE_SCOPE_MODEL,
      data: buildCreateScopePayload(body, actorId),
    });
    return { row, changed: true };
  }

  const update: OAuthResourceScopeUpdate = {};
  if (!existing.enabled) update.enabled = true;
  if (body.description !== undefined && existing.description !== body.description) {
    update.description = body.description;
  }

  if (Object.keys(update).length === 0) {
    return { row: existing, changed: false };
  }

  const row = await adapter.update<OAuthResourceScopeRow>({
    model: OAUTH_RESOURCE_SCOPE_MODEL,
    where: [{ field: "id", value: existing.id }],
    update: {
      ...update,
      updatedBy: actorId,
      updatedAt: Date.now(),
    },
  });
  return { row, changed: true };
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

/**
 * Builds the persisted natural-key value for one resource-server scope.
 *
 * Better Auth plugin schemas support single-field unique storage constraints,
 * so this explicit plugin-owned field enforces the logical
 * `(resourceServerId, scope)` pair without modifying generated schema output.
 */
export function resourceScopeKey(resourceServerId: string, scope: string): string {
  return JSON.stringify([resourceServerId, scope]);
}

/**
 * Builds the persisted natural-key value for one client/resource attachment.
 *
 * The value gives the plugin schema a supported unique field that represents
 * the logical `(clientId, resourceServerId)` pair.
 */
export function clientResourceKey(clientId: string, resourceServerId: string): string {
  return JSON.stringify([clientId, resourceServerId]);
}

export function buildCreateScopePayload(
  body: CreateOAuthResourceScopeBody,
  actorId: string,
): Omit<OAuthResourceScopeRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    resourceScopeKey: resourceScopeKey(body.resourceServerId, body.scope),
    enabled: true,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateScopePayload(
  fields: UpdateOAuthResourceScopeBody,
  resourceServerId: string,
  actorId: string,
): Partial<OAuthResourceScopeRow> {
  return {
    ...fields,
    ...(fields.scope === undefined ? {} : { resourceScopeKey: resourceScopeKey(resourceServerId, fields.scope) }),
    updatedBy: actorId,
    updatedAt: Date.now(),
  } as Partial<OAuthResourceScopeRow>;
}

export function buildCreateClientResourceScopePayload(
  body: CreateOAuthClientResourceScopeBody,
  actorId: string,
): Omit<OAuthClientResourceScopeRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    clientResourceKey: clientResourceKey(body.clientId, body.resourceServerId),
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

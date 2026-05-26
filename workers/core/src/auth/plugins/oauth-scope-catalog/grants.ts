import { APIError } from "better-auth/api";
import { authPluginConfig } from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { BackgroundTaskRunner } from "../../types";
import type { CoreEnv } from "../../../config/env";
import {
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
  OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";

export type ClientOrganizationGrantRow = {
  readonly id: string;
  readonly clientId: string;
  readonly organizationId: string;
  readonly resourceServerId: string;
  readonly audience: string;
  readonly allowedScopes: readonly string[];
  readonly enabled: boolean;
};

export type ClientResourceScopeRow = {
  readonly id: string;
  readonly clientId: string;
  readonly resourceServerId: string;
  readonly audience: string;
  readonly allowedScopes: readonly string[];
  readonly enabled: boolean;
};

type RawGrantRow = Omit<ClientOrganizationGrantRow, "allowedScopes"> & {
  readonly allowedScopes: string | readonly string[];
};

type RawClientResourceScopeRow = Omit<ClientResourceScopeRow, "allowedScopes"> & {
  readonly allowedScopes: string | readonly string[];
};

type ResourceScopeTableRow = {
  readonly resourceServerId: string;
};

type ResourceServerAudienceRow = {
  readonly id: string;
  readonly audience: string;
  readonly enabled: boolean;
};

type GrantEnv = {
  readonly DB: CoreEnv["DB"] | unknown;
  readonly KV: BetterAuthKvStorage;
};

const memoryGrantCache = new Map<string, {
  readonly expiresAt: number;
  readonly rows: readonly ClientOrganizationGrantRow[];
}>();

const memoryClientResourceScopeCache = new Map<string, {
  readonly expiresAt: number;
  readonly rows: readonly ClientResourceScopeRow[];
}>();

type AdapterLike = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: {
    model: string;
    where?: { field: string; value: unknown }[];
  }) => Promise<T[]>;
};

function isD1Database(value: unknown): value is D1Database {
  return typeof value === "object" && value !== null && "prepare" in value;
}

function isAdapterLike(value: unknown): value is AdapterLike {
  return typeof value === "object" && value !== null && "findOne" in value && "findMany" in value;
}

function cacheKey(clientId: string): string {
  return `${authPluginConfig.oauthGrantCachePrefix}${clientId}`;
}

function clientResourceScopeCacheKey(clientId: string): string {
  return `${authPluginConfig.oauthClientResourceScopeCachePrefix}${clientId}`;
}

function getMemoryGrantRows(clientId: string, now: number): readonly ClientOrganizationGrantRow[] | null {
  const cached = memoryGrantCache.get(clientId);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    memoryGrantCache.delete(clientId);
    return null;
  }
  return cached.rows;
}

function setMemoryGrantRows(clientId: string, rows: readonly ClientOrganizationGrantRow[], now: number): void {
  memoryGrantCache.set(clientId, {
    rows,
    expiresAt: now + OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  });
}

function getMemoryClientResourceScopeRows(clientId: string, now: number): readonly ClientResourceScopeRow[] | null {
  const cached = memoryClientResourceScopeCache.get(clientId);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    memoryClientResourceScopeCache.delete(clientId);
    return null;
  }
  return cached.rows;
}

function setMemoryClientResourceScopeRows(
  clientId: string,
  rows: readonly ClientResourceScopeRow[],
  now: number,
): void {
  memoryClientResourceScopeCache.set(clientId, {
    rows,
    expiresAt: now + OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  });
}

function parseAllowedScopes(value: string | readonly string[]): readonly string[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value as string);
    if (typeof parsed === "string") return parseAllowedScopes(parsed);
    return Array.isArray(parsed) && parsed.every((item): item is string => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeGrantRows(rows: readonly RawGrantRow[]): readonly ClientOrganizationGrantRow[] {
  return rows.map((row) => ({
    ...row,
    allowedScopes: parseAllowedScopes(row.allowedScopes),
    enabled: Boolean(row.enabled),
  }));
}

function normalizeClientResourceScopeRows(
  rows: readonly RawClientResourceScopeRow[],
): readonly ClientResourceScopeRow[] {
  return rows.map((row) => ({
    ...row,
    allowedScopes: parseAllowedScopes(row.allowedScopes),
    enabled: Boolean(row.enabled),
  }));
}

function parseCachedGrantRows(value: string | null): readonly ClientOrganizationGrantRow[] | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed)
    || !parsed.every((item): item is ClientOrganizationGrantRow =>
      Boolean(item)
      && typeof item === "object"
      && typeof (item as ClientOrganizationGrantRow).clientId === "string"
      && typeof (item as ClientOrganizationGrantRow).organizationId === "string"
      && typeof (item as ClientOrganizationGrantRow).resourceServerId === "string"
      && typeof (item as ClientOrganizationGrantRow).audience === "string"
      && Array.isArray((item as ClientOrganizationGrantRow).allowedScopes))
  ) {
    return null;
  }
  return parsed;
}

function parseCachedClientResourceScopeRows(value: string | null): readonly ClientResourceScopeRow[] | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed)
    || !parsed.every((item): item is ClientResourceScopeRow =>
      Boolean(item)
      && typeof item === "object"
      && typeof (item as ClientResourceScopeRow).clientId === "string"
      && typeof (item as ClientResourceScopeRow).resourceServerId === "string"
      && typeof (item as ClientResourceScopeRow).audience === "string"
      && Array.isArray((item as ClientResourceScopeRow).allowedScopes))
  ) {
    return null;
  }
  return parsed;
}

async function loadAdapterRowsWithAudience<Row extends ResourceScopeTableRow>(
  db: AdapterLike,
  model: string,
  clientId: string,
): Promise<ReadonlyArray<Row & { readonly audience: string }>> {
  const grants = await db.findMany<Row>({
    model,
    where: [{ field: "clientId", value: clientId }],
  });
  const rows: Array<Row & { readonly audience: string }> = [];
  await Promise.all(grants.map(async (grant) => {
    const resourceServer = await db.findOne<ResourceServerAudienceRow>({
      model: RESOURCE_SERVER_MODEL,
      where: [{ field: "id", value: grant.resourceServerId }],
    });
    if (resourceServer?.enabled) {
      rows.push(Object.assign({}, grant, { audience: resourceServer.audience }));
    }
  }));
  return rows;
}

async function loadClientGrantRows(db: GrantEnv["DB"], clientId: string): Promise<readonly ClientOrganizationGrantRow[]> {
  if (isAdapterLike(db)) {
    const rows = await loadAdapterRowsWithAudience<Omit<RawGrantRow, "audience">>(
      db,
      OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
      clientId,
    );
    return normalizeGrantRows(rows);
  }
  if (!isD1Database(db)) return [];

  const result = await db
    .prepare(
      `select g."id", g."clientId", g."organizationId", g."resourceServerId", r."audience", g."allowedScopes", g."enabled"
       from "${OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL}" g
       join "${RESOURCE_SERVER_MODEL}" r on r."id" = g."resourceServerId"
       where g."clientId" = ? and g."enabled" = ? and r."enabled" = ?
       order by g."organizationId" asc, r."audience" asc`,
    )
    .bind(clientId, 1, 1)
    .all<RawGrantRow>();

  return normalizeGrantRows(result.results ?? []);
}

async function loadClientResourceScopeRows(
  db: GrantEnv["DB"],
  clientId: string,
): Promise<readonly ClientResourceScopeRow[]> {
  if (isAdapterLike(db)) {
    const rows = await loadAdapterRowsWithAudience<Omit<RawClientResourceScopeRow, "audience">>(
      db,
      OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
      clientId,
    );
    return normalizeClientResourceScopeRows(rows);
  }
  if (!isD1Database(db)) return [];

  const result = await db
    .prepare(
      `select s."id", s."clientId", s."resourceServerId", r."audience", s."allowedScopes", s."enabled"
       from "${OAUTH_CLIENT_RESOURCE_SCOPE_MODEL}" s
       join "${RESOURCE_SERVER_MODEL}" r on r."id" = s."resourceServerId"
       where s."clientId" = ? and s."enabled" = ? and r."enabled" = ?
       order by r."audience" asc`,
    )
    .bind(clientId, 1, 1)
    .all<RawClientResourceScopeRow>();

  return normalizeClientResourceScopeRows(result.results ?? []);
}

export async function loadClientOrganizationGrants(
  env: GrantEnv,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<readonly ClientOrganizationGrantRow[]> {
  const now = Date.now();
  const memoryCached = getMemoryGrantRows(clientId, now);
  if (memoryCached) return memoryCached;

  const key = cacheKey(clientId);
  const cached = parseCachedGrantRows(
    await env.KV.get(key, { cacheTtl: authPluginConfig.oauthGrantCacheTtlSeconds }),
  );
  if (cached) {
    setMemoryGrantRows(clientId, cached, now);
    return cached;
  }

  const rows = await loadClientGrantRows(env.DB, clientId);
  setMemoryGrantRows(clientId, rows, now);
  const cacheWrite = env.KV.put(key, JSON.stringify(rows), { expirationTtl: authPluginConfig.oauthGrantCacheTtlSeconds });
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheWrite.catch(() => undefined));
  } else {
    await cacheWrite;
  }
  return rows;
}

export async function loadClientResourceScopes(
  env: GrantEnv,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<readonly ClientResourceScopeRow[]> {
  const now = Date.now();
  const memoryCached = getMemoryClientResourceScopeRows(clientId, now);
  if (memoryCached) return memoryCached;

  const key = clientResourceScopeCacheKey(clientId);
  const cached = parseCachedClientResourceScopeRows(
    await env.KV.get(key, { cacheTtl: authPluginConfig.oauthClientResourceScopeCacheTtlSeconds }),
  );
  if (cached) {
    setMemoryClientResourceScopeRows(clientId, cached, now);
    return cached;
  }

  const rows = await loadClientResourceScopeRows(env.DB, clientId);
  setMemoryClientResourceScopeRows(clientId, rows, now);
  const cacheWrite = env.KV.put(key, JSON.stringify(rows), {
    expirationTtl: authPluginConfig.oauthClientResourceScopeCacheTtlSeconds,
  });
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheWrite.catch(() => undefined));
  } else {
    await cacheWrite;
  }
  return rows;
}

export async function invalidateClientOrganizationGrants(
  env: Pick<GrantEnv, "KV">,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  memoryGrantCache.delete(clientId);
  const cacheDelete = env.KV.delete(cacheKey(clientId));
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheDelete.catch(() => undefined));
  } else {
    await cacheDelete;
  }
}

export async function invalidateClientResourceScopes(
  env: Pick<GrantEnv, "KV">,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  memoryClientResourceScopeCache.delete(clientId);
  const cacheDelete = env.KV.delete(clientResourceScopeCacheKey(clientId));
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheDelete.catch(() => undefined));
  } else {
    await cacheDelete;
  }
}

export async function assertClientOrganizationGrant(params: {
  readonly env: GrantEnv;
  readonly clientId: string;
  readonly organizationId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
}): Promise<void> {
  const grants = await loadClientOrganizationGrants(params.env, params.clientId, params.backgroundTaskRunner);
  const grant = grants.find(
    (row) =>
      row.organizationId === params.organizationId
      && row.audience === params.resource
      && row.enabled,
  );
  if (!grant) {
    throw new APIError("FORBIDDEN", { message: "OAuth client is not eligible for organization/resource" });
  }
  const allowedScopes = new Set(grant.allowedScopes);
  const denied = params.scopes.filter((scope) => !allowedScopes.has(scope));
  if (denied.length > 0) {
    throw new APIError("FORBIDDEN", { message: `OAuth client grant does not allow scopes: ${denied.join(", ")}` });
  }
}

export async function assertClientResourceScope(params: {
  readonly env: GrantEnv;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
}): Promise<void> {
  const rows = await loadClientResourceScopes(params.env, params.clientId, params.backgroundTaskRunner);
  const row = rows.find((entry) => entry.audience === params.resource && entry.enabled);
  if (!row) {
    throw new APIError("FORBIDDEN", { message: "OAuth client has no resource-scope grant" });
  }
  const allowedScopes = new Set(row.allowedScopes);
  const denied = params.scopes.filter((scope) => !allowedScopes.has(scope));
  if (denied.length > 0) {
    throw new APIError("FORBIDDEN", { message: `OAuth client resource-scope row does not allow scopes: ${denied.join(", ")}` });
  }
}

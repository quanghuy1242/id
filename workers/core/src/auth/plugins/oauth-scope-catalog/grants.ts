import { APIError } from "better-auth/api";
import { authPluginConfig } from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { BackgroundTaskRunner } from "../../types";
import type { CoreEnv } from "../../../config/env";
import {
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

type RawGrantRow = Omit<ClientOrganizationGrantRow, "allowedScopes"> & {
  readonly allowedScopes: string | readonly string[];
};

type GrantEnv = {
  readonly DB: CoreEnv["DB"] | unknown;
  readonly KV: BetterAuthKvStorage;
};

const memoryGrantCache = new Map<string, {
  readonly expiresAt: number;
  readonly rows: readonly ClientOrganizationGrantRow[];
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

function parseAllowedScopes(value: string | readonly string[]): readonly string[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value as string);
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

async function loadClientGrantRows(db: GrantEnv["DB"], clientId: string): Promise<readonly ClientOrganizationGrantRow[]> {
  if (isAdapterLike(db)) {
    const grants = await db.findMany<RawGrantRow>({
      model: OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL,
      where: [
        { field: "clientId", value: clientId },
        { field: "enabled", value: true },
      ],
    });
    const rows = await Promise.all(grants.map(async (grant) => {
      const resourceServer = await db.findOne<{ readonly id: string; readonly audience: string; readonly enabled: boolean }>({
        model: RESOURCE_SERVER_MODEL,
        where: [{ field: "id", value: grant.resourceServerId }],
      });
      if (resourceServer?.enabled) {
        return Object.assign({}, grant, { audience: resourceServer.audience });
      }
      return null;
    }));
    return normalizeGrantRows(rows.filter((row): row is RawGrantRow => row !== null));
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

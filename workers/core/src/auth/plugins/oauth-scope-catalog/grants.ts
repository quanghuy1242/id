import { APIError } from "better-auth/api";
import { authPluginConfig } from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { BackgroundTaskRunner } from "../../types";
import type { CoreEnv } from "../../../config/env";
import {
  OAUTH_CLIENT_MODEL,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";

export type ClientResourceScopeRow = {
  readonly id: string;
  readonly clientId: string;
  readonly resourceServerId: string;
  readonly audience: string;
  readonly allowedScopes: readonly string[];
  readonly enabled: boolean;
};

type RawClientResourceScopeRow = Omit<
  ClientResourceScopeRow,
  "allowedScopes"
> & {
  readonly allowedScopes: string | readonly string[];
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

const memoryCache = new Map<
  string,
  {
    readonly expiresAt: number;
    readonly rows: readonly ClientResourceScopeRow[];
  }
>();

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
  return (
    typeof value === "object" &&
    value !== null &&
    "findOne" in value &&
    "findMany" in value
  );
}

function cacheKey(clientId: string): string {
  return `${authPluginConfig.oauthClientResourceScopeCachePrefix}${clientId}`;
}

function getMemoryRows(
  clientId: string,
  now: number,
): readonly ClientResourceScopeRow[] | null {
  const cached = memoryCache.get(clientId);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    memoryCache.delete(clientId);
    return null;
  }
  return cached.rows;
}

function setMemoryRows(
  clientId: string,
  rows: readonly ClientResourceScopeRow[],
  now: number,
): void {
  memoryCache.set(clientId, {
    rows,
    expiresAt: now + OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  });
}

function parseAllowedScopes(
  value: string | readonly string[],
): readonly string[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value as string);
    if (typeof parsed === "string") return parseAllowedScopes(parsed);
    return Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function normalizeRows(
  rows: readonly RawClientResourceScopeRow[],
): readonly ClientResourceScopeRow[] {
  return rows.map((row) => ({
    ...row,
    allowedScopes: parseAllowedScopes(row.allowedScopes),
    enabled: Boolean(row.enabled),
  }));
}

function parseCachedRows(
  value: string | null,
): readonly ClientResourceScopeRow[] | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (item): item is ClientResourceScopeRow =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ClientResourceScopeRow).clientId === "string" &&
        typeof (item as ClientResourceScopeRow).resourceServerId === "string" &&
        typeof (item as ClientResourceScopeRow).audience === "string" &&
        Array.isArray((item as ClientResourceScopeRow).allowedScopes),
    )
  ) {
    return null;
  }
  return parsed;
}

async function loadRowsFromAdapter(
  db: AdapterLike,
  clientId: string,
): Promise<readonly ClientResourceScopeRow[]> {
  const scopeRows = await db.findMany<
    Omit<RawClientResourceScopeRow, "audience">
  >({
    model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
    where: [{ field: "clientId", value: clientId }],
  });
  const rows: RawClientResourceScopeRow[] = [];
  await Promise.all(
    scopeRows.map(async (scopeRow) => {
      const resourceServer = await db.findOne<ResourceServerAudienceRow>({
        model: RESOURCE_SERVER_MODEL,
        where: [{ field: "id", value: scopeRow.resourceServerId }],
      });
      if (resourceServer?.enabled) {
        rows.push(
          Object.assign({}, scopeRow, { audience: resourceServer.audience }),
        );
      }
    }),
  );
  return normalizeRows(rows);
}

async function loadRowsFromD1(
  db: D1Database,
  clientId: string,
): Promise<readonly ClientResourceScopeRow[]> {
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

  return normalizeRows(result.results ?? []);
}

async function loadRowsForClient(
  db: GrantEnv["DB"],
  clientId: string,
): Promise<readonly ClientResourceScopeRow[]> {
  if (isAdapterLike(db)) return loadRowsFromAdapter(db, clientId);
  if (isD1Database(db)) return loadRowsFromD1(db, clientId);
  return [];
}

export async function loadClientResourceScopes(
  env: GrantEnv,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<readonly ClientResourceScopeRow[]> {
  const now = Date.now();
  const memoryCached = getMemoryRows(clientId, now);
  if (memoryCached) return memoryCached;

  const key = cacheKey(clientId);
  const cached = parseCachedRows(
    await env.KV.get(key, {
      cacheTtl: authPluginConfig.oauthClientResourceScopeCacheTtlSeconds,
    }),
  );
  if (cached) {
    setMemoryRows(clientId, cached, now);
    return cached;
  }

  const rows = await loadRowsForClient(env.DB, clientId);
  setMemoryRows(clientId, rows, now);
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

export async function invalidateClientResourceScopes(
  env: Pick<GrantEnv, "KV">,
  clientId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  memoryCache.delete(clientId);
  const cacheDelete = env.KV.delete(cacheKey(clientId));
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheDelete.catch(() => undefined));
  } else {
    await cacheDelete;
  }
}

/**
 * Resolves `oauthClient.referenceId` for a given `clientId`. Used by the M2M branch
 * of `customAccessTokenClaims` to derive `org_id` without the legacy
 * `metadata.organization_id` mirror (doc 018 §5.5 D5).
 *
 * Lives in this plugin file (rather than `oauth-provider.ts`) because direct D1
 * `prepare()` calls are restricted to approved persistence companions — the
 * `architecture/no-direct-db-access` lint rule allows it here alongside the
 * existing runtime preload helpers (`scopes.ts`, `authorization-context.ts`).
 */
export async function resolveOAuthClientReferenceId(
  db: GrantEnv["DB"],
  clientId: string,
): Promise<string | null> {
  if (isAdapterLike(db)) {
    const row = await db.findOne<{ readonly referenceId?: string | null }>({
      model: OAUTH_CLIENT_MODEL,
      where: [{ field: "clientId", value: clientId }],
    });
    return row?.referenceId ?? null;
  }
  if (isD1Database(db)) {
    const result = await db
      .prepare(
        `select "referenceId" from "${OAUTH_CLIENT_MODEL}" where "clientId" = ?`,
      )
      .bind(clientId)
      .first<{ readonly referenceId?: string | null }>();
    return result?.referenceId ?? null;
  }
  return null;
}

export async function assertClientResourceScope(params: {
  readonly env: GrantEnv;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
}): Promise<void> {
  const rows = await loadClientResourceScopes(
    params.env,
    params.clientId,
    params.backgroundTaskRunner,
  );
  const row = rows.find(
    (entry) => entry.audience === params.resource && entry.enabled,
  );
  if (!row) {
    throw new APIError("FORBIDDEN", {
      message: "OAuth client has no resource-scope grant",
    });
  }
  const allowedScopes = new Set(row.allowedScopes);
  const denied = params.scopes.filter((scope) => !allowedScopes.has(scope));
  if (denied.length > 0) {
    throw new APIError("FORBIDDEN", {
      message: `OAuth client resource-scope row does not allow scopes: ${denied.join(", ")}`,
    });
  }
}

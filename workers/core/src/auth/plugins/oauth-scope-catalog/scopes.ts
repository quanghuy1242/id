import { APIError } from "better-auth/api";
import { authPluginConfig } from "../../config";
import { createMemoryTtlCache } from "../../adapters/memory-cache";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { BackgroundTaskRunner } from "../../types";
import type { CoreEnv } from "../../../config/env";
import {
  OAUTH_RESOURCE_SCOPE_MODEL,
  OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS,
  RESOURCE_SERVER_MODEL,
} from "../../../shared/constants";

export type OAuthRuntimeScopeRow = {
  readonly resourceServerId: string;
  readonly audience: string;
  readonly scope: string;
  /** True when the owning resource server has `organizationId IS NULL` (id-owned system audience). */
  readonly system: boolean;
};

export type OAuthScopeCatalogLoadResult = {
  readonly scopes: readonly string[];
  readonly rows: readonly OAuthRuntimeScopeRow[];
  readonly source: "cache" | "memory" | "store";
};

type ScopeCatalogEnv = {
  readonly DB: CoreEnv["DB"];
  readonly KV: BetterAuthKvStorage;
};

type ScopeCatalogLoader = () => Promise<readonly OAuthRuntimeScopeRow[]>;

type ScopeCacheOptions = {
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
};

const memoryScopeCatalogCache = createMemoryTtlCache<
  readonly OAuthRuntimeScopeRow[]
>(OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS);

function parseCachedScopeRows(
  value: string | null,
): readonly OAuthRuntimeScopeRow[] | null {
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
      (item): item is OAuthRuntimeScopeRow =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as OAuthRuntimeScopeRow).resourceServerId === "string" &&
        typeof (item as OAuthRuntimeScopeRow).audience === "string" &&
        typeof (item as OAuthRuntimeScopeRow).scope === "string" &&
        typeof (item as OAuthRuntimeScopeRow).system === "boolean",
    )
  ) {
    return null;
  }

  return parsed;
}

function normalizeRows(
  rows: readonly OAuthRuntimeScopeRow[],
): readonly OAuthRuntimeScopeRow[] {
  const keyed = new Map<string, OAuthRuntimeScopeRow>();
  for (const row of rows) {
    keyed.set(`${row.resourceServerId}\0${row.audience}\0${row.scope}`, row);
  }
  return [...keyed.values()].sort((left, right) =>
    `${left.audience}:${left.scope}`.localeCompare(
      `${right.audience}:${right.scope}`,
    ),
  );
}

export function uniqueRuntimeScopes(
  rows: readonly OAuthRuntimeScopeRow[],
): readonly string[] {
  return [...new Set(rows.map((row) => row.scope))].sort();
}

function protocolScopeSet(): ReadonlySet<string> {
  return new Set(authPluginConfig.oauthProtocolScopes);
}

function workspaceOnlyScopeSet(): ReadonlySet<string> {
  return new Set(authPluginConfig.workspaceOnlyScopes);
}

type RawRuntimeScopeRow = Omit<OAuthRuntimeScopeRow, "system"> & {
  readonly organizationId: string | null;
};

async function loadEnabledScopeRows(
  db: CoreEnv["DB"],
): Promise<readonly OAuthRuntimeScopeRow[]> {
  const result = await db
    .prepare(
      `select s."resourceServerId", r."audience", s."scope", r."organizationId"
       from "${OAUTH_RESOURCE_SCOPE_MODEL}" s
       join "${RESOURCE_SERVER_MODEL}" r on r."id" = s."resourceServerId"
       where s."enabled" = ? and r."enabled" = ?
       order by r."audience" asc, s."scope" asc`,
    )
    .bind(1, 1)
    .all<RawRuntimeScopeRow>();

  return (result.results ?? []).map((row) => ({
    resourceServerId: row.resourceServerId,
    audience: row.audience,
    scope: row.scope,
    system: row.organizationId === null || row.organizationId === undefined,
  }));
}

export async function loadOAuthScopesFromCache(
  kv: BetterAuthKvStorage,
  loadRows: ScopeCatalogLoader,
  options: ScopeCacheOptions = {},
): Promise<OAuthScopeCatalogLoadResult> {
  const now = Date.now();
  const memoryCached = memoryScopeCatalogCache.get(now);
  if (memoryCached) {
    return {
      rows: memoryCached,
      scopes: uniqueRuntimeScopes(memoryCached),
      source: "memory",
    };
  }

  const cached = parseCachedScopeRows(
    await kv.get(authPluginConfig.oauthScopeCacheKey, {
      cacheTtl: authPluginConfig.oauthScopeCacheTtlSeconds,
    }),
  );
  if (cached) {
    const rows = normalizeRows(cached);
    memoryScopeCatalogCache.set(rows, now);
    return { rows, scopes: uniqueRuntimeScopes(rows), source: "cache" };
  }

  const rows = normalizeRows(await loadRows());
  memoryScopeCatalogCache.set(rows, now);

  const cacheWrite = kv.put(
    authPluginConfig.oauthScopeCacheKey,
    JSON.stringify(rows),
    {
      expirationTtl: authPluginConfig.oauthScopeCacheTtlSeconds,
    },
  );

  if (options.backgroundTaskRunner) {
    options.backgroundTaskRunner.waitUntil(cacheWrite.catch(() => undefined));
  } else {
    await cacheWrite;
  }

  return { rows, scopes: uniqueRuntimeScopes(rows), source: "store" };
}

export function loadOAuthResourceScopes(
  env: ScopeCatalogEnv,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<OAuthScopeCatalogLoadResult> {
  return loadOAuthScopesFromCache(env.KV, () => loadEnabledScopeRows(env.DB), {
    backgroundTaskRunner,
  });
}

export async function invalidateOAuthResourceScopes(
  env: Pick<ScopeCatalogEnv, "KV">,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  memoryScopeCatalogCache.clear();
  const cacheDelete = env.KV.delete(authPluginConfig.oauthScopeCacheKey);
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheDelete.catch(() => undefined));
  } else {
    await cacheDelete;
  }
}

export function assertRequestedResourceScopesAllowed(params: {
  readonly catalog: { readonly scopeRows: readonly OAuthRuntimeScopeRow[] };
  readonly scopes: readonly string[];
  readonly resource?: string;
}): void {
  const protocolScopes = protocolScopeSet();
  const productScopes = params.scopes.filter(
    (scope) => !protocolScopes.has(scope),
  );
  if (productScopes.length === 0) return;
  if (!params.resource) {
    throw new APIError("BAD_REQUEST", {
      error_description:
        "resource is required for resource-server OAuth scopes",
      error: "invalid_scope",
    });
  }

  const allowedForAudience = new Set(
    params.catalog.scopeRows
      .filter((row) => row.audience === params.resource)
      .map((row) => row.scope),
  );
  const invalid = productScopes.filter(
    (scope) => !allowedForAudience.has(scope),
  );
  if (invalid.length > 0) {
    throw new APIError("BAD_REQUEST", {
      error_description: `scope not enabled for requested resource: ${invalid.join(", ")}`,
      error: "invalid_scope",
    });
  }
}

export function assertDirectShareScopes(scopes: readonly string[]): void {
  const workspaceOnlyScopes = workspaceOnlyScopeSet();
  const workspaceOnly = scopes.filter((scope) =>
    workspaceOnlyScopes.has(scope),
  );
  if (workspaceOnly.length > 0) {
    throw new APIError("BAD_REQUEST", {
      error_description: `workspace context required for scope: ${workspaceOnly.join(", ")}`,
      error: "invalid_scope",
    });
  }
}

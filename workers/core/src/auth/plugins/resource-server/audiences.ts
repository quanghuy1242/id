import { authPluginConfig } from "../../config";
import { createMemoryTtlCache } from "../../adapters/memory-cache";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { BackgroundTaskRunner } from "../../types";
import type { CoreEnv } from "../../../config/env";
import { RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS, RESOURCE_SERVER_MODEL } from "../../../shared/constants";

export type ResourceAudienceRow = {
  readonly audience: string;
  readonly enabled: boolean;
};

export type AudienceLoadResult = {
  readonly audiences: readonly string[];
  readonly source: "cache" | "memory" | "store";
};

type ResourceAudienceEnv = {
  readonly DB: CoreEnv["DB"];
  readonly KV: BetterAuthKvStorage;
};

type ResourceAudienceLoader = () => Promise<readonly ResourceAudienceRow[]>;

type AudienceCacheOptions = {
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
};

const memoryAudienceCache = createMemoryTtlCache<readonly string[]>(RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS);

function parseCachedAudiences(value: string | null): readonly string[] | null {
  if (value === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
    return null;
  }

  return parsed;
}

function enabledAudiences(rows: readonly ResourceAudienceRow[]): readonly string[] {
  return [...new Set(rows.filter((row) => row.enabled).map((row) => row.audience))].sort();
}

async function loadEnabledResourceAudienceRows(db: CoreEnv["DB"]): Promise<readonly ResourceAudienceRow[]> {
  const result = await db
    .prepare(`select "audience", "enabled" from "${RESOURCE_SERVER_MODEL}" where "enabled" = ? order by "audience" asc`)
    .bind(1)
    .all<ResourceAudienceRow>();

  return result.results ?? [];
}

export async function loadResourceAudiencesFromCache(
  kv: BetterAuthKvStorage,
  loadRows: ResourceAudienceLoader,
  options: AudienceCacheOptions = {},
): Promise<AudienceLoadResult> {
  const now = Date.now();
  const memoryCached = memoryAudienceCache.get(now);
  if (memoryCached) {
    return { audiences: memoryCached, source: "memory" };
  }

  const cached = parseCachedAudiences(
    await kv.get(authPluginConfig.resourceAudienceCacheKey, {
      cacheTtl: authPluginConfig.resourceAudienceCacheTtlSeconds,
    }),
  );
  if (cached) {
    memoryAudienceCache.set(cached, now);
    return { audiences: cached, source: "cache" };
  }

  const audiences = enabledAudiences(await loadRows());
  memoryAudienceCache.set(audiences, now);

  const cacheWrite = kv.put(authPluginConfig.resourceAudienceCacheKey, JSON.stringify(audiences), {
    expirationTtl: authPluginConfig.resourceAudienceCacheTtlSeconds,
  });

  if (options.backgroundTaskRunner) {
    // D1 validation is done; KV refill is best-effort and can run after response.
    options.backgroundTaskRunner.waitUntil(cacheWrite.catch(() => undefined));
  } else {
    await cacheWrite;
  }

  return { audiences, source: "store" };
}

/**
 * Load enabled OAuth resource audiences before constructing Better Auth for the
 * small set of OAuth routes that validate `resource`. The resourceServer table
 * is plugin-owned, so this raw D1 fallback intentionally stays in the plugin
 * runtime companion rather than infrastructure repositories.
 */
export function loadResourceServerAudiences(
  env: ResourceAudienceEnv,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<AudienceLoadResult> {
  return loadResourceAudiencesFromCache(env.KV, () => loadEnabledResourceAudienceRows(env.DB), { backgroundTaskRunner });
}

export async function invalidateResourceServerAudiences(
  env: Pick<ResourceAudienceEnv, "KV">,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  // Keep admin mutations strict: local memory is cleared immediately, then the
  // cross-isolate KV cache is invalidated for later requests in other isolates.
  memoryAudienceCache.clear();
  const cacheDelete = env.KV.delete(authPluginConfig.resourceAudienceCacheKey);
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(cacheDelete.catch(() => undefined));
  } else {
    await cacheDelete;
  }
}

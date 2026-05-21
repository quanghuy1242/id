import type { BackgroundTaskRunner } from "../types";

type CloudflareCacheStorage = CacheStorage & {
  readonly default?: Cache;
};

/** Return Cloudflare's default Worker cache when the runtime exposes it. */
export function defaultWorkerCache(): Cache | null {
  if (typeof caches === "undefined") {
    return null;
  }

  const cacheStorage: CloudflareCacheStorage = caches;
  return cacheStorage.default ?? null;
}

/** Read from the Worker cache and fail open when Cache API access fails. */
export async function matchWorkerCache(cache: Cache, key: Request): Promise<Response | undefined> {
  try {
    return await cache.match(key);
  } catch {
    return undefined;
  }
}

/**
 * Write to the Worker cache as best-effort work.
 * Production requests should pass waitUntil through BackgroundTaskRunner so
 * cache writes do not add response latency.
 */
export async function putWorkerCache(
  cache: Cache,
  key: Request,
  response: Response,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<void> {
  const task = cache.put(key, response).catch(() => undefined);
  if (backgroundTaskRunner) {
    backgroundTaskRunner.waitUntil(task);
    return;
  }

  await task;
}

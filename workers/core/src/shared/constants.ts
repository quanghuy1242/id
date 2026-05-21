/** BA model name for the resource-server plugin table. */
export const RESOURCE_SERVER_MODEL = "resourceServer" as const;

/** Warm-isolate TTL for the resource-server audience list before falling back to KV. */
export const RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS = 60_000;

/** Minimum one-time bootstrap password length for the initial admin user. */
export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

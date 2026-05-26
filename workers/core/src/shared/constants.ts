/** BA model name for the resource-server plugin table. */
export const RESOURCE_SERVER_MODEL = "resourceServer" as const;

/** BA model name for the OAuth resource-scope catalog plugin table. */
export const OAUTH_RESOURCE_SCOPE_MODEL = "oauthResourceScope" as const;

/** BA model name for per-(client, resource-server) OAuth scope-subset rows. */
export const OAUTH_CLIENT_RESOURCE_SCOPE_MODEL = "oauthClientResourceScope" as const;

/** BA model name for the OAuth client table maintained by `@better-auth/oauth-provider`. */
export const OAUTH_CLIENT_MODEL = "oauthClient" as const;

/** Warm-isolate TTL for the resource-server audience list before falling back to KV. */
export const RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS = 60_000;

/** Warm-isolate TTL for OAuth scope and grant runtime catalog lookups. */
export const OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS = 60_000;

/** Minimum one-time bootstrap password length for the initial admin user. */
export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

/** OAuth grant type constant for machine-to-machine (client_credentials) clients. */
export const OAUTH_CLIENT_GRANT_TYPE_M2M = "client_credentials" as const;

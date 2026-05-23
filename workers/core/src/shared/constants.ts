/** BA model name for the resource-server plugin table. */
export const RESOURCE_SERVER_MODEL = "resourceServer" as const;

/** BA model name for the OAuth resource-scope catalog plugin table. */
export const OAUTH_RESOURCE_SCOPE_MODEL = "oauthResourceScope" as const;

/** BA model name for org-scoped OAuth client grant plugin table. */
export const OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL = "oauthClientOrganizationGrant" as const;

/** Warm-isolate TTL for the resource-server audience list before falling back to KV. */
export const RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS = 60_000;

/** Warm-isolate TTL for OAuth scope and grant runtime catalog lookups. */
export const OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS = 60_000;

/** Minimum one-time bootstrap password length for the initial admin user. */
export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

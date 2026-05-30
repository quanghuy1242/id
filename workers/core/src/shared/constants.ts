/** BA model name for the user table. */
export const USER_MODEL = "user" as const;

/** BA model name for the member (organization membership) table. */
export const MEMBER_MODEL = "member" as const;

/** BA model name for the team table. */
export const TEAM_MODEL = "team" as const;

/** BA model name for the JWKS table. */
export const JWKS_MODEL = "jwks" as const;

/** BA model name for the resource-server plugin table. */
export const RESOURCE_SERVER_MODEL = "resourceServer" as const;

/** BA model name for the OAuth resource-scope catalog plugin table. */
export const OAUTH_RESOURCE_SCOPE_MODEL = "oauthResourceScope" as const;

/** BA model name for per-(client, resource-server) OAuth scope-subset rows. */
export const OAUTH_CLIENT_RESOURCE_SCOPE_MODEL = "oauthClientResourceScope" as const;

/** BA model name for the OAuth client table maintained by `@better-auth/oauth-provider`. */
export const OAUTH_CLIENT_MODEL = "oauthClient" as const;

/** BA model name for the session table. */
export const SESSION_MODEL = "session" as const;

/** BA model name for the OAuth access-token table. */
export const OAUTH_ACCESS_TOKEN_MODEL = "oauthAccessToken" as const;

/** BA model name for the OAuth refresh-token table. */
export const OAUTH_REFRESH_TOKEN_MODEL = "oauthRefreshToken" as const;

/** BA model name for the OAuth consent table. */
export const OAUTH_CONSENT_MODEL = "oauthConsent" as const;

/** BA model name for the admin activity-log plugin table. */
export const ADMIN_ACTIVITY_LOG_MODEL = "adminActivityLog" as const;

/** Warm-isolate TTL for the resource-server audience list before falling back to KV. */
export const RESOURCE_AUDIENCE_MEMORY_CACHE_TTL_MS = 60_000;

/** Warm-isolate TTL for OAuth scope and grant runtime catalog lookups. */
export const OAUTH_SCOPE_CATALOG_MEMORY_CACHE_TTL_MS = 60_000;

/** Minimum one-time bootstrap password length for the initial admin user. */
export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

/** Minimum one-time bootstrap token length enforced at handler entry (SEC-009). */
export const MIN_BOOTSTRAP_TOKEN_LENGTH = 20;

/** Maximum bootstrap attempts per IP within the rate limit window (SEC-002). */
export const BOOTSTRAP_RATE_LIMIT_MAX_ATTEMPTS = 5;

/** Bootstrap rate limit window in seconds (SEC-002). */
export const BOOTSTRAP_RATE_LIMIT_TTL_SECONDS = 60;

/** Bootstrap KV lock TTL in seconds for race-window prevention (SEC-007). */
export const BOOTSTRAP_LOCK_TTL_SECONDS = 30;

/** OAuth grant type constant for machine-to-machine (client_credentials) clients. */
export const OAUTH_CLIENT_GRANT_TYPE_M2M = "client_credentials" as const;

/** SCIM core User schema URN (RFC 7643 §4.1). */
export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User" as const;
/** SCIM core Group schema URN (RFC 7643 §4.2). */
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group" as const;
/** SCIM ListResponse message schema URN (RFC 7644 §3.9). */
export const SCIM_LIST_RESPONSE_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse" as const;
/** SCIM Error message schema URN (RFC 7644 §3.12). */
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error" as const;
/** SCIM ServiceProviderConfig schema URN (RFC 7643 §5). */
export const SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig" as const;
/** SCIM Schema schema URN (RFC 7643 §7). */
export const SCIM_SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema" as const;
/** SCIM ResourceType schema URN (RFC 7644 §6). */
export const SCIM_RESOURCE_TYPE_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ResourceType" as const;

/**
 * Repository-specific SCIM extension schema URI for tenant (organization) membership.
 * Returned alongside the core User schema on tenant-path User responses.
 * Classified as a repository-specific URL convention (not a SCIM-native construct).
 */
export const SCIM_TENANT_MEMBERSHIP_SCHEMA = "https://id/scim/schemas/tenant-membership" as const;

/** Virtual SCIM Group ID representing the owner/admin members of an organization. No DB row backing. */
export const SCIM_ORG_ADMINS_GROUP_ID = "org-admins" as const;

/** Maximum number of resources the SCIM filter endpoint returns in one response. */
export const SCIM_MAX_FILTER_RESULTS = 100;

/** HTTP 200 OK status code for SCIM responses. */
export const SCIM_HTTP_OK = 200;
/** HTTP 400 Bad Request status code for SCIM error responses. */
export const SCIM_HTTP_BAD_REQUEST = 400;
/** HTTP 404 Not Found status code for SCIM error responses. */
export const SCIM_HTTP_NOT_FOUND = 404;
/** HTTP 405 Method Not Allowed status code for SCIM read-only enforcement. */
export const SCIM_HTTP_METHOD_NOT_ALLOWED = 405;

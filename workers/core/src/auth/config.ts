/** Browser authorization-code access-token lifetime, in seconds. */
export const OAUTH_ACCESS_TOKEN_EXPIRES_SECONDS = 900;

/** Machine-to-machine access-token lifetime, in seconds. */
export const OAUTH_M2M_ACCESS_TOKEN_EXPIRES_SECONDS = 10_800;

/** OAuth refresh-token lifetime, in seconds. */
export const OAUTH_REFRESH_TOKEN_EXPIRES_SECONDS = 604_800;

/** Runtime OAuth catalog cache TTL, in seconds. */
export const OAUTH_RUNTIME_CATALOG_CACHE_TTL_SECONDS = 86_400;

/** JWKS signing-key rotation interval, in seconds. */
export const JWKS_ROTATION_INTERVAL_SECONDS = 86_400;

/** JWKS retired-key grace period, in seconds. */
export const JWKS_GRACE_PERIOD_SECONDS = 2_592_000;

/** Maximum team IDs allowed in an issued access-token claim. */
export const MAX_TOKEN_TEAM_IDS = 128;

/** OAuth context-selection cache TTL, in seconds. */
export const OAUTH_CONTEXT_SELECTION_TTL_SECONDS = 300;

/** Test-only scrypt cost parameter for fast password hashing checks. */
export const TEST_PASSWORD_SCRYPT_N = 64;

/** Production scrypt cost parameter for interactive login password hashing. */
export const PRODUCTION_PASSWORD_SCRYPT_N = 16_384;

/** Runtime scrypt CPU/memory cost parameter for Better Auth password hashing. */
export const PASSWORD_SCRYPT_N = process.env.VITEST ? TEST_PASSWORD_SCRYPT_N : PRODUCTION_PASSWORD_SCRYPT_N;

/** Scrypt block-size parameter for Better Auth password hashing. */
export const PASSWORD_SCRYPT_R = 16;

/** Scrypt parallelization parameter for Better Auth password hashing. */
export const PASSWORD_SCRYPT_P = 1;

/** Scrypt derived-key byte length for Better Auth password hashing. */
export const PASSWORD_SCRYPT_DK_LEN = 64;

/** Random salt byte length for Better Auth password hashing. */
export const PASSWORD_SALT_BYTES = 16;

/** Scrypt max-memory base block size, in bytes. */
export const PASSWORD_SCRYPT_MAXMEM_BLOCK_BYTES = 128;

/** Safety multiplier for Node scrypt max-memory calculation. */
export const PASSWORD_SCRYPT_MAXMEM_MULTIPLIER = 2;

export type AuthPluginConfig = {
  readonly issuerPath: string;
  readonly resourceAudienceCacheKey: string;
  readonly resourceAudienceCacheTtlSeconds: number;
  readonly oauthScopeCacheKey: string;
  readonly oauthScopeCacheTtlSeconds: number;
  readonly oauthClientResourceScopeCachePrefix: string;
  readonly oauthClientResourceScopeCacheTtlSeconds: number;
  readonly teamMembershipCachePrefix: string;
  readonly emailVerificationStoragePrefix: string;
  readonly passwordResetStoragePrefix: string;
  readonly jwksPath: string;
  readonly jwksRotationIntervalSeconds: number;
  readonly jwksGracePeriodSeconds: number;
  readonly oauthProtocolScopes: readonly string[];
  readonly bootstrapOAuthScopes: readonly string[];
  readonly oauthGrantTypes: readonly ("authorization_code" | "client_credentials" | "refresh_token")[];
  readonly directShareReferenceId: string;
  readonly workspaceOnlyScopes: readonly string[];
  readonly maxTokenTeamIds: number;
  readonly principalValidationScope: string;
  /** Slug for id-owned system resource-server audiences. */
  readonly systemResourceServerSlug: string;
  /** OAuth scope that authorizes `/api/auth/admin/oauth-clients/lookup` for M2M callers. */
  readonly systemOAuthClientPickerScope: string;
  /** OAuth scope that authorizes SCIM directory read endpoints. */
  readonly scimDirectoryScope: string;
};

export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_EXPIRES_SECONDS,
  m2mAccessTokenExpiresIn: OAUTH_M2M_ACCESS_TOKEN_EXPIRES_SECONDS,
  refreshTokenExpiresIn: OAUTH_REFRESH_TOKEN_EXPIRES_SECONDS,
} as const;

/**
 * Better Auth integration constants.
 *
 * JWKS rotation is intentionally configured here and tested against the
 * installed Better Auth JWT plugin. Rotation is lazy: signing a token after
 * `jwksRotationIntervalSeconds` creates a new key, while
 * `jwksGracePeriodSeconds` keeps retired public keys in JWKS for existing
 * tokens. Keep the JWKS route uncached at the issuer unless cache invalidation
 * is tied to key creation; otherwise fresh tokens can carry a `kid` that a
 * stale issuer-side JWKS response does not publish.
 *
 * OAuth Provider scope composition has three tiers:
 * protocol scopes are standards/OIDC scopes owned by code; bootstrap scopes
 * are id-owned operational scopes available before any resource-server rows
 * exist; catalog scopes are product/API scopes loaded from
 * `oauthResourceScope` rows and bound to a concrete resource server.
 */
export const authPluginConfig = {
  issuerPath: "/api/auth",
  resourceAudienceCacheKey: "id-resource-servers:audiences",
  resourceAudienceCacheTtlSeconds: OAUTH_RUNTIME_CATALOG_CACHE_TTL_SECONDS,
  oauthScopeCacheKey: "id-oauth-scopes:enabled",
  oauthScopeCacheTtlSeconds: OAUTH_RUNTIME_CATALOG_CACHE_TTL_SECONDS,
  oauthClientResourceScopeCachePrefix: "id-oauth-scopes:client-resource-scopes:",
  oauthClientResourceScopeCacheTtlSeconds: OAUTH_RUNTIME_CATALOG_CACHE_TTL_SECONDS,
  teamMembershipCachePrefix: "id-teams:user:",
  emailVerificationStoragePrefix: "id-email:verification:",
  passwordResetStoragePrefix: "id-email:password-reset:",
  jwksPath: "/jwks",
  jwksRotationIntervalSeconds: JWKS_ROTATION_INTERVAL_SECONDS,
  jwksGracePeriodSeconds: JWKS_GRACE_PERIOD_SECONDS,
  oauthProtocolScopes: ["openid", "profile", "email", "offline_access"],
  bootstrapOAuthScopes: ["org:read", "org:write"],
  oauthGrantTypes: ["authorization_code", "client_credentials", "refresh_token"],
  directShareReferenceId: "urn:id:oauth-context:direct-share",
  workspaceOnlyScopes: ["content:share"],
  maxTokenTeamIds: MAX_TOKEN_TEAM_IDS,
  principalValidationScope: "identity:principals:validate",
  systemResourceServerSlug: "id-system",
  systemOAuthClientPickerScope: "oauth:clients:read",
  scimDirectoryScope: "identity:directory:read",
} as const satisfies AuthPluginConfig;

/**
 * Audience URL for the SCIM directory resource server.
 * M2M callers must present a token with this audience and `identity:directory:read` scope
 * to access SCIM read endpoints.
 */
export function scimDirectoryAudience(baseUrl: string): string {
  return new URL("/scim", baseUrl).toString();
}

/**
 * Audience URL identifying id's own (`organizationId IS NULL`) system resource server.
 * Used by the OAuth client picker (`/api/auth/admin/oauth-clients/lookup`) and any other
 * id-audienced system endpoint (e.g. future SCIM reads called by RS-to-AS infra clients).
 */
export function systemResourceServerAudience(baseUrl: string): string {
  return new URL("/system", baseUrl).toString();
}

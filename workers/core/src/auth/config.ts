export type AuthPluginConfig = {
  readonly issuerPath: string;
  readonly resourceAudienceCacheKey: string;
  readonly resourceAudienceCacheTtlSeconds: number;
  readonly oauthScopeCacheKey: string;
  readonly oauthScopeCacheTtlSeconds: number;
  readonly oauthGrantCachePrefix: string;
  readonly oauthGrantCacheTtlSeconds: number;
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
  readonly principalValidationAudience: string;
  readonly principalValidationScope: string;
};

export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 900,
  m2mAccessTokenExpiresIn: 10_800,
  refreshTokenExpiresIn: 604_800,
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
  resourceAudienceCacheTtlSeconds: 86_400,
  oauthScopeCacheKey: "id-oauth-scopes:enabled",
  oauthScopeCacheTtlSeconds: 86_400,
  oauthGrantCachePrefix: "id-oauth-scopes:client-org-grants:",
  oauthGrantCacheTtlSeconds: 86_400,
  teamMembershipCachePrefix: "id-teams:user:",
  emailVerificationStoragePrefix: "id-email:verification:",
  passwordResetStoragePrefix: "id-email:password-reset:",
  jwksPath: "/jwks",
  jwksRotationIntervalSeconds: 86_400,
  jwksGracePeriodSeconds: 2_592_000,
  oauthProtocolScopes: ["openid", "profile", "email", "offline_access"],
  bootstrapOAuthScopes: ["org:read", "org:write"],
  oauthGrantTypes: ["authorization_code", "client_credentials", "refresh_token"],
  directShareReferenceId: "urn:id:oauth-context:direct-share",
  workspaceOnlyScopes: ["content:share"],
  maxTokenTeamIds: 128,
  principalValidationAudience: "https://id.quanghuy.dev/principal-validation",
  principalValidationScope: "identity:principals:validate",
} as const satisfies AuthPluginConfig;

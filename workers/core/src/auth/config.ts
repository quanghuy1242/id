export type AuthPluginConfig = {
  readonly issuerPath: string;
  readonly resourceAudienceCacheKey: string;
  readonly resourceAudienceCacheTtlSeconds: number;
  readonly emailVerificationStoragePrefix: string;
  readonly passwordResetStoragePrefix: string;
  readonly jwksPath: string;
  readonly jwksRotationIntervalSeconds: number;
  readonly jwksGracePeriodSeconds: number;
  readonly oauthScopes: readonly string[];
  readonly oauthGrantTypes: readonly ("authorization_code" | "client_credentials" | "refresh_token")[];
};

export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 10_800,
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
 */
export const authPluginConfig = {
  issuerPath: "/api/auth",
  resourceAudienceCacheKey: "id-resource-servers:audiences",
  resourceAudienceCacheTtlSeconds: 86_400,
  emailVerificationStoragePrefix: "id-email:verification:",
  passwordResetStoragePrefix: "id-email:password-reset:",
  jwksPath: "/jwks",
  jwksRotationIntervalSeconds: 86_400,
  jwksGracePeriodSeconds: 2_592_000,
  oauthScopes: ["openid", "profile", "email", "offline_access", "org:read", "org:write", "api:read", "api:write"],
  oauthGrantTypes: ["authorization_code", "client_credentials", "refresh_token"],
} as const satisfies AuthPluginConfig;

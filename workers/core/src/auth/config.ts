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

export const authRateLimitConfig = {
  enabled: true,
  storage: "secondary-storage",
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email": { window: 60, max: 10 },
    "/sign-up/email": { window: 60, max: 3 },
    "/request-password-reset": { window: 60, max: 3 },
    "/send-verification-email": { window: 60, max: 3 },
    "/oauth2/token": { window: 60, max: 20 },
    "/oauth2/authorize": { window: 60, max: 60 },
    "/oauth2/introspect": { window: 60, max: 30 },
    "/oauth2/revoke": { window: 60, max: 30 },
    "/oauth2/create-client": { window: 60, max: 10 },
    "/admin/oauth2/create-client": { window: 60, max: 10 },
  },
} as const;

export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 10_800,
  m2mAccessTokenExpiresIn: 10_800,
  refreshTokenExpiresIn: 604_800,
} as const;

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

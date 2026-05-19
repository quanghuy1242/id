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
  readonly oauthSignUpPage: string;
  readonly oauthSelectAccountPage: string;
  readonly oauthOrgSelectionPage: string;
};

export const authPluginConfig = {
  issuerPath: "/api/auth",
  resourceAudienceCacheKey: "id-resource-servers:audiences",
  resourceAudienceCacheTtlSeconds: 60,
  emailVerificationStoragePrefix: "id-email:verification:",
  passwordResetStoragePrefix: "id-email:password-reset:",
  jwksPath: "/jwks",
  jwksRotationIntervalSeconds: 86_400,
  jwksGracePeriodSeconds: 2_592_000,
  oauthScopes: ["openid", "profile", "email", "offline_access", "org:read", "org:write", "api:read", "api:write"],
  oauthGrantTypes: ["authorization_code", "client_credentials", "refresh_token"],
  oauthSignUpPage: "/admin/sign-up",
  oauthSelectAccountPage: "/admin/select-account",
  oauthOrgSelectionPage: "/admin/select-organization",
} as const satisfies AuthPluginConfig;

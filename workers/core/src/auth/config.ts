export type AuthPluginConfig = {
  readonly issuerPath: string;
  readonly resourceAudienceCacheKey: string;
  readonly resourceAudienceCacheTtlSeconds: number;
  readonly jwksPath: string;
  readonly jwksRotationIntervalSeconds: number;
  readonly jwksGracePeriodSeconds: number;
};

export const authPluginConfig = {
  issuerPath: "/api/auth",
  resourceAudienceCacheKey: "id-resource-servers:audiences",
  resourceAudienceCacheTtlSeconds: 60,
  jwksPath: "/jwks",
  jwksRotationIntervalSeconds: 86_400,
  jwksGracePeriodSeconds: 2_592_000,
} as const satisfies AuthPluginConfig;

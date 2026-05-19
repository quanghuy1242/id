import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, organization } from "better-auth/plugins";
import { invalidateResourceAudiences } from "./audiences";
import { authPluginConfig } from "./config";
import { idResourceServer } from "./plugins/resource-server";
import { kvSecondaryStorage, type BetterAuthKvStorage } from "./secondary-storage";
import type { CoreEnv } from "../config/env";

export function getAuth(env: CoreEnv, validAudiences: readonly string[] = []) {
  return betterAuth(getAuthOptions(env, validAudiences));
}

type AuthOptionsEnv = Omit<CoreEnv, "DB" | "KV"> & {
  readonly DB: BetterAuthOptions["database"];
  readonly KV: BetterAuthKvStorage;
};

export function getAuthOptions(env: AuthOptionsEnv, validAudiences: readonly string[] = []) {
  return {
    baseURL: env.BETTER_AUTH_URL,
    basePath: authPluginConfig.issuerPath,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    secondaryStorage: kvSecondaryStorage(env.KV),
    session: {
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    user: {
      additionalFields: {
        platformRole: {
          type: "string",
          required: false,
          defaultValue: "member",
        },
      },
    },
    plugins: [
      organization(),
      admin(),
      jwt({
        jwks: {
          jwksPath: authPluginConfig.jwksPath,
          rotationInterval: authPluginConfig.jwksRotationIntervalSeconds,
          gracePeriod: authPluginConfig.jwksGracePeriodSeconds,
        },
      }),
      oauthProvider({
        loginPage: "/admin/login",
        consentPage: "/admin/consent",
        validAudiences: [...validAudiences],
        customAccessTokenClaims: ({ resource }) => ({
          aud: resource,
        }),
        customTokenResponseFields: ({ grantType }) => ({
          grant_type: grantType,
        }),
      }),
      idResourceServer({
        invalidateAudienceCache: () => invalidateResourceAudiences(env.KV),
      }),
    ],
  } satisfies BetterAuthOptions;
}

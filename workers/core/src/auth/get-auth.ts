import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, organization } from "better-auth/plugins";

import { hasAdminAccess, hasOrganizationAccess, type AdminDbAdapter } from "./admin/access";
import { invalidateResourceAudiences } from "./adapters/audiences";
import { authPluginConfig } from "./config";
import { idResourceServer } from "./plugins/resource-server";
import {
  sendAuthEmail,
  type AuthEmailSender,
  type BackgroundTaskRunner,
} from "./adapters/auth-email";
import { kvSecondaryStorage, type BetterAuthKvStorage } from "./adapters/secondary-storage";
import { createSenderAuthEmailSender } from "./adapters/sender-email";
import type { CoreEnv } from "../config/env";

export type AuthRuntimeOptions = {
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
  readonly emailSender?: AuthEmailSender;
};

export function getAuth(
  env: CoreEnv,
  validAudiences: readonly string[] = [],
  runtime: AuthRuntimeOptions = {},
) {
  return betterAuth(getAuthOptions(env, validAudiences, runtime));
}

type AuthOptionsEnv = Omit<CoreEnv, "DB" | "KV"> & {
  readonly DB: BetterAuthOptions["database"];
  readonly KV: BetterAuthKvStorage;
};

function createAuthEmailSender(env: AuthOptionsEnv): AuthEmailSender {
  return createSenderAuthEmailSender({
    apiToken: env.SENDER_API_TOKEN ?? "",
    fromEmail: env.EMAIL_FROM ?? "",
    fromName: env.EMAIL_FROM_NAME ?? "id",
  });
}

function isPlatformAdmin(role: unknown): boolean {
  return role === "admin";
}

export function getAuthOptions(
  env: AuthOptionsEnv,
  validAudiences: readonly string[] = [],
  runtime: AuthRuntimeOptions = {},
) {
  const emailSender = runtime.emailSender ?? createAuthEmailSender(env);

  return {
    baseURL: env.BETTER_AUTH_URL,
    basePath: authPluginConfig.issuerPath,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    secondaryStorage: kvSecondaryStorage(env.KV),
    advanced: {
      cookiePrefix: "id-auth",
      crossSubDomainCookies: {
        enabled: Boolean(env.BETTER_AUTH_COOKIE_DOMAIN),
        domain: env.BETTER_AUTH_COOKIE_DOMAIN,
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    rateLimit: {
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
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendAuthEmail(emailSender, { kind: "verification", to: user.email, url }, runtime.backgroundTaskRunner),
    },
    session: {
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        sendAuthEmail(emailSender, { kind: "password-reset", to: user.email, url }, runtime.backgroundTaskRunner),
    },
    plugins: [
      organization(),
      admin({
        adminRoles: ["admin"],
        defaultRole: "user",
      }),
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
        accessTokenExpiresIn: 10_800,
        m2mAccessTokenExpiresIn: 10_800,
        refreshTokenExpiresIn: 604_800,
        scopes: [...authPluginConfig.oauthScopes],
        grantTypes: [...authPluginConfig.oauthGrantTypes],
        validAudiences: [...validAudiences],
        clientReference: ({ session }) => {
          const activeOrganizationId = session?.activeOrganizationId;
          return typeof activeOrganizationId === "string" ? activeOrganizationId : undefined;
        },
        clientPrivileges: async ({ user, action }) => {
          if (!user) {
            return false;
          }

          if (action === "read" || action === "list") {
            return isPlatformAdmin(user.role);
          }

          return isPlatformAdmin(user.role);
        },
        customAccessTokenClaims: ({ resource, referenceId, scopes, user }) => ({
          aud: resource,
          org_id: referenceId,
          scope: scopes.join(" "),
          sub: user?.id,
        }),
        customTokenResponseFields: ({ grantType }) => ({
          grant_type: grantType,
        }),
      }),
      idResourceServer({
        invalidateAudienceCache: () => invalidateResourceAudiences(env.KV),
        authorize: async (organizationId, userId, role, adapter) =>
          (await hasAdminAccess(adapter as AdminDbAdapter, userId, role)) ||
          (await hasOrganizationAccess(adapter as AdminDbAdapter, userId, organizationId)),
      }),
    ],
  } satisfies BetterAuthOptions;
}

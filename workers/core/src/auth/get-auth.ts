import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";

import { hasOrganizationAccess, isPlatformAdmin, type AdminDbAdapter } from "./policies/access";
import { createAuthEmailSender, sendAuthEmail } from "./adapters/auth-email";
import { hashPassword, verifyPassword } from "./adapters/password";
import { authPluginConfig, oauthTokenLifetimeConfig } from "./config";
import { invalidateResourceServerAudiences, loadResourceServerAudiences } from "./plugins/resource-server/audiences";
import { idResourceServer } from "./plugins/resource-server";
import { kvSecondaryStorage } from "./adapters/secondary-storage";
import type { AuthOptionsEnv, AuthRuntimeOptions } from "./types";
import type { CoreEnv } from "../config/env";

export function getAuth(
  env: CoreEnv,
  validAudiences: readonly string[] = [],
  runtime: AuthRuntimeOptions = {},
) {
  return betterAuth(getAuthOptions(env, validAudiences, runtime));
}

export type CreateAuthForRequestOptions = {
  readonly loadResourceAudiences?: boolean;
};

/**
 * OAuth Provider accepts validAudiences only when the plugin is constructed.
 * Loading them for every Better Auth request makes public routes like JWKS and
 * discovery pay a KV/D1 cost they do not need, so only resource-validating
 * OAuth endpoints opt into the pre-auth audience load.
 */
export function authPathNeedsResourceAudiences(pathname: string): boolean {
  const authPath = pathname.startsWith(authPluginConfig.issuerPath)
    ? pathname.slice(authPluginConfig.issuerPath.length)
    : pathname;

  return authPath === "/oauth2/authorize" || authPath === "/oauth2/token";
}

export async function createAuthForRequest(
  env: CoreEnv,
  runtime: AuthRuntimeOptions = {},
  options: CreateAuthForRequestOptions = {},
) {
  if (!options.loadResourceAudiences) {
    return getAuth(env, [], runtime);
  }

  const loaded = await loadResourceServerAudiences(env, runtime.backgroundTaskRunner);
  return getAuth(env, loaded.audiences, runtime);
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
      // Edge rules own throttling; BA counters would add per-request storage I/O.
      enabled: false,
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
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
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
        loginPage: "/login",
        consentPage: "/consent",
        ...oauthTokenLifetimeConfig,
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
        invalidateAudienceCache: () => invalidateResourceServerAudiences(env),
        authorize: async (organizationId, userId, role, adapter) =>
          isPlatformAdmin(role) || (await hasOrganizationAccess(adapter as AdminDbAdapter, userId, organizationId)),
      }),
      openAPI(),
    ],
  } satisfies BetterAuthOptions;
}

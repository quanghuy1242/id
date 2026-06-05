import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";

import {
  hasOrganizationAccess,
  isPlatformAdmin,
  type AdminDbAdapter,
} from "./policies/access";
import { createAuthEmailSender, sendAuthEmail } from "./adapters/auth-email";
import { hashPassword, verifyPassword } from "./adapters/password";
import { authPluginConfig, systemResourceServerAudience } from "./config";
import {
  invalidateResourceServerAudiences,
  loadResourceServerAudiences,
} from "./plugins/resource-server/audiences";
import { idResourceServer } from "./plugins/resource-server";
import { idOAuthScopeCatalog } from "./plugins/oauth-scope-catalog";
import { idOAuthM2MBridge } from "./plugins/oauth-m2m-bridge";
import { idAdminSignInGuard } from "./plugins/admin-sign-in-guard";
import { idScimDirectory } from "./plugins/scim-directory";
import { idOAuthClientPicker } from "./plugins/oauth-client-picker";
import { idAdminAudit } from "./plugins/admin-audit";
import { idAdminActivityLog } from "./plugins/admin-activity-log";
import { idConsoleScopes } from "./plugins/console-scopes";
import { idAccountCenter } from "./plugins/account-center";
import { idRegistration } from "./plugins/registration";
import { invalidateClientResourceScopes } from "./plugins/oauth-scope-catalog/grants";
import {
  invalidateOAuthResourceScopes,
  loadOAuthResourceScopes,
} from "./plugins/oauth-scope-catalog/scopes";
import { kvSecondaryStorage } from "./adapters/secondary-storage";
import {
  authPathNeedsOAuthRuntimeCatalog,
  createOAuthProviderPlugin,
  emptyOAuthRuntimeCatalog,
} from "./oauth-provider";
import type {
  AuthOptionsEnv,
  AuthRuntimeOptions,
  OAuthRuntimeCatalog,
} from "./types";
import type { CoreEnv } from "../config/env";

export function getAuth(
  env: CoreEnv,
  catalog: OAuthRuntimeCatalog = emptyOAuthRuntimeCatalog,
  runtime: AuthRuntimeOptions = {},
) {
  return betterAuth(getAuthOptions(env, catalog, runtime));
}

export type CreateAuthForRequestOptions = {
  readonly loadResourceAudiences?: boolean;
};

export async function createAuthForRequest(
  env: CoreEnv,
  runtime: AuthRuntimeOptions = {},
  options: CreateAuthForRequestOptions = {},
) {
  if (!options.loadResourceAudiences) {
    return getAuth(env, emptyOAuthRuntimeCatalog, runtime);
  }

  const [audiences, scopes] = await Promise.all([
    loadResourceServerAudiences(env, runtime.backgroundTaskRunner),
    loadOAuthResourceScopes(env, runtime.backgroundTaskRunner),
  ]);
  return getAuth(
    env,
    {
      validAudiences: audiences.audiences,
      scopes: scopes.scopes,
      scopeRows: scopes.rows,
    },
    runtime,
  );
}

export function getAuthOptions(
  env: AuthOptionsEnv,
  catalog: OAuthRuntimeCatalog = emptyOAuthRuntimeCatalog,
  runtime: AuthRuntimeOptions = {},
) {
  const emailSender = runtime.emailSender ?? createAuthEmailSender(env);
  const issuer = `${env.BETTER_AUTH_URL}${authPluginConfig.issuerPath}`;

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
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    rateLimit: {
      // BA rate counters add per-request storage I/O. Route-level throttling
      // is handled at the edge via Cloudflare WAF rules. workers_dev: false
      // (per SEC-003) closes the workers.dev bypass, which is the primary
      // vector for unauthenticated rate-limit evasion.
      enabled: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendAuthEmail(
          emailSender,
          { kind: "verification", to: user.email, url },
          runtime.backgroundTaskRunner,
        ),
    },
    session: {
      storeSessionInDatabase: true,
      deferSessionRefresh: true,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        sendAuthEmail(
          emailSender,
          { kind: "password-reset", to: user.email, url },
          runtime.backgroundTaskRunner,
        ),
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    plugins: [
      organization({ teams: { enabled: true } }),
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
      idOAuthM2MBridge(),
      idRegistration({
        authorize: async (organizationId, userId, role, adapter) =>
          organizationId === null || organizationId === undefined
            ? isPlatformAdmin(role)
            : isPlatformAdmin(role) ||
              (await hasOrganizationAccess(
                adapter as AdminDbAdapter,
                userId,
                organizationId,
              )),
      }),
      idAdminSignInGuard({
        sendEmail: ({ to, otp }) =>
          sendAuthEmail(emailSender, { kind: "admin-otp", to, otp }),
        kv: env.KV,
        otpHmacSecret: env.BETTER_AUTH_SECRET,
        isPlatformAdmin,
      }),
      createOAuthProviderPlugin(env, catalog, runtime, isPlatformAdmin),
      idResourceServer({
        invalidateAudienceCache: () =>
          invalidateResourceServerAudiences(env, runtime.backgroundTaskRunner),
        authorize: async (organizationId, userId, role, adapter) =>
          organizationId === null || organizationId === undefined
            ? isPlatformAdmin(role)
            : isPlatformAdmin(role) ||
              (await hasOrganizationAccess(
                adapter as AdminDbAdapter,
                userId,
                organizationId,
              )),
      }),
      idOAuthScopeCatalog({
        invalidateScopeCache: () =>
          invalidateOAuthResourceScopes(env, runtime.backgroundTaskRunner),
        invalidateClientResourceScopeCache: (clientId) =>
          invalidateClientResourceScopes(
            env,
            clientId,
            runtime.backgroundTaskRunner,
          ),
        authorize: async (organizationId, userId, role, adapter) =>
          organizationId === null || organizationId === undefined
            ? isPlatformAdmin(role)
            : isPlatformAdmin(role) ||
              (await hasOrganizationAccess(
                adapter as AdminDbAdapter,
                userId,
                organizationId,
              )),
      }),
      idOAuthClientPicker({ issuer }),
      idAdminAudit({
        authorize: (role) => isPlatformAdmin(role),
        jwksGracePeriodMs: authPluginConfig.jwksGracePeriodMs,
      }),
      idAdminActivityLog({
        authorize: (role) => isPlatformAdmin(role),
      }),
      idConsoleScopes({
        isPlatformAdmin,
      }),
      idAccountCenter({
        isPlatformAdmin,
      }),
      idScimDirectory({
        issuer,
        audience: systemResourceServerAudience(env.BETTER_AUTH_URL),
      }),
      openAPI(),
    ],
  } satisfies BetterAuthOptions;
}

export {
  authPathNeedsOAuthRuntimeCatalog,
  authPathNeedsOAuthRuntimeCatalog as authPathNeedsResourceAudiences,
};

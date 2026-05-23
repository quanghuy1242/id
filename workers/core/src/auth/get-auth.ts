import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";

import { hasOrganizationAccess, isPlatformAdmin, type AdminDbAdapter } from "./policies/access";
import { createAuthEmailSender, sendAuthEmail } from "./adapters/auth-email";
import { hashPassword, verifyPassword } from "./adapters/password";
import { authPluginConfig } from "./config";
import { invalidateResourceServerAudiences, loadResourceServerAudiences } from "./plugins/resource-server/audiences";
import { idResourceServer } from "./plugins/resource-server";
import { idOAuthScopeCatalog } from "./plugins/oauth-scope-catalog";
import { idPrincipalValidation } from "./plugins/principal-validation";
import { invalidateClientOrganizationGrants } from "./plugins/oauth-scope-catalog/grants";
import { invalidateOAuthResourceScopes, loadOAuthResourceScopes } from "./plugins/oauth-scope-catalog/scopes";
import { kvSecondaryStorage } from "./adapters/secondary-storage";
import {
  authPathNeedsOAuthRuntimeCatalog,
  createOAuthProviderPlugin,
  emptyOAuthRuntimeCatalog,
  principalValidationAudience,
} from "./oauth-provider";
import type { AuthOptionsEnv, AuthRuntimeOptions, OAuthRuntimeCatalog } from "./types";
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
  const validationAudience = principalValidationAudience(env.BETTER_AUTH_URL);

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
      createOAuthProviderPlugin(env, catalog, runtime, validationAudience, isPlatformAdmin),
      idResourceServer({
        invalidateAudienceCache: () => invalidateResourceServerAudiences(env, runtime.backgroundTaskRunner),
        authorize: async (organizationId, userId, role, adapter) =>
          isPlatformAdmin(role) || (await hasOrganizationAccess(adapter as AdminDbAdapter, userId, organizationId)),
      }),
      idOAuthScopeCatalog({
        invalidateScopeCache: () => invalidateOAuthResourceScopes(env, runtime.backgroundTaskRunner),
        invalidateGrantCache: (clientId) => invalidateClientOrganizationGrants(env, clientId, runtime.backgroundTaskRunner),
        authorize: async (organizationId, userId, role, adapter) =>
          isPlatformAdmin(role) || (await hasOrganizationAccess(adapter as AdminDbAdapter, userId, organizationId)),
      }),
      idPrincipalValidation({
        issuer: `${env.BETTER_AUTH_URL}${authPluginConfig.issuerPath}`,
        audience: validationAudience,
        scope: authPluginConfig.principalValidationScope,
      }),
      openAPI(),
    ],
  } satisfies BetterAuthOptions;
}

export { authPathNeedsOAuthRuntimeCatalog, authPathNeedsOAuthRuntimeCatalog as authPathNeedsResourceAudiences };

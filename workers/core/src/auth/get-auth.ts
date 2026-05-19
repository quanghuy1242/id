import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, jwt, organization } from "better-auth/plugins";
import { hasAdminAccess, hasOrganizationAccess } from "./admin/access";
import { invalidateResourceAudiences } from "./adapters/audiences";
import { authPluginConfig } from "./config";
import { idResourceServer } from "./plugins/resource-server";
import { kvSecondaryStorage, type BetterAuthKvStorage } from "./adapters/secondary-storage";
import { storePasswordResetEmailLink, storeVerificationEmailLink } from "./adapters/storage-email";
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
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url, token }) =>
        storeVerificationEmailLink(env.KV, { email: user.email, url, token }),
    },
    session: {
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url, token }) =>
        storePasswordResetEmailLink(env.KV, { email: user.email, url, token }),
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
        signup: {
          page: authPluginConfig.oauthSignUpPage,
        },
        selectAccount: {
          page: authPluginConfig.oauthSelectAccountPage,
          shouldRedirect: () => false,
        },
        postLogin: {
          page: authPluginConfig.oauthOrgSelectionPage,
          consentReferenceId: ({ session }) => {
            const activeOrganizationId = session.activeOrganizationId;
            return typeof activeOrganizationId === "string" ? activeOrganizationId : undefined;
          },
          shouldRedirect: ({ scopes, session }) =>
            scopes.some((scope) => scope.startsWith("org:")) && typeof session.activeOrganizationId !== "string",
        },
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
            return true;
          }

          const platformRole = typeof user.platformRole === "string" ? user.platformRole : undefined;
          return platformRole === "admin" || platformRole === "superadmin";
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
        authorize: async ({ organizationId, session, adapter }) =>
          hasAdminAccess(adapter, session.user.id, session.user.platformRole) ||
          hasOrganizationAccess(adapter, session.user.id, organizationId),
      }),
    ],
  } satisfies BetterAuthOptions;
}

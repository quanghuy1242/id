import { oauthProvider } from "@better-auth/oauth-provider";
import { authPluginConfig, oauthTokenLifetimeConfig } from "./config";
import { assertClientOrganizationGrant } from "./plugins/oauth-scope-catalog/grants";
import {
  assertDirectShareScopes,
  assertRequestedResourceScopesAllowed,
} from "./plugins/oauth-scope-catalog/scopes";
import {
  assertTeamIdsWithinTokenLimit,
  assertUserBelongsToOrganization,
  loadUserTeamIdsForOrganization,
} from "./plugins/oauth-scope-catalog/authorization-context";
import type { AuthOptionsEnv, AuthRuntimeOptions, OAuthRuntimeCatalog } from "./types";

export const emptyOAuthRuntimeCatalog: OAuthRuntimeCatalog = {
  validAudiences: [],
  scopes: [],
  scopeRows: [],
};

function authorizationSelectionKey(sessionId: string): string {
  return `id-oauth-context:${sessionId}`;
}

function protocolScopeSet(): ReadonlySet<string> {
  return new Set(authPluginConfig.oauthProtocolScopes);
}

function hasProductScope(scopes: readonly string[]): boolean {
  const protocolScopes = protocolScopeSet();
  return scopes.some((scope) => !protocolScopes.has(scope));
}

function roleValue(role: unknown): string | null | undefined {
  return typeof role === "string" || role === null || role === undefined ? role : undefined;
}

export function principalValidationAudience(baseUrl: string): string {
  return new URL("/principal-validation", baseUrl).toString();
}

/**
 * OAuth Provider validates dynamic audiences and scopes when constructed.
 * Only routes that need those checks should pay the runtime catalog preload.
 */
export function authPathNeedsOAuthRuntimeCatalog(pathname: string): boolean {
  const authPath = pathname.startsWith(authPluginConfig.issuerPath)
    ? pathname.slice(authPluginConfig.issuerPath.length)
    : pathname;

  return authPath === "/oauth2/authorize"
    || authPath === "/oauth2/token"
    || authPath === "/oauth2/create-client"
    || authPath === "/oauth2/update-client";
}

export function createOAuthProviderPlugin(
  env: AuthOptionsEnv,
  catalog: OAuthRuntimeCatalog,
  runtime: AuthRuntimeOptions,
  validationAudience: string,
  canManageOAuthClients: (role: string | null | undefined) => boolean,
) {
  return oauthProvider({
    loginPage: "/login",
    consentPage: "/consent",
    silenceWarnings: {
      oauthAuthServerConfig: true,
      openidConfig: true,
    },
    ...oauthTokenLifetimeConfig,
    scopes: [
      ...authPluginConfig.oauthProtocolScopes,
      ...authPluginConfig.bootstrapOAuthScopes,
      ...catalog.scopes,
    ],
    grantTypes: [...authPluginConfig.oauthGrantTypes],
    validAudiences: [...catalog.validAudiences, validationAudience],
    postLogin: {
      page: "/select-authorization-context",
      shouldRedirect: async ({ headers, scopes, session }) => {
        if (!hasProductScope(scopes)) return false;
        const selectedContext = headers.get("x-id-oauth-context");
        if (!selectedContext) return true;
        await env.KV.put(authorizationSelectionKey(session.id), selectedContext, { expirationTtl: 300 });
        return false;
      },
      consentReferenceId: async ({ session, scopes }) => {
        if (!hasProductScope(scopes)) return undefined;
        const selectedContext = await env.KV.get(authorizationSelectionKey(session.id));
        if (selectedContext === "direct-share") {
          return authPluginConfig.directShareReferenceId;
        }
        if (selectedContext?.startsWith("workspace:")) {
          return selectedContext.slice("workspace:".length);
        }
        throw new Error("OAuth authorization context was not selected");
      },
    },
    clientPrivileges: async ({ user, action }) => {
      if (!user) return false;
      if (action === "read" || action === "list") return canManageOAuthClients(roleValue(user.role));
      return canManageOAuthClients(roleValue(user.role));
    },
    customAccessTokenClaims: async ({ resource, referenceId, scopes, user, metadata }) => {
      assertRequestedResourceScopesAllowed({ catalog, scopes, resource });

      if (user) {
        if (referenceId === authPluginConfig.directShareReferenceId) {
          assertDirectShareScopes(scopes);
          return { aud: resource, sub: user.id, team_ids: [] };
        }

        if (!referenceId) {
          if (hasProductScope(scopes)) {
            throw new Error("Resource API scopes require an explicit authorization context");
          }
          return { aud: resource, sub: user.id };
        }

        await assertUserBelongsToOrganization(env, user.id, referenceId);
        const teamIds = await loadUserTeamIdsForOrganization(env, user.id, referenceId);
        assertTeamIdsWithinTokenLimit(teamIds);
        return { aud: resource, org_id: referenceId, sub: user.id, team_ids: teamIds };
      }

      const clientId = typeof metadata?.id_client_id === "string" ? metadata.id_client_id : undefined;
      const organizationId = typeof metadata?.organization_id === "string" ? metadata.organization_id : undefined;
      if (clientId && organizationId && resource) {
        await assertClientOrganizationGrant({
          env,
          clientId,
          organizationId,
          resource,
          scopes: scopes.filter((scope) => !protocolScopeSet().has(scope)),
          backgroundTaskRunner: runtime.backgroundTaskRunner,
        });
        return { aud: resource, client_id: clientId, org_id: organizationId };
      }

      return { aud: resource };
    },
    customTokenResponseFields: ({ grantType }) => ({
      grant_type: grantType,
    }),
  });
}

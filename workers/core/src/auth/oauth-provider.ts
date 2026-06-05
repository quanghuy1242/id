import { APIError } from "better-auth/api";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  authPluginConfig,
  OAUTH_CONTEXT_SELECTION_TTL_SECONDS,
  oauthTokenLifetimeConfig,
} from "./config";
import {
  assertClientResourceScope,
  resolveOAuthClientReferenceId,
} from "./plugins/oauth-scope-catalog/grants";
import {
  assertDirectShareScopes,
  assertRequestedResourceScopesAllowed,
} from "./plugins/oauth-scope-catalog/scopes";
import {
  assertTeamIdsWithinTokenLimit,
  assertUserBelongsToOrganization,
  canManageOrganizationOAuthClients,
  loadUserTeamIdsForOrganization,
} from "./plugins/oauth-scope-catalog/authorization-context";
import type {
  AuthOptionsEnv,
  AuthRuntimeOptions,
  OAuthRuntimeCatalog,
} from "./types";

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
  return typeof role === "string" || role === null || role === undefined
    ? role
    : undefined;
}

/**
 * OAuth Provider validates dynamic audiences and scopes when constructed.
 * Only routes that need those checks should pay the runtime catalog preload.
 */
export function authPathNeedsOAuthRuntimeCatalog(pathname: string): boolean {
  const authPath = pathname.startsWith(authPluginConfig.issuerPath)
    ? pathname.slice(authPluginConfig.issuerPath.length)
    : pathname;

  return (
    authPath === "/oauth2/authorize" ||
    authPath === "/oauth2/token" ||
    authPath === "/oauth2/create-client" ||
    authPath === "/oauth2/update-client"
  );
}

function audienceIsSystem(
  catalog: OAuthRuntimeCatalog,
  resource: string,
): boolean | undefined {
  for (const row of catalog.scopeRows) {
    if (row.audience === resource) return row.system;
  }
  return undefined;
}

export function createOAuthProviderPlugin(
  env: AuthOptionsEnv,
  catalog: OAuthRuntimeCatalog,
  runtime: AuthRuntimeOptions,
  canManageOAuthClients: (role: string | null | undefined) => boolean,
) {
  return oauthProvider({
    loginPage: "/login",
    signup: {
      page: "/register",
    },
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
    validAudiences: [...catalog.validAudiences],
    postLogin: {
      page: "/select-authorization-context",
      shouldRedirect: async ({ headers, scopes, session }) => {
        if (!hasProductScope(scopes)) return false;
        const selectedContext = headers.get("x-id-oauth-context");
        if (!selectedContext) return true;
        await env.KV.put(
          authorizationSelectionKey(session.id),
          selectedContext,
          {
            expirationTtl: OAUTH_CONTEXT_SELECTION_TTL_SECONDS,
          },
        );
        return false;
      },
      consentReferenceId: async ({ session, scopes }) => {
        if (!hasProductScope(scopes)) return undefined;
        const selectedContext = await env.KV.get(
          authorizationSelectionKey(session.id),
        );
        if (selectedContext === "direct-share") {
          return authPluginConfig.directShareReferenceId;
        }
        if (selectedContext?.startsWith("workspace:")) {
          return selectedContext.slice("workspace:".length);
        }
        throw new Error("OAuth authorization context was not selected");
      },
    },
    clientReference: async ({ session }) =>
      typeof session?.activeOrganizationId === "string"
        ? session.activeOrganizationId
        : undefined,
    clientPrivileges: async ({ user, session, action }) => {
      if (!user) return false;
      if (canManageOAuthClients(roleValue(user.role))) return true;
      const activeOrganizationId =
        typeof session?.activeOrganizationId === "string"
          ? session.activeOrganizationId
          : undefined;
      if (!activeOrganizationId) return false;
      const hasOrgAccess = await canManageOrganizationOAuthClients(
        env,
        user.id,
        activeOrganizationId,
      );
      if (!hasOrgAccess) return false;
      return (
        action === "create" ||
        action === "read" ||
        action === "list" ||
        action === "update"
      );
    },
    customAccessTokenClaims: async ({
      resource,
      referenceId,
      scopes,
      user,
      metadata,
    }) => {
      assertRequestedResourceScopesAllowed({ catalog, scopes, resource });

      if (user) {
        if (referenceId === authPluginConfig.directShareReferenceId) {
          assertDirectShareScopes(scopes);
          return { aud: resource, sub: user.id, team_ids: [] };
        }

        if (!referenceId) {
          if (hasProductScope(scopes)) {
            throw new Error(
              "Resource API scopes require an explicit authorization context",
            );
          }
          return { aud: resource, sub: user.id };
        }

        await assertUserBelongsToOrganization(env, user.id, referenceId);
        const teamIds = await loadUserTeamIdsForOrganization(
          env,
          user.id,
          referenceId,
        );
        assertTeamIdsWithinTokenLimit(teamIds);
        return {
          aud: resource,
          org_id: referenceId,
          sub: user.id,
          team_ids: teamIds,
        };
      }

      // BA 1.6.11 exposes metadata, not the M2M client row; doc 018 §5.5 documents this bridge.
      const productScopes = scopes.filter(
        (scope) => !protocolScopeSet().has(scope),
      );
      const clientIdMirror =
        typeof metadata?.id_client_id === "string"
          ? metadata.id_client_id
          : undefined;

      if (productScopes.length === 0) {
        // Pure protocol scopes (openid/profile/email/etc.) — no resource binding required.
        return clientIdMirror
          ? { aud: resource, client_id: clientIdMirror }
          : { aud: resource };
      }

      if (!clientIdMirror) {
        throw new APIError("FORBIDDEN", {
          message:
            "OAuth client identity mirror (metadata.id_client_id) is missing",
        });
      }

      if (!resource) {
        throw new APIError("BAD_REQUEST", {
          error: "invalid_scope",
          error_description:
            "resource is required for client_credentials scopes",
        });
      }

      const clientReferenceId = await resolveOAuthClientReferenceId(
        env.DB,
        clientIdMirror,
      );
      const audienceSystem = audienceIsSystem(catalog, resource);
      const clientIsInfra = clientReferenceId === null;

      // Recheck D7 at issuance in case persisted data bypassed the structural write guard.
      if (clientIsInfra && audienceSystem === false) {
        throw new APIError("BAD_REQUEST", {
          error: "invalid_scope",
          error_description:
            "infrastructure client cannot obtain tenant-resource scopes",
        });
      }
      if (!clientIsInfra && audienceSystem === true) {
        throw new APIError("BAD_REQUEST", {
          error: "invalid_scope",
          error_description: "tenant client cannot obtain system scopes",
        });
      }

      await assertClientResourceScope({
        env,
        clientId: clientIdMirror,
        resource,
        scopes: productScopes,
        backgroundTaskRunner: runtime.backgroundTaskRunner,
      });

      const claims: Record<string, unknown> = {
        aud: resource,
        client_id: clientIdMirror,
      };
      if (!clientIsInfra) {
        claims.org_id = clientReferenceId;
      }
      return claims;
    },
    customTokenResponseFields: ({ grantType }) => ({
      grant_type: grantType,
    }),
  });
}

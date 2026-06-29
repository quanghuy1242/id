import { createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { readBody } from "../../../shared/request";
import { parseScopeValue, withProtocolScopes } from "./operations";
import type { IdOAuthProtocolScopesOptions } from "./types";

function pathMatches(ctx: { readonly path?: string }, suffix: string): boolean {
  return (
    typeof ctx.path === "string" &&
    (ctx.path === suffix || ctx.path.endsWith(suffix))
  );
}

function isCreateClientPath(ctx: { readonly path?: string }): boolean {
  return (
    pathMatches(ctx, "/oauth2/create-client") ||
    pathMatches(ctx, "/oauth2/admin/create-client") ||
    pathMatches(ctx, "/admin/oauth2/create-client")
  );
}

function isUpdateClientPath(ctx: { readonly path?: string }): boolean {
  return (
    pathMatches(ctx, "/oauth2/update-client") ||
    pathMatches(ctx, "/oauth2/admin/update-client") ||
    pathMatches(ctx, "/admin/oauth2/update-client")
  );
}

/**
 * Companion plugin to the BA OAuth provider that folds the always-available
 * OIDC protocol scopes (`authPluginConfig.oauthProtocolScopes`) into a client's
 * registered scope set whenever a client is created or its scopes updated.
 *
 * Better Auth validates an `/oauth2/authorize` request against the client's own
 * stored `scopes`, falling back to the provider's global scope set only when
 * the client has none. A client registered with resource scopes alone (e.g.
 * `content:read content:write content:share`) is therefore rejected with
 * `invalid_scope` the moment it requests `openid`/`offline_access`, even though
 * those scopes are globally available. Merging them in here keeps every
 * client's allow-list a superset of the universal protocol scopes without the
 * admin having to select them (they are not resource-bound catalog scopes).
 *
 * Runs as a `hooks.before` matcher on the create/update client paths: it
 * rewrites the `scope` (RFC 7591 string, create) or `update.scopes` (array,
 * update) on the request body before the provider persists the client.
 */
export const idOAuthProtocolScopes = (
  options: IdOAuthProtocolScopesOptions,
): BetterAuthPlugin => ({
  id: "id-oauth-protocol-scopes",
  hooks: {
    before: [
      {
        matcher: isCreateClientPath,
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const requested = parseScopeValue(body.scope);
          if (requested.length === 0) return;
          const merged = withProtocolScopes(requested, options.protocolScopes);
          return { context: { body: { ...body, scope: merged.join(" ") } } };
        }),
      },
      {
        matcher: isUpdateClientPath,
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const update =
            body.update && typeof body.update === "object"
              ? (body.update as Record<string, unknown>)
              : undefined;
          if (!update || !("scopes" in update)) return;
          const requested = parseScopeValue(update.scopes);
          if (requested.length === 0) return;
          const merged = withProtocolScopes(requested, options.protocolScopes);
          return {
            context: {
              body: { ...body, update: { ...update, scopes: merged } },
            },
          };
        }),
      },
    ],
  },
});

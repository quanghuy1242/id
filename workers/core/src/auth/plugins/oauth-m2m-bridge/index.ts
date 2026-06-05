import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  OAUTH_CLIENT_GRANT_TYPE_M2M,
  OAUTH_CLIENT_MODEL,
} from "../../../shared/constants";
import { readBody } from "../../../shared/request";
import { clientHasGrantType } from "./operations";
import type { OAuthClientRow, OAuthM2MBridgeAdapter } from "./types";

function pathMatches(ctx: { readonly path?: string }, suffix: string): boolean {
  return (
    typeof ctx.path === "string" &&
    (ctx.path === suffix || ctx.path.endsWith(suffix))
  );
}

/**
 * Companion plugin to the BA OAuth provider that enforces doc 018 §5.5 D5:
 * `oauthClient.referenceId` is immutable for `client_credentials` clients. Reassigning
 * a service-account client to a different organization is structurally a different
 * operation and must be done by recreating the client. The guard runs as a
 * `hooks.before` on every BA `update-client` path.
 */
export const idOAuthM2MBridge = (): BetterAuthPlugin => ({
  id: "id-oauth-m2m-bridge",
  hooks: {
    before: [
      {
        matcher: (ctx) =>
          pathMatches(ctx, "/oauth2/update-client") ||
          pathMatches(ctx, "/oauth2/admin/update-client") ||
          pathMatches(ctx, "/admin/oauth2/update-client"),
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const proposed =
            typeof body.reference_id === "string" || body.reference_id === null
              ? (body.reference_id as string | null | undefined)
              : undefined;
          if (proposed === undefined) return;
          const clientId =
            typeof body.client_id === "string" ? body.client_id : undefined;
          if (!clientId) return;

          const adapter = ctx.context
            .adapter as unknown as OAuthM2MBridgeAdapter;
          const client = await adapter.findOne<OAuthClientRow>({
            model: OAUTH_CLIENT_MODEL,
            where: [{ field: "clientId", value: clientId }],
          });
          if (!client) return;
          if (!clientHasGrantType(client, OAUTH_CLIENT_GRANT_TYPE_M2M)) return;
          if ((client.referenceId ?? null) === (proposed ?? null)) return;
          throw new APIError("CONFLICT", {
            error: "invalid_request",
            error_description:
              "reference_id is immutable for client_credentials clients; create a new client to relocate authority",
          });
        }),
      },
    ],
  },
});

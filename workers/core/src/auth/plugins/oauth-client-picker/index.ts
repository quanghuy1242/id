import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { OAUTH_CLIENT_MODEL } from "../../../shared/constants";
import { authPluginConfig, systemResourceServerAudience } from "../../config";
import { verifyScopedBearerToken } from "../../verify-scoped-bearer";
import {
  presentClientLookup,
  resolveResourceAccess,
  type OAuthClientRow,
  type PickerAdapter,
} from "./operations";
import type { OAuthClientPickerPluginOptions } from "./types";

export type { OAuthClientPickerPluginOptions } from "./types";

/**
 * Read-only OAuth client picker for M2M callers.
 *
 * Doc 018 §5.3 keeps BA's RFC 7592-shaped `/oauth2/get-client` as the canonical
 * shape; this wrapper exposes the same data over an M2M-token-authenticated path
 * (caller proves `aud = id-system audience` + `scope = oauth:clients:read`) and
 * requires the requested tenant context and applies isolation by
 * `client.referenceId` so a content-api admin cannot read clients owned by
 * another organization.
 *
 * Supplying `resource` adds advisory `resource_access` status for binding
 * reconciliation. The picker never returns `client_secret`; cross-org reads
 * return `404`.
 */
export const idOAuthClientPicker = (options: OAuthClientPickerPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-oauth-client-picker",
  endpoints: {
    lookupOAuthClient: createAuthEndpoint(
      "/admin/oauth-clients/lookup",
      { method: "GET" },
      async (ctx) => {
        const headers = ctx.request?.headers;
        if (!headers) throw new APIError("UNAUTHORIZED");
        const adapter = ctx.context.adapter as PickerAdapter;

        const audience = options.audience ?? systemResourceServerAudience(ctx.context.baseURL);
        await verifyScopedBearerToken({
          adapter,
          headers,
          issuer: options.issuer ?? ctx.context.baseURL,
          audience,
          scope: options.scope ?? authPluginConfig.systemOAuthClientPickerScope,
        });

        const query = (ctx.query ?? {}) as Record<string, unknown>;
        const clientId = typeof query.client_id === "string" ? query.client_id : undefined;
        const orgId = typeof query.org_id === "string" ? query.org_id : undefined;
        const resource = typeof query.resource === "string" && query.resource.length > 0
          ? query.resource
          : undefined;
        if (!clientId) {
          throw new APIError("BAD_REQUEST", {
            error: "invalid_request",
            error_description: "client_id query parameter is required",
          });
        }
        if (!orgId) {
          throw new APIError("BAD_REQUEST", {
            error: "invalid_request",
            error_description: "org_id query parameter is required",
          });
        }

        const row = await adapter.findOne<OAuthClientRow>({
          model: OAUTH_CLIENT_MODEL,
          where: [{ field: "clientId", value: clientId }],
        });
        if (!row) throw new APIError("NOT_FOUND");
        if (row.referenceId !== orgId) {
          // Doc 018 §9: return 404 rather than leaking the existence of the client.
          throw new APIError("NOT_FOUND");
        }
        const resourceAccess = resource
          ? await resolveResourceAccess(adapter, row.clientId, orgId, resource)
          : undefined;
        return ctx.json(presentClientLookup(row, resourceAccess));
      },
    ),
  },
});

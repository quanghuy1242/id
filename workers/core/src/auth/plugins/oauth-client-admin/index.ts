import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
  OAUTH_CLIENT_MODEL,
} from "../../../shared/constants";
import {
  listPublicOAuthClients,
  type OAuthClientQueryAdapter,
} from "../oauth-client-common";
import {
  assertClientListAccess,
  queryIds,
  queryNumber,
  queryString,
} from "./operations";
import {
  listOAuthClientsOpenApiSchema,
  oauthClientAdminEndpointMeta,
} from "./schema";
import type { OAuthClientAdminPluginOptions } from "./types";

export type { OAuthClientAdminPluginOptions } from "./types";

const listOAuthClientsMetadata = oauthClientAdminEndpointMeta({
  description:
    "List OAuth clients for admin UI typeahead without returning client secrets",
  responseSchema: listOAuthClientsOpenApiSchema,
  responseDescription: "Paginated OAuth client list",
});

/** Session-authenticated admin UI list/search endpoint for OAuth clients. */
export const idOAuthClientAdmin = (
  options: OAuthClientAdminPluginOptions = {},
): BetterAuthPlugin => ({
  id: "id-oauth-client-admin",
  endpoints: {
    listAdminOAuthClients: createAuthEndpoint(
      "/admin/oauth-clients",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listOAuthClientsMetadata,
      },
      async (ctx) => {
        const session = ctx.context.session;
        if (!session) throw new APIError("UNAUTHORIZED");

        const organizationId = queryString(ctx.query, "organizationId");
        await assertClientListAccess(
          options.authorize,
          organizationId ?? null,
          session.user.id,
          session.user.role,
          ctx.context.adapter,
        );

        const page = await listPublicOAuthClients(
          ctx.context.adapter as OAuthClientQueryAdapter,
          OAUTH_CLIENT_MODEL,
          {
            organizationId,
            q: queryString(ctx.query, "q"),
            limit: queryNumber(
              ctx.query,
              "limit",
              1,
              ADMIN_TYPEAHEAD_MAX_LIST_LIMIT,
            ),
            offset: queryNumber(
              ctx.query,
              "offset",
              0,
              Number.MAX_SAFE_INTEGER,
            ),
            ids: queryIds(ctx.query),
          },
        );
        return ctx.json(page);
      },
    ),
  },
});

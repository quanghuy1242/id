import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { OAUTH_CLIENT_MODEL } from "../../../shared/constants";
import { authPluginConfig, systemResourceServerAudience } from "../../config";
import { verifyScopedBearerToken } from "../../verify-scoped-bearer";
import type { OAuthClientPickerPluginOptions } from "./types";

export type { OAuthClientPickerPluginOptions } from "./types";

type OAuthClientRow = {
  readonly id: string;
  readonly clientId: string;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly grantTypes?: readonly string[] | string | null;
  readonly responseTypes?: readonly string[] | string | null;
  readonly redirectUris?: readonly string[] | string | null;
  readonly scopes?: readonly string[] | string | null;
  readonly tokenEndpointAuthMethod?: string | null;
  readonly referenceId?: string | null;
  readonly disabled?: boolean | null;
  readonly createdAt?: number | null;
};

type PickerAdapter = {
  readonly findOne: <T>(query: {
    model: string;
    where: { field: string; value: unknown }[];
  }) => Promise<T | null>;
  readonly findMany: <T>(query: { model: string }) => Promise<T[]>;
};

function parseList(value: OAuthClientRow["grantTypes"]): readonly string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((s): s is string => typeof s === "string");
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
      if (typeof parsed === "string") return parsed.split(" ").filter(Boolean);
    } catch {
      return value.split(" ").filter(Boolean);
    }
  }
  return [];
}

function publicClientFields(row: OAuthClientRow): Record<string, unknown> {
  return {
    client_id: row.clientId,
    client_name: row.name ?? null,
    type: row.type ?? null,
    grant_types: parseList(row.grantTypes),
    response_types: parseList(row.responseTypes),
    redirect_uris: parseList(row.redirectUris),
    scope: parseList(row.scopes).join(" "),
    token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? null,
    reference_id: row.referenceId ?? null,
    disabled: Boolean(row.disabled),
    created_at: row.createdAt ?? null,
  };
}

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
 * The picker never returns `client_secret`. Cross-org reads return `404`.
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
        return ctx.json(publicClientFields(row));
      },
    ),
  },
});
